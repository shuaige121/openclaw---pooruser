import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CronService } from "./service.js";

const noopLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

async function makeStorePath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-cron-script-"));
  return {
    storePath: path.join(dir, "cron", "jobs.json"),
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

describe("CronService script jobs", () => {
  it("executes script payloads without invoking isolated agent jobs", async () => {
    const store = await makeStorePath();
    const runIsolatedAgentJob = vi.fn(async () => ({ status: "ok" as const }));
    const cron = new CronService({
      cronEnabled: true,
      storePath: store.storePath,
      log: noopLogger,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob,
    });
    try {
      await cron.start();
      const job = await cron.add({
        name: "script-ok",
        schedule: { kind: "every", everyMs: 60_000, anchorMs: Date.now() },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        payload: { kind: "script", command: `printf "hello"` },
        delivery: { mode: "none" },
      });

      const run = await cron.run(job.id, "force");
      expect(run).toEqual({ ok: true, ran: true });
      expect(runIsolatedAgentJob).not.toHaveBeenCalled();

      const jobs = await cron.list({ includeDisabled: true });
      const updated = jobs.find((entry) => entry.id === job.id);
      expect(updated?.state.lastStatus).toBe("ok");
      expect(updated?.state.lastError).toBeUndefined();
    } finally {
      cron.stop();
      await store.cleanup();
    }
  });

  it("fails non-best-effort script delivery when gateway runtime deps are unavailable", async () => {
    const store = await makeStorePath();
    const cron = new CronService({
      cronEnabled: true,
      storePath: store.storePath,
      log: noopLogger,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" as const })),
    });
    try {
      await cron.start();
      const job = await cron.add({
        name: "script-direct-missing-runtime",
        schedule: { kind: "every", everyMs: 60_000, anchorMs: Date.now() },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        payload: { kind: "script", command: `printf "hello"` },
        delivery: { mode: "direct", channel: "telegram", to: "123" },
      });

      const run = await cron.run(job.id, "force");
      expect(run).toEqual({ ok: true, ran: true });

      const jobs = await cron.list({ includeDisabled: true });
      const updated = jobs.find((entry) => entry.id === job.id);
      expect(updated?.state.lastStatus).toBe("error");
      expect(updated?.state.lastError).toContain(
        "cron script delivery requires gateway runtime deps",
      );
    } finally {
      cron.stop();
      await store.cleanup();
    }
  });

  it("keeps script jobs successful when direct delivery is best-effort without runtime deps", async () => {
    const store = await makeStorePath();
    const cron = new CronService({
      cronEnabled: true,
      storePath: store.storePath,
      log: noopLogger,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" as const })),
    });
    try {
      await cron.start();
      const job = await cron.add({
        name: "script-direct-best-effort",
        schedule: { kind: "every", everyMs: 60_000, anchorMs: Date.now() },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        payload: { kind: "script", command: `printf "hello"` },
        delivery: { mode: "direct", channel: "telegram", to: "123", bestEffort: true },
      });

      const run = await cron.run(job.id, "force");
      expect(run).toEqual({ ok: true, ran: true });

      const jobs = await cron.list({ includeDisabled: true });
      const updated = jobs.find((entry) => entry.id === job.id);
      expect(updated?.state.lastStatus).toBe("ok");
      expect(updated?.state.lastError).toBeUndefined();
    } finally {
      cron.stop();
      await store.cleanup();
    }
  });
});
