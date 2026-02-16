import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { telegramPlugin } from "../../extensions/telegram/src/channel.js";
import { setTelegramRuntime } from "../../extensions/telegram/src/runtime.js";
import { whatsappPlugin } from "../../extensions/whatsapp/src/channel.js";
import { setWhatsAppRuntime } from "../../extensions/whatsapp/src/runtime.js";
import * as replyModule from "../auto-reply/reply.js";
import { resolveMainSessionKey } from "../config/sessions.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createPluginRuntime } from "../plugins/runtime/index.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import { runHeartbeatOnce } from "./heartbeat-runner.js";

// Avoid pulling optional runtime deps during isolated runs.
vi.mock("jiti", () => ({ createJiti: () => () => ({}) }));

type SeedSessionInput = {
  lastChannel: string;
  lastTo: string;
  updatedAt?: number;
  totalTokens?: number;
};

async function withHeartbeatFixture(
  run: (ctx: {
    tmpDir: string;
    storePath: string;
    seedSession: (sessionKey: string, input: SeedSessionInput) => Promise<void>;
  }) => Promise<void>,
) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-hb-costguard-"));
  const storePath = path.join(tmpDir, "sessions.json");

  const seedSession = async (sessionKey: string, input: SeedSessionInput) => {
    const entry: Record<string, unknown> = {
      sessionId: "sid",
      updatedAt: input.updatedAt ?? Date.now(),
      lastChannel: input.lastChannel,
      lastTo: input.lastTo,
    };
    if (typeof input.totalTokens === "number") {
      entry.totalTokens = input.totalTokens;
    }
    await fs.writeFile(storePath, JSON.stringify({ [sessionKey]: entry }, null, 2));
  };

  try {
    await run({ tmpDir, storePath, seedSession });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

beforeEach(() => {
  const runtime = createPluginRuntime();
  setTelegramRuntime(runtime);
  setWhatsAppRuntime(runtime);
  setActivePluginRegistry(
    createTestRegistry([
      { pluginId: "whatsapp", plugin: whatsappPlugin, source: "test" },
      { pluginId: "telegram", plugin: telegramPlugin, source: "test" },
    ]),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runHeartbeatOnce – cost guard", () => {
  it("skips heartbeat when session totalTokens exceeds costGuard.maxContextTokens", async () => {
    await withHeartbeatFixture(async ({ tmpDir, storePath, seedSession }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: {
              every: "5m",
              target: "whatsapp",
              costGuard: { maxContextTokens: 80_000 },
            },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);
      await seedSession(sessionKey, {
        lastChannel: "whatsapp",
        lastTo: "+1555",
        totalTokens: 160_000,
      });

      const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK" });

      const result = await runHeartbeatOnce({
        cfg,
        deps: { getQueueSize: () => 0, nowMs: () => 0 },
      });

      expect(result).toStrictEqual({ status: "skipped", reason: "cost-guard" });
      expect(replySpy).not.toHaveBeenCalled();
    });
  });

  it("runs heartbeat normally when session totalTokens is below costGuard threshold", async () => {
    await withHeartbeatFixture(async ({ tmpDir, storePath, seedSession }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: {
              every: "5m",
              target: "whatsapp",
              costGuard: { maxContextTokens: 80_000 },
            },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);
      await seedSession(sessionKey, {
        lastChannel: "whatsapp",
        lastTo: "+1555",
        totalTokens: 40_000,
      });

      const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK" });

      const result = await runHeartbeatOnce({
        cfg,
        deps: { getQueueSize: () => 0, nowMs: () => 0 },
      });

      expect(result.status).toBe("ran");
      expect(replySpy).toHaveBeenCalledTimes(1);
    });
  });

  it("runs heartbeat normally when costGuard is not configured", async () => {
    await withHeartbeatFixture(async ({ tmpDir, storePath, seedSession }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: {
              every: "5m",
              target: "whatsapp",
            },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);
      await seedSession(sessionKey, {
        lastChannel: "whatsapp",
        lastTo: "+1555",
        totalTokens: 500_000,
      });

      const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK" });

      const result = await runHeartbeatOnce({
        cfg,
        deps: { getQueueSize: () => 0, nowMs: () => 0 },
      });

      expect(result.status).toBe("ran");
      expect(replySpy).toHaveBeenCalledTimes(1);
    });
  });

  it("runs heartbeat when session has no totalTokens (new session)", async () => {
    await withHeartbeatFixture(async ({ tmpDir, storePath, seedSession }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: {
              every: "5m",
              target: "whatsapp",
              costGuard: { maxContextTokens: 80_000 },
            },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);
      await seedSession(sessionKey, {
        lastChannel: "whatsapp",
        lastTo: "+1555",
      });

      const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK" });

      const result = await runHeartbeatOnce({
        cfg,
        deps: { getQueueSize: () => 0, nowMs: () => 0 },
      });

      expect(result.status).toBe("ran");
      expect(replySpy).toHaveBeenCalledTimes(1);
    });
  });

  it("skips at exactly the threshold boundary (totalTokens == maxContextTokens + 1)", async () => {
    await withHeartbeatFixture(async ({ tmpDir, storePath, seedSession }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: {
              every: "5m",
              target: "whatsapp",
              costGuard: { maxContextTokens: 80_000 },
            },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);
      await seedSession(sessionKey, {
        lastChannel: "whatsapp",
        lastTo: "+1555",
        totalTokens: 80_001,
      });

      const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK" });

      const result = await runHeartbeatOnce({
        cfg,
        deps: { getQueueSize: () => 0, nowMs: () => 0 },
      });

      expect(result).toStrictEqual({ status: "skipped", reason: "cost-guard" });
      expect(replySpy).not.toHaveBeenCalled();
    });
  });

  it("allows at exactly the threshold (totalTokens == maxContextTokens)", async () => {
    await withHeartbeatFixture(async ({ tmpDir, storePath, seedSession }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: {
              every: "5m",
              target: "whatsapp",
              costGuard: { maxContextTokens: 80_000 },
            },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);
      await seedSession(sessionKey, {
        lastChannel: "whatsapp",
        lastTo: "+1555",
        totalTokens: 80_000,
      });

      const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK" });

      const result = await runHeartbeatOnce({
        cfg,
        deps: { getQueueSize: () => 0, nowMs: () => 0 },
      });

      expect(result.status).toBe("ran");
      expect(replySpy).toHaveBeenCalledTimes(1);
    });
  });
});
