import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { telegramPlugin } from "../../extensions/telegram/src/channel.js";
import { setTelegramRuntime } from "../../extensions/telegram/src/runtime.js";
import { whatsappPlugin } from "../../extensions/whatsapp/src/channel.js";
import { setWhatsAppRuntime } from "../../extensions/whatsapp/src/runtime.js";
import * as replyModule from "../auto-reply/reply.js";
import { loadSessionStore, resolveMainSessionKey } from "../config/sessions.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createPluginRuntime } from "../plugins/runtime/index.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import { HEARTBEAT_CONTEXT_RESET_THRESHOLD, runHeartbeatOnce } from "./heartbeat-runner.js";

// Avoid pulling optional runtime deps during isolated runs.
vi.mock("jiti", () => ({ createJiti: () => () => ({}) }));

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

describe("heartbeat session context reset", () => {
  it("resets session when totalTokens exceeds threshold after HEARTBEAT_OK", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-hb-reset-"));
    const storePath = path.join(tmpDir, "sessions.json");
    const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
    try {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: { every: "5m", target: "whatsapp" },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);

      // Set up a bloated session (totalTokens > threshold)
      const originalSessionId = "sid-bloated";
      await fs.writeFile(
        storePath,
        JSON.stringify(
          {
            [sessionKey]: {
              sessionId: originalSessionId,
              updatedAt: Date.now(),
              lastChannel: "whatsapp",
              lastTo: "+1555",
              totalTokens: HEARTBEAT_CONTEXT_RESET_THRESHOLD + 10_000,
              inputTokens: 5000,
              outputTokens: 2000,
              contextTokens: HEARTBEAT_CONTEXT_RESET_THRESHOLD,
              compactionCount: 3,
            },
          },
          null,
          2,
        ),
      );

      // Return HEARTBEAT_OK (triggers ok-token path)
      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK" });
      const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" });

      await runHeartbeatOnce({
        cfg,
        deps: {
          sendWhatsApp,
          getQueueSize: () => 0,
          nowMs: () => 0,
          webAuthExists: async () => true,
          hasActiveWebListener: () => true,
        },
      });

      // Verify session was reset
      const store = loadSessionStore(storePath);
      const entry = store[sessionKey];
      expect(entry).toBeDefined();
      expect(entry.sessionId).not.toBe(originalSessionId);
      expect(entry.totalTokens).toBeUndefined();
      expect(entry.inputTokens).toBeUndefined();
      expect(entry.outputTokens).toBeUndefined();
      expect(entry.contextTokens).toBeUndefined();
      expect(entry.compactionCount).toBe(0);
    } finally {
      replySpy.mockRestore();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not reset session when totalTokens is below threshold", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-hb-noreset-"));
    const storePath = path.join(tmpDir, "sessions.json");
    const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
    try {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: { every: "5m", target: "whatsapp" },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);

      // Set up a small session (totalTokens < threshold)
      const originalSessionId = "sid-small";
      await fs.writeFile(
        storePath,
        JSON.stringify(
          {
            [sessionKey]: {
              sessionId: originalSessionId,
              updatedAt: Date.now(),
              lastChannel: "whatsapp",
              lastTo: "+1555",
              totalTokens: 10_000,
              inputTokens: 3000,
              outputTokens: 1000,
              contextTokens: 6000,
              compactionCount: 1,
            },
          },
          null,
          2,
        ),
      );

      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK" });
      const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" });

      await runHeartbeatOnce({
        cfg,
        deps: {
          sendWhatsApp,
          getQueueSize: () => 0,
          nowMs: () => 0,
          webAuthExists: async () => true,
          hasActiveWebListener: () => true,
        },
      });

      // Verify session was NOT reset
      const store = loadSessionStore(storePath);
      const entry = store[sessionKey];
      expect(entry).toBeDefined();
      expect(entry.sessionId).toBe(originalSessionId);
      expect(entry.compactionCount).toBe(1);
    } finally {
      replySpy.mockRestore();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not reset session when heartbeat produces actionable reply", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-hb-action-"));
    const storePath = path.join(tmpDir, "sessions.json");
    const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
    try {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: { every: "5m", target: "whatsapp" },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);

      // Set up a bloated session
      const originalSessionId = "sid-bloated-action";
      await fs.writeFile(
        storePath,
        JSON.stringify(
          {
            [sessionKey]: {
              sessionId: originalSessionId,
              updatedAt: Date.now(),
              lastChannel: "whatsapp",
              lastTo: "+1555",
              totalTokens: HEARTBEAT_CONTEXT_RESET_THRESHOLD + 50_000,
              compactionCount: 5,
            },
          },
          null,
          2,
        ),
      );

      // Return actionable reply (not HEARTBEAT_OK)
      replySpy.mockResolvedValue({ text: "Alert: server disk is 95% full" });
      const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" });

      await runHeartbeatOnce({
        cfg,
        deps: {
          sendWhatsApp,
          getQueueSize: () => 0,
          nowMs: () => 0,
          webAuthExists: async () => true,
          hasActiveWebListener: () => true,
        },
      });

      // Verify session was NOT reset (actionable replies should keep context)
      const store = loadSessionStore(storePath);
      const entry = store[sessionKey];
      expect(entry).toBeDefined();
      expect(entry.sessionId).toBe(originalSessionId);
    } finally {
      replySpy.mockRestore();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("resets session on ok-empty path when bloated", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-hb-empty-"));
    const storePath = path.join(tmpDir, "sessions.json");
    const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
    try {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: { every: "5m", target: "whatsapp" },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);

      const originalSessionId = "sid-bloated-empty";
      await fs.writeFile(
        storePath,
        JSON.stringify(
          {
            [sessionKey]: {
              sessionId: originalSessionId,
              updatedAt: Date.now(),
              lastChannel: "whatsapp",
              lastTo: "+1555",
              totalTokens: HEARTBEAT_CONTEXT_RESET_THRESHOLD + 20_000,
              compactionCount: 2,
            },
          },
          null,
          2,
        ),
      );

      // Return empty reply (triggers ok-empty path)
      replySpy.mockResolvedValue({ text: "" });
      const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" });

      await runHeartbeatOnce({
        cfg,
        deps: {
          sendWhatsApp,
          getQueueSize: () => 0,
          nowMs: () => 0,
          webAuthExists: async () => true,
          hasActiveWebListener: () => true,
        },
      });

      // Verify session was reset
      const store = loadSessionStore(storePath);
      const entry = store[sessionKey];
      expect(entry).toBeDefined();
      expect(entry.sessionId).not.toBe(originalSessionId);
      expect(entry.totalTokens).toBeUndefined();
      expect(entry.compactionCount).toBe(0);
    } finally {
      replySpy.mockRestore();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("preserves delivery fields (lastChannel, lastTo, lastHeartbeatText) after reset", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-hb-preserve-"));
    const storePath = path.join(tmpDir, "sessions.json");
    const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
    try {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: { every: "5m", target: "whatsapp" },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);

      await fs.writeFile(
        storePath,
        JSON.stringify(
          {
            [sessionKey]: {
              sessionId: "sid-preserve",
              updatedAt: Date.now(),
              lastChannel: "whatsapp",
              lastTo: "+1555",
              lastHeartbeatText: "prev alert",
              lastHeartbeatSentAt: 12345,
              totalTokens: HEARTBEAT_CONTEXT_RESET_THRESHOLD + 30_000,
              compactionCount: 4,
            },
          },
          null,
          2,
        ),
      );

      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK" });
      const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" });

      await runHeartbeatOnce({
        cfg,
        deps: {
          sendWhatsApp,
          getQueueSize: () => 0,
          nowMs: () => 0,
          webAuthExists: async () => true,
          hasActiveWebListener: () => true,
        },
      });

      // Verify delivery fields are preserved after reset
      const store = loadSessionStore(storePath);
      const entry = store[sessionKey];
      expect(entry).toBeDefined();
      expect(entry.sessionId).not.toBe("sid-preserve");
      expect(entry.lastChannel).toBe("whatsapp");
      expect(entry.lastTo).toBe("+1555");
      // lastHeartbeatText/SentAt are preserved because updateSessionStoreEntry merges
      expect(entry.lastHeartbeatText).toBe("prev alert");
    } finally {
      replySpy.mockRestore();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
