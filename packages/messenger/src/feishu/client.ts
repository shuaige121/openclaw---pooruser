import * as Lark from "@larksuiteoapi/node-sdk";
import type { FeishuCredentials, FeishuDomain } from "./types.js";

const clientCache = new Map<
  string,
  {
    client: Lark.Client;
    config: { appId: string; appSecret: string; domain?: FeishuDomain };
  }
>();

function resolveDomain(domain: FeishuDomain | undefined): Lark.Domain | string {
  if (domain === "lark") {
    return Lark.Domain.Lark;
  }
  if (domain === "feishu" || !domain) {
    return Lark.Domain.Feishu;
  }
  return domain.replace(/\/+$/, "");
}

function cacheKey(creds: FeishuCredentials): string {
  return `${creds.appId}:${creds.domain ?? "feishu"}`;
}

export function createFeishuClient(creds: FeishuCredentials): Lark.Client {
  const key = cacheKey(creds);
  const { appId, appSecret, domain } = creds;

  if (!appId || !appSecret) {
    throw new Error("Feishu credentials (appId, appSecret) are required");
  }

  const cached = clientCache.get(key);
  if (
    cached &&
    cached.config.appId === appId &&
    cached.config.appSecret === appSecret &&
    cached.config.domain === domain
  ) {
    return cached.client;
  }

  const client = new Lark.Client({
    appId,
    appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveDomain(domain),
  });

  clientCache.set(key, {
    client,
    config: { appId, appSecret, domain },
  });

  return client;
}

export function clearFeishuClientCache(): void {
  clientCache.clear();
}
