import type { CronDeliveryMode, CronJob, CronMessageChannel } from "./types.js";

export type CronDeliveryPlan = {
  mode: CronDeliveryMode;
  channel: CronMessageChannel;
  to?: string;
  processModel?: string;
  processPrompt?: string;
  source: "delivery" | "payload";
  requested: boolean;
};

function normalizeChannel(value: unknown): CronMessageChannel | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  return trimmed as CronMessageChannel;
}

function normalizeTo(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveCronDeliveryPlan(job: CronJob): CronDeliveryPlan {
  const payload = job.payload.kind === "agentTurn" ? job.payload : null;
  const delivery = job.delivery;
  const hasDelivery = delivery && typeof delivery === "object";
  const rawMode = hasDelivery ? (delivery as { mode?: unknown }).mode : undefined;
  const normalizedMode = typeof rawMode === "string" ? rawMode.trim().toLowerCase() : rawMode;
  const mode =
    normalizedMode === "announce"
      ? "announce"
      : normalizedMode === "direct"
        ? "direct"
        : normalizedMode === "process"
          ? "process"
          : normalizedMode === "none"
            ? "none"
            : normalizedMode === "deliver"
              ? "announce"
              : undefined;

  const payloadChannel = normalizeChannel(payload?.channel);
  const payloadTo = normalizeTo(payload?.to);
  const deliveryChannel = normalizeChannel(
    (delivery as { channel?: unknown } | undefined)?.channel,
  );
  const deliveryTo = normalizeTo((delivery as { to?: unknown } | undefined)?.to);
  const processModel = normalizeTo(
    (delivery as { processModel?: unknown } | undefined)?.processModel,
  );
  const processPrompt = normalizeTo(
    (delivery as { processPrompt?: unknown } | undefined)?.processPrompt,
  );

  const channel = deliveryChannel ?? payloadChannel ?? "last";
  const to = deliveryTo ?? payloadTo;
  if (hasDelivery) {
    const resolvedMode = mode ?? "announce";
    return {
      mode: resolvedMode,
      channel,
      to,
      processModel,
      processPrompt,
      source: "delivery",
      requested:
        resolvedMode === "announce" || resolvedMode === "direct" || resolvedMode === "process",
    };
  }

  const legacyMode =
    payload?.deliver === true ? "explicit" : payload?.deliver === false ? "off" : "auto";
  const hasExplicitTarget = Boolean(to);
  const requested = legacyMode === "explicit" || (legacyMode === "auto" && hasExplicitTarget);

  return {
    mode: requested ? "announce" : "none",
    channel,
    to,
    source: "payload",
    requested,
  };
}
