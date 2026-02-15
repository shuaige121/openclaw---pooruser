import type { OpenClawConfig } from "../config/config.js";
import type { TelegramAccountConfig } from "../config/types.js";
import { isTruthyEnvValue } from "../infra/env.js";
import { listBoundAccountIds, resolveDefaultAgentBoundAccountId } from "../routing/bindings.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
import { resolveTelegramToken } from "./token.js";

const debugAccounts = (...args: unknown[]) => {
  if (isTruthyEnvValue(process.env.OPENCLAW_DEBUG_TELEGRAM_ACCOUNTS)) {
    console.warn("[telegram:accounts]", ...args);
  }
};

export type ResolvedTelegramAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  token: string;
  tokenSource: "env" | "tokenFile" | "config" | "none";
  config: TelegramAccountConfig;
};

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = cfg.channels?.telegram?.accounts;
  if (!accounts || typeof accounts !== "object") {
    debugAccounts("configuredIds", { rawKeys: [], normalized: [] });
    return [];
  }
  const rawKeys = Object.keys(accounts).filter(Boolean);
  const ids = new Set<string>();
  for (const key of rawKeys) {
    ids.add(normalizeAccountId(key));
  }
  const normalized = [...ids];
  debugAccounts("configuredIds", { rawKeys, normalized });
  return normalized;
}

export function listTelegramAccountIds(cfg: OpenClawConfig): string[] {
  const configuredIds = listConfiguredAccountIds(cfg);
  const boundIds = listBoundAccountIds(cfg, "telegram");
  const ids = Array.from(new Set([...configuredIds, ...boundIds])).toSorted((a, b) =>
    a.localeCompare(b),
  );
  debugAccounts("listTelegramAccountIds", { configuredIds, boundIds, ids });
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids;
}

export function resolveDefaultTelegramAccountId(cfg: OpenClawConfig): string {
  const boundDefault = resolveDefaultAgentBoundAccountId(cfg, "telegram");
  if (boundDefault) {
    debugAccounts("resolveDefaultTelegramAccountId", {
      source: "binding",
      accountId: boundDefault,
    });
    return boundDefault;
  }
  const ids = listTelegramAccountIds(cfg);
  const resolved = ids.includes(DEFAULT_ACCOUNT_ID)
    ? DEFAULT_ACCOUNT_ID
    : (ids[0] ?? DEFAULT_ACCOUNT_ID);
  debugAccounts("resolveDefaultTelegramAccountId", {
    source: "list",
    accountIds: ids,
    accountId: resolved,
  });
  return resolved;
}

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): TelegramAccountConfig | undefined {
  const accounts = cfg.channels?.telegram?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  const direct = accounts[accountId] as TelegramAccountConfig | undefined;
  if (direct) {
    return direct;
  }
  const normalized = normalizeAccountId(accountId);
  const matchKey = Object.keys(accounts).find((key) => normalizeAccountId(key) === normalized);
  return matchKey ? (accounts[matchKey] as TelegramAccountConfig | undefined) : undefined;
}

function mergeTelegramAccountConfig(cfg: OpenClawConfig, accountId: string): TelegramAccountConfig {
  const { accounts: _ignored, ...base } = (cfg.channels?.telegram ??
    {}) as TelegramAccountConfig & { accounts?: unknown };
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

export function resolveTelegramAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedTelegramAccount {
  const hasExplicitAccountId = Boolean(params.accountId?.trim());
  const baseEnabled = params.cfg.channels?.telegram?.enabled !== false;

  const resolve = (accountId: string) => {
    const merged = mergeTelegramAccountConfig(params.cfg, accountId);
    const accountEnabled = merged.enabled !== false;
    const enabled = baseEnabled && accountEnabled;
    const tokenResolution = resolveTelegramToken(params.cfg, { accountId });
    debugAccounts("resolve", {
      accountId,
      enabled,
      tokenSource: tokenResolution.source,
    });
    return {
      accountId,
      enabled,
      name: merged.name?.trim() || undefined,
      token: tokenResolution.token,
      tokenSource: tokenResolution.source,
      config: merged,
    } satisfies ResolvedTelegramAccount;
  };

  const normalized = normalizeAccountId(params.accountId);
  const primary = resolve(normalized);
  debugAccounts("resolveTelegramAccount.primary", {
    requestedAccountId: params.accountId ?? null,
    normalizedAccountId: normalized,
    resolvedAccountId: primary.accountId,
    tokenSource: primary.tokenSource,
  });
  if (hasExplicitAccountId) {
    return primary;
  }
  if (primary.tokenSource !== "none") {
    return primary;
  }

  // If accountId is omitted, prefer a configured account token over failing on
  // the implicit "default" account. This keeps env-based setups working while
  // making config-only tokens work for things like heartbeats.
  const fallbackId = resolveDefaultTelegramAccountId(params.cfg);
  if (fallbackId === primary.accountId) {
    return primary;
  }
  const fallback = resolve(fallbackId);
  debugAccounts("resolveTelegramAccount.fallback", {
    fallbackAccountId: fallbackId,
    tokenSource: fallback.tokenSource,
  });
  if (fallback.tokenSource === "none") {
    return primary;
  }
  return fallback;
}

export function listEnabledTelegramAccounts(cfg: OpenClawConfig): ResolvedTelegramAccount[] {
  return listTelegramAccountIds(cfg)
    .map((accountId) => resolveTelegramAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
