import { type ApiClientOptions, Bot } from "grammy";
import type { TelegramCredentials } from "./types.js";
import { makeProxyFetch } from "./proxy.js";

export function createTelegramBot(creds: TelegramCredentials): Bot {
  const clientOptions = resolveTelegramClientOptions(creds);
  return new Bot(creds.token, clientOptions ? { client: clientOptions } : undefined);
}

export function resolveTelegramClientOptions(
  creds: TelegramCredentials,
): ApiClientOptions | undefined {
  const proxyUrl = creds.proxy?.url?.trim();
  const proxyFetch = proxyUrl ? makeProxyFetch(proxyUrl) : undefined;
  const timeoutSeconds =
    typeof creds.timeoutSeconds === "number" && Number.isFinite(creds.timeoutSeconds)
      ? Math.max(1, Math.floor(creds.timeoutSeconds))
      : undefined;

  if (!proxyFetch && !timeoutSeconds) {
    return undefined;
  }

  return {
    ...(proxyFetch ? { fetch: proxyFetch as unknown as ApiClientOptions["fetch"] } : {}),
    ...(timeoutSeconds ? { timeoutSeconds } : {}),
  };
}
