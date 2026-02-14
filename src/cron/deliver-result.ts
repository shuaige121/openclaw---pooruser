import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ReplyPayload } from "../auto-reply/types.js";
import type { CliDeps } from "../cli/outbound-send-deps.js";
import type { OpenClawConfig } from "../config/config.js";
import type { OutboundChannel } from "../infra/outbound/targets.js";
import type { CronDeliveryPlan } from "./delivery.js";
import type { CronJob } from "./types.js";
import { resolveAgentDir, resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import {
  resolveAllowedModelRef,
  resolveConfiguredModelRef,
  type ModelRef,
} from "../agents/model-selection.js";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import { runSubagentAnnounceFlow } from "../agents/subagent-announce.js";
import { createOutboundSendDeps } from "../cli/outbound-send-deps.js";
import { resolveAgentMainSessionKey } from "../config/sessions.js";
import { deliverOutboundPayloads } from "../infra/outbound/deliver.js";
import { logWarn } from "../logger.js";
import { pickLastNonEmptyTextFromPayloads } from "./isolated-agent/helpers.js";

type CronDeliveryTarget = {
  channel: Exclude<OutboundChannel, "none">;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  mode: "explicit" | "implicit";
  error?: Error;
};

type ProcessModelResult = {
  text?: string;
  error?: string;
};

const DEFAULT_PROCESS_PROMPT = "Rewrite the following output as a concise plain-text update.";

function hasStructuredPayload(payloads: ReplyPayload[]) {
  return payloads.some(
    (payload) =>
      Boolean(payload.mediaUrl) ||
      (payload.mediaUrls?.length ?? 0) > 0 ||
      Object.keys(payload.channelData ?? {}).length > 0,
  );
}

function normalizePayloads(params: { payloads?: ReplyPayload[]; outputText?: string }) {
  if (Array.isArray(params.payloads) && params.payloads.length > 0) {
    return params.payloads;
  }
  const text = params.outputText?.trim();
  return text ? ([{ text }] satisfies ReplyPayload[]) : [];
}

function normalizeProcessPrompt(raw: string | undefined) {
  const trimmed = raw?.trim();
  return trimmed || DEFAULT_PROCESS_PROMPT;
}

async function resolveProcessModel(params: {
  cfg: OpenClawConfig;
  processModel?: string;
}): Promise<{ ref: ModelRef } | { error: string }> {
  const defaultRef = resolveConfiguredModelRef({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  const modelRaw = params.processModel?.trim();
  if (!modelRaw) {
    return { ref: defaultRef };
  }
  const catalog = await loadModelCatalog({ config: params.cfg });
  const resolved = resolveAllowedModelRef({
    cfg: params.cfg,
    catalog,
    raw: modelRaw,
    defaultProvider: defaultRef.provider,
    defaultModel: defaultRef.model,
  });
  if ("error" in resolved) {
    return { error: resolved.error };
  }
  return { ref: resolved.ref };
}

async function runProcessModel(params: {
  cfg: OpenClawConfig;
  agentId: string;
  jobId: string;
  processModel?: string;
  processPrompt?: string;
  outputText: string;
  timeoutMs: number;
}): Promise<ProcessModelResult> {
  const modelResolved = await resolveProcessModel({
    cfg: params.cfg,
    processModel: params.processModel,
  });
  if ("error" in modelResolved) {
    return { error: modelResolved.error };
  }

  const prompt =
    `${normalizeProcessPrompt(params.processPrompt)}\n\n---\n${params.outputText}`.trim();
  const sessionId = `cron-process-${params.jobId}-${crypto.randomUUID()}`;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-cron-process-"));
  const sessionFile = path.join(tempDir, `${sessionId}.jsonl`);
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, params.agentId);
  const agentDir = resolveAgentDir(params.cfg, params.agentId);

  try {
    await fs.mkdir(workspaceDir, { recursive: true });
    const result = await runEmbeddedPiAgent({
      sessionId,
      sessionKey: `cron:${params.jobId}:process`,
      agentId: params.agentId,
      sessionFile,
      workspaceDir,
      agentDir,
      config: params.cfg,
      prompt,
      provider: modelResolved.ref.provider,
      model: modelResolved.ref.model,
      timeoutMs: params.timeoutMs,
      runId: `cron-process-${crypto.randomUUID()}`,
      lane: "cron-process",
      thinkLevel: "off",
      reasoningLevel: "off",
      verboseLevel: "off",
      disableTools: true,
      disableMessageTool: true,
      requireExplicitMessageTarget: true,
    });
    const text = pickLastNonEmptyTextFromPayloads(result.payloads ?? []);
    return text?.trim()
      ? { text: text.trim() }
      : { error: "cron process model returned empty output" };
  } catch (err) {
    return { error: String(err) };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
      // best-effort temp cleanup
    });
  }
}

export async function deliverCronResult(params: {
  cfg: OpenClawConfig;
  deps: CliDeps;
  job: CronJob;
  agentId: string;
  deliveryPlan: CronDeliveryPlan;
  resolvedDelivery: CronDeliveryTarget;
  outputText?: string;
  payloads?: ReplyPayload[];
  timeoutMs: number;
  bestEffort?: boolean;
  announce: {
    childSessionKey: string;
    childRunId: string;
    startedAt?: number;
    endedAt?: number;
    requesterSessionKey?: string;
  };
}): Promise<{ delivered: boolean; error?: string }> {
  const bestEffort = params.bestEffort === true;
  const deliveryPayloads = normalizePayloads({
    payloads: params.payloads,
    outputText: params.outputText,
  });
  const synthesizedText =
    params.outputText?.trim() || pickLastNonEmptyTextFromPayloads(deliveryPayloads) || undefined;

  if (params.deliveryPlan.mode === "none") {
    return { delivered: false };
  }

  const targetError =
    params.resolvedDelivery.error?.message ||
    (!params.resolvedDelivery.to ? "cron delivery target is missing" : undefined);
  if (targetError) {
    if (!bestEffort) {
      return { delivered: false, error: targetError };
    }
    logWarn(`[cron:${params.job.id}] ${targetError}`);
    return { delivered: false };
  }

  const to = params.resolvedDelivery.to as string;
  const directDeliver = async (payloads: ReplyPayload[]) => {
    await deliverOutboundPayloads({
      cfg: params.cfg,
      channel: params.resolvedDelivery.channel,
      to,
      accountId: params.resolvedDelivery.accountId,
      threadId: params.resolvedDelivery.threadId,
      payloads,
      bestEffort,
      deps: createOutboundSendDeps(params.deps),
    });
  };

  try {
    switch (params.deliveryPlan.mode) {
      case "direct": {
        if (deliveryPayloads.length === 0) {
          return { delivered: false };
        }
        await directDeliver(deliveryPayloads);
        return { delivered: true };
      }
      case "process": {
        if (!synthesizedText) {
          return { delivered: false };
        }
        const processed = await runProcessModel({
          cfg: params.cfg,
          agentId: params.agentId,
          jobId: params.job.id,
          processModel: params.deliveryPlan.processModel,
          processPrompt: params.deliveryPlan.processPrompt,
          outputText: synthesizedText,
          timeoutMs: params.timeoutMs,
        });
        if (!processed.text) {
          if (!bestEffort) {
            return { delivered: false, error: processed.error ?? "cron process model failed" };
          }
          if (processed.error) {
            logWarn(`[cron:${params.job.id}] ${processed.error}`);
          }
          return { delivered: false };
        }
        await directDeliver([{ text: processed.text }]);
        return { delivered: true };
      }
      case "announce": {
        if (deliveryPayloads.length === 0 && !synthesizedText) {
          return { delivered: false };
        }
        if (deliveryPayloads.length > 0 && hasStructuredPayload(deliveryPayloads)) {
          await directDeliver(deliveryPayloads);
          return { delivered: true };
        }
        if (!synthesizedText) {
          return { delivered: false };
        }
        const requesterSessionKey =
          params.announce.requesterSessionKey ??
          resolveAgentMainSessionKey({
            cfg: params.cfg,
            agentId: params.agentId,
          });
        const taskLabel =
          typeof params.job.name === "string" && params.job.name.trim()
            ? params.job.name.trim()
            : `cron:${params.job.id}`;
        const didAnnounce = await runSubagentAnnounceFlow({
          childSessionKey: params.announce.childSessionKey,
          childRunId: params.announce.childRunId,
          requesterSessionKey,
          requesterOrigin: {
            channel: params.resolvedDelivery.channel,
            to,
            accountId: params.resolvedDelivery.accountId,
            threadId: params.resolvedDelivery.threadId,
          },
          requesterDisplayKey: requesterSessionKey,
          task: taskLabel,
          timeoutMs: params.timeoutMs,
          cleanup: "keep",
          roundOneReply: synthesizedText,
          waitForCompletion: false,
          startedAt: params.announce.startedAt,
          endedAt: params.announce.endedAt,
          outcome: { status: "ok" },
          announceType: "cron job",
        });
        if (!didAnnounce) {
          const error = "cron announce delivery failed";
          if (!bestEffort) {
            return { delivered: false, error };
          }
          logWarn(`[cron:${params.job.id}] ${error}`);
          return { delivered: false };
        }
        return { delivered: true };
      }
    }
  } catch (err) {
    const error = String(err);
    if (!bestEffort) {
      return { delivered: false, error };
    }
    logWarn(`[cron:${params.job.id}] ${error}`);
    return { delivered: false };
  }
}
