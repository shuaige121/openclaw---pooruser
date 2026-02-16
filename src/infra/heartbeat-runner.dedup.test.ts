import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { whatsappPlugin } from "../../extensions/whatsapp/src/channel.js";
import { setWhatsAppRuntime } from "../../extensions/whatsapp/src/runtime.js";
import * as replyModule from "../auto-reply/reply.js";
import { resolveMainSessionKey } from "../config/sessions.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createPluginRuntime } from "../plugins/runtime/index.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import { runHeartbeatOnce } from "./heartbeat-runner.js";

vi.mock("jiti", () => ({ createJiti: () => () => ({}) }));

let tmpDir: string;
let storePath: string;
let replySpy: ReturnType<typeof vi.spyOn>;
let sendWhatsApp: ReturnType<typeof vi.fn>;

beforeEach(() => {
  const runtime = createPluginRuntime();
  setWhatsAppRuntime(runtime);
  setActivePluginRegistry(
    createTestRegistry([{ pluginId: "whatsapp", plugin: whatsappPlugin, source: "test" }]),
  );
});

async function setup() {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-hb-dedup-"));
  storePath = path.join(tmpDir, "sessions.json");
  replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
  sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" });
}

async function teardown() {
  replySpy.mockRestore();
  await fs.rm(tmpDir, { recursive: true, force: true });
}

function makeCfg(): OpenClawConfig {
  return {
    agents: {
      defaults: {
        workspace: tmpDir,
        heartbeat: { every: "5m", target: "whatsapp" },
      },
    },
    channels: { whatsapp: { allowFrom: ["*"] } },
    session: { store: storePath },
  };
}

async function writeSession(cfg: OpenClawConfig, extra?: Record<string, unknown>) {
  const sessionKey = resolveMainSessionKey(cfg);
  await fs.writeFile(
    storePath,
    JSON.stringify(
      {
        [sessionKey]: {
          sessionId: "sid",
          updatedAt: Date.now(),
          lastChannel: "whatsapp",
          lastProvider: "whatsapp",
          lastTo: "+1555",
          ...extra,
        },
      },
      null,
      2,
    ),
  );
}

function deps(nowMs?: number) {
  return {
    sendWhatsApp,
    getQueueSize: () => 0,
    nowMs: () => nowMs ?? Date.now(),
    webAuthExists: async () => true,
    hasActiveWebListener: () => true,
  };
}

// A prefix that is >100 chars so we can append different suffixes
// and still have the first 100 chars match.
const LONG_PREFIX =
  "OAuth token for Google Calendar has expired. Please re-authorize your account at https://accounts.google.com/o/oauth2";

describe("heartbeat dedup", () => {
  it("suppresses duplicate when first 100 chars match within cooldown", async () => {
    await setup();
    try {
      const cfg = makeCfg();
      const now = Date.now();

      await writeSession(cfg, {
        lastHeartbeatText: LONG_PREFIX + " — visit Settings to fix this issue.",
        lastHeartbeatSentAt: now - 30 * 60 * 1000, // 30 min ago
      });

      replySpy.mockResolvedValue({
        text: LONG_PREFIX + " — you can fix this in the app settings.",
      });
      await runHeartbeatOnce({ cfg, deps: deps(now) });

      expect(sendWhatsApp).not.toHaveBeenCalled();
    } finally {
      await teardown();
    }
  });

  it("delivers when first 100 chars differ", async () => {
    await setup();
    try {
      const cfg = makeCfg();
      const now = Date.now();

      await writeSession(cfg, {
        lastHeartbeatText: "OAuth token for Google Calendar has expired.",
        lastHeartbeatSentAt: now - 30 * 60 * 1000,
      });

      replySpy.mockResolvedValue({
        text: "New task added to your calendar: Team standup at 10am.",
      });
      await runHeartbeatOnce({ cfg, deps: deps(now) });

      expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    } finally {
      await teardown();
    }
  });

  it("delivers after cooldown expires even if text matches exactly", async () => {
    await setup();
    try {
      const cfg = makeCfg();
      const now = Date.now();
      const SEVEN_HOURS_MS = 7 * 60 * 60 * 1000;
      const msg = "OAuth token for Google Calendar has expired. Please re-authorize.";

      await writeSession(cfg, {
        lastHeartbeatText: msg,
        lastHeartbeatSentAt: now - SEVEN_HOURS_MS, // 7 hours ago — past 6h cooldown
      });

      replySpy.mockResolvedValue({ text: msg });
      await runHeartbeatOnce({ cfg, deps: deps(now) });

      expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    } finally {
      await teardown();
    }
  });

  it("does not suppress when no previous heartbeat exists", async () => {
    await setup();
    try {
      const cfg = makeCfg();
      await writeSession(cfg);

      replySpy.mockResolvedValue({
        text: "OAuth token for Google Calendar has expired.",
      });
      await runHeartbeatOnce({ cfg, deps: deps() });

      expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    } finally {
      await teardown();
    }
  });

  it("suppresses exact duplicate within cooldown", async () => {
    await setup();
    try {
      const cfg = makeCfg();
      const now = Date.now();
      const msg = "Your server disk usage is at 95%.";

      await writeSession(cfg, {
        lastHeartbeatText: msg,
        lastHeartbeatSentAt: now - 2 * 60 * 60 * 1000, // 2 hours ago
      });

      replySpy.mockResolvedValue({ text: msg });
      await runHeartbeatOnce({ cfg, deps: deps(now) });

      expect(sendWhatsApp).not.toHaveBeenCalled();
    } finally {
      await teardown();
    }
  });

  it("delivers just after 6h cooldown boundary", async () => {
    await setup();
    try {
      const cfg = makeCfg();
      const now = Date.now();
      const msg = "Your server disk usage is at 95%.";
      const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

      await writeSession(cfg, {
        lastHeartbeatText: msg,
        lastHeartbeatSentAt: now - SIX_HOURS_MS - 1, // just past 6h
      });

      replySpy.mockResolvedValue({ text: msg });
      await runHeartbeatOnce({ cfg, deps: deps(now) });

      expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    } finally {
      await teardown();
    }
  });
});
