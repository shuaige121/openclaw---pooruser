import type { AgentDefaultsConfig } from "../../config/types.js";
import {
  DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  resolveHeartbeatPrompt as resolveHeartbeatPromptText,
  stripHeartbeatToken,
} from "../../auto-reply/heartbeat.js";
import { truncateUtf16Safe } from "../../utils.js";

type DeliveryPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  channelData?: Record<string, unknown>;
};

type HeartbeatConfigWithTools = NonNullable<AgentDefaultsConfig["heartbeat"]> & {
  tools?: AgentDefaultsConfig["tools"];
};

export function pickSummaryFromOutput(text: string | undefined) {
  const clean = (text ?? "").trim();
  if (!clean) {
    return undefined;
  }
  const limit = 2000;
  return clean.length > limit ? `${truncateUtf16Safe(clean, limit)}…` : clean;
}

export function pickSummaryFromPayloads(payloads: Array<{ text?: string | undefined }>) {
  for (let i = payloads.length - 1; i >= 0; i--) {
    const summary = pickSummaryFromOutput(payloads[i]?.text);
    if (summary) {
      return summary;
    }
  }
  return undefined;
}

export function pickLastNonEmptyTextFromPayloads(payloads: Array<{ text?: string | undefined }>) {
  for (let i = payloads.length - 1; i >= 0; i--) {
    const clean = (payloads[i]?.text ?? "").trim();
    if (clean) {
      return clean;
    }
  }
  return undefined;
}

export function pickLastDeliverablePayload(payloads: DeliveryPayload[]) {
  for (let i = payloads.length - 1; i >= 0; i--) {
    const payload = payloads[i];
    const text = (payload?.text ?? "").trim();
    const hasMedia = Boolean(payload?.mediaUrl) || (payload?.mediaUrls?.length ?? 0) > 0;
    const hasChannelData = Object.keys(payload?.channelData ?? {}).length > 0;
    if (text || hasMedia || hasChannelData) {
      return payload;
    }
  }
  return undefined;
}

/**
 * Check if all payloads are just heartbeat ack responses (HEARTBEAT_OK).
 * Returns true if delivery should be skipped because there's no real content.
 */
export function isHeartbeatOnlyResponse(payloads: DeliveryPayload[], ackMaxChars: number) {
  if (payloads.length === 0) {
    return true;
  }
  return payloads.every((payload) => {
    // If there's media, we should deliver regardless of text content.
    const hasMedia = (payload.mediaUrls?.length ?? 0) > 0 || Boolean(payload.mediaUrl);
    if (hasMedia) {
      return false;
    }
    // Use heartbeat mode to check if text is just HEARTBEAT_OK or short ack.
    const result = stripHeartbeatToken(payload.text, {
      mode: "heartbeat",
      maxAckChars: ackMaxChars,
    });
    return result.shouldSkip;
  });
}

export function resolveHeartbeatAckMaxChars(agentCfg?: { heartbeat?: { ackMaxChars?: number } }) {
  const raw = agentCfg?.heartbeat?.ackMaxChars ?? DEFAULT_HEARTBEAT_ACK_MAX_CHARS;
  return Math.max(0, raw);
}

function isHeartbeatSessionKey(sessionKey: string | undefined) {
  const normalized = (sessionKey ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized === "heartbeat" ||
    normalized.startsWith("heartbeat:") ||
    normalized.includes(":heartbeat")
  );
}

function isHeartbeatMessage(message: string | undefined, heartbeatPrompt: string) {
  const normalized = (message ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const prompt = heartbeatPrompt.trim().toLowerCase();
  if (prompt && normalized === prompt) {
    return true;
  }
  return normalized.startsWith("read heartbeat.md");
}

function resolveHeartbeatToolsOverride(heartbeat: HeartbeatConfigWithTools | undefined) {
  const tools = heartbeat?.tools;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) {
    return undefined;
  }
  return tools;
}

export function resolveHeartbeatRunOverrides(params: {
  agentCfg?: AgentDefaultsConfig;
  message?: string;
  sessionKey?: string;
}): {
  isHeartbeat: boolean;
  model?: string;
  tools?: AgentDefaultsConfig["tools"];
} {
  const heartbeat = params.agentCfg?.heartbeat as HeartbeatConfigWithTools | undefined;
  const heartbeatPrompt = resolveHeartbeatPromptText(heartbeat?.prompt);
  const isHeartbeat =
    isHeartbeatSessionKey(params.sessionKey) || isHeartbeatMessage(params.message, heartbeatPrompt);
  if (!isHeartbeat) {
    return { isHeartbeat: false };
  }
  const model = heartbeat?.model?.trim();
  return {
    isHeartbeat: true,
    model: model ? model : undefined,
    tools: resolveHeartbeatToolsOverride(heartbeat),
  };
}
