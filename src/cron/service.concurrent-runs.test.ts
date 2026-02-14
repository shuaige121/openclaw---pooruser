import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { CronService } from "./service.js";

const noopLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

async function makeStorePath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-cron-concurrency-"));
  return {
    storePath: path.join(dir, "cron", "jobs.json"),
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

async function waitFor(predicate: () => boolean | Promise<boolean>, attempts = 60, sleepMs = 20) {
  for (let i = 0; i < attempts; i += 1) {
    if (await predicate()) {
      return true;
    }
    await delay(sleepMs);
  }
  return false;
}

describe("CronService maxConcurrentRuns", () => {
  it("runs due isolated jobs in parallel when maxConcurrentRuns > 1", async () => {
    const store = await makeStorePath();
    const pending: Array<() => void> = [];
    const runIsolatedAgentJob = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        pending.push(resolve);
      });
      return { status: "ok" as const, summary: "ok" };
    });

    const cron = new CronService({
      cronEnabled: true,
      cronConfig: { maxConcurrentRuns: 2 },
      storePath: store.storePath,
      log: noopLogger,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob,
    });

    try {
      await cron.start();
      const runAt = Date.now() + 50;
      const atIso = new Date(runAt).toISOString();

      await cron.add({
        name: "parallel-1",
        schedule: { kind: "at", at: atIso },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        deleteAfterRun: false,
        payload: { kind: "agentTurn", message: "job-1" },
        delivery: { mode: "none" },
      });
      await cron.add({
        name: "parallel-2",
        schedule: { kind: "at", at: atIso },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        deleteAfterRun: false,
        payload: { kind: "agentTurn", message: "job-2" },
        delivery: { mode: "none" },
      });

      const bothStarted = await waitFor(() => runIsolatedAgentJob.mock.calls.length >= 2, 50, 20);
      expect(bothStarted).toBe(true);
      expect(runIsolatedAgentJob).toHaveBeenCalledTimes(2);

      for (const resolve of pending.splice(0)) {
        resolve();
      }

      const allFinished = await waitFor(async () => {
        const jobs = await cron.list({ includeDisabled: true });
        const statuses = jobs.map((job) => job.state.lastStatus);
        return statuses.length === 2 && statuses.every((status) => status === "ok");
      });
      expect(allFinished).toBe(true);
    } finally {
      for (const resolve of pending.splice(0)) {
        resolve();
      }
      cron.stop();
      await store.cleanup();
    }
  });

  it("keeps due isolated jobs serialized by default", async () => {
    const store = await makeStorePath();
    const pending: Array<() => void> = [];
    const runIsolatedAgentJob = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        pending.push(resolve);
      });
      return { status: "ok" as const, summary: "ok" };
    });

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
      const runAt = Date.now() + 50;
      const atIso = new Date(runAt).toISOString();

      await cron.add({
        name: "serial-1",
        schedule: { kind: "at", at: atIso },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        deleteAfterRun: false,
        payload: { kind: "agentTurn", message: "job-1" },
        delivery: { mode: "none" },
      });
      await cron.add({
        name: "serial-2",
        schedule: { kind: "at", at: atIso },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        deleteAfterRun: false,
        payload: { kind: "agentTurn", message: "job-2" },
        delivery: { mode: "none" },
      });

      const firstStarted = await waitFor(() => runIsolatedAgentJob.mock.calls.length >= 1);
      expect(firstStarted).toBe(true);
      expect(runIsolatedAgentJob).toHaveBeenCalledTimes(1);

      // While the first run is blocked, default mode should not start a second run.
      await delay(120);
      expect(runIsolatedAgentJob).toHaveBeenCalledTimes(1);

      const first = pending.shift();
      first?.();

      const secondStarted = await waitFor(() => runIsolatedAgentJob.mock.calls.length >= 2);
      expect(secondStarted).toBe(true);
      const second = pending.shift();
      second?.();

      const allFinished = await waitFor(async () => {
        const jobs = await cron.list({ includeDisabled: true });
        const statuses = jobs.map((job) => job.state.lastStatus);
        return statuses.length === 2 && statuses.every((status) => status === "ok");
      });
      expect(allFinished).toBe(true);
    } finally {
      for (const resolve of pending.splice(0)) {
        resolve();
      }
      cron.stop();
      await store.cleanup();
    }
  });
});
