import { type DeliveryContext, normalizeDeliveryContext } from "../utils/delivery-context.js";

export const SUBAGENT_ANNOUNCE_CHANNEL_CONTRACT = "subagent_announce_channel" as const;
export const SUBAGENT_ANNOUNCE_CHANNEL_CONTRACT_VERSION = 1 as const;

export type SubagentAnnounceChannelContract = {
  contract: typeof SUBAGENT_ANNOUNCE_CHANNEL_CONTRACT;
  version: typeof SUBAGENT_ANNOUNCE_CHANNEL_CONTRACT_VERSION;
  requesterSessionKey: string;
  requesterDisplayKey: string;
  requesterOrigin?: DeliveryContext;
};

export type SubagentAnnounceChannelContractInput = {
  contract?: unknown;
  version?: unknown;
  requesterSessionKey?: unknown;
  requesterDisplayKey?: unknown;
  requesterOrigin?: unknown;
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function createSubagentAnnounceChannelContract(params: {
  requesterSessionKey: string;
  requesterDisplayKey?: string;
  requesterOrigin?: DeliveryContext;
}): SubagentAnnounceChannelContract {
  const requesterSessionKey = params.requesterSessionKey.trim();
  const requesterDisplayKey = params.requesterDisplayKey?.trim() || requesterSessionKey;
  return {
    contract: SUBAGENT_ANNOUNCE_CHANNEL_CONTRACT,
    version: SUBAGENT_ANNOUNCE_CHANNEL_CONTRACT_VERSION,
    requesterSessionKey,
    requesterDisplayKey,
    requesterOrigin: normalizeDeliveryContext(params.requesterOrigin),
  };
}

export function normalizeSubagentAnnounceChannelContract(
  value?: SubagentAnnounceChannelContract | SubagentAnnounceChannelContractInput,
): SubagentAnnounceChannelContract | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const requesterSessionKey = normalizeString(value.requesterSessionKey);
  if (!requesterSessionKey) {
    return undefined;
  }
  const requesterDisplayKey = normalizeString(value.requesterDisplayKey) ?? requesterSessionKey;
  const requesterOrigin = normalizeDeliveryContext(value.requesterOrigin as DeliveryContext);
  return {
    contract: SUBAGENT_ANNOUNCE_CHANNEL_CONTRACT,
    version: SUBAGENT_ANNOUNCE_CHANNEL_CONTRACT_VERSION,
    requesterSessionKey,
    requesterDisplayKey,
    requesterOrigin,
  };
}

export const SUBAGENT_ANNOUNCE_RESULT_CONTRACT = "subagent_announce_result" as const;
export const SUBAGENT_ANNOUNCE_RESULT_CONTRACT_VERSION = 1 as const;

export type SubagentAnnounceResultStatus = "ok" | "error" | "timeout" | "unknown";

export type SubagentAnnounceResultContract = {
  contract: typeof SUBAGENT_ANNOUNCE_RESULT_CONTRACT;
  version: typeof SUBAGENT_ANNOUNCE_RESULT_CONTRACT_VERSION;
  announceType: "subagent task" | "cron job";
  task: string;
  status: SubagentAnnounceResultStatus;
  statusLabel: string;
  findings: string;
  stats: string;
  childSessionKey: string;
  childRunId: string;
  error?: string;
};

export function buildSubagentAnnounceResultContract(params: {
  announceType: "subagent task" | "cron job";
  task: string;
  status: SubagentAnnounceResultStatus;
  statusLabel: string;
  findings: string;
  stats: string;
  childSessionKey: string;
  childRunId: string;
  error?: string;
}): SubagentAnnounceResultContract {
  return {
    contract: SUBAGENT_ANNOUNCE_RESULT_CONTRACT,
    version: SUBAGENT_ANNOUNCE_RESULT_CONTRACT_VERSION,
    announceType: params.announceType,
    task: params.task,
    status: params.status,
    statusLabel: params.statusLabel,
    findings: params.findings,
    stats: params.stats,
    childSessionKey: params.childSessionKey,
    childRunId: params.childRunId,
    error: params.error?.trim() || undefined,
  };
}
