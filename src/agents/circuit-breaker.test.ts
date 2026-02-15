import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CircuitBreaker,
  getCircuitBreaker,
  resetCircuitBreakersForTest,
} from "./circuit-breaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetCircuitBreakersForTest();
  });

  it("starts closed", () => {
    const breaker = new CircuitBreaker({
      maxFailures: 3,
      cooldownMs: 60_000,
      halfOpenAfterMs: 30_000,
    });

    expect(breaker.getState().state).toBe("closed");
    expect(breaker.canAttempt()).toBe(true);
  });

  it("opens after maxFailures", () => {
    const breaker = new CircuitBreaker({
      maxFailures: 3,
      cooldownMs: 60_000,
      halfOpenAfterMs: 30_000,
    });

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState().state).toBe("closed");

    breaker.recordFailure();

    expect(breaker.getState().state).toBe("open");
    expect(breaker.getState().tripCount).toBe(1);
  });

  it("blocks attempts while open", () => {
    const breaker = new CircuitBreaker({
      maxFailures: 1,
      cooldownMs: 60_000,
      halfOpenAfterMs: 30_000,
    });

    breaker.recordFailure();

    expect(breaker.getState().state).toBe("open");
    expect(breaker.canAttempt()).toBe(false);
  });

  it("transitions to half-open after timeout", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const breaker = new CircuitBreaker({
      maxFailures: 1,
      cooldownMs: 60_000,
      halfOpenAfterMs: 30_000,
    });

    breaker.recordFailure();
    expect(breaker.canAttempt()).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));

    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.getState().state).toBe("half-open");
  });

  it("resets to closed on success", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const breaker = new CircuitBreaker({
      maxFailures: 1,
      cooldownMs: 60_000,
      halfOpenAfterMs: 30_000,
    });

    breaker.recordFailure();
    vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));
    expect(breaker.canAttempt()).toBe(true);

    breaker.recordSuccess();

    const state = breaker.getState();
    expect(state.state).toBe("closed");
    expect(state.failures).toBe(0);
    expect(state.lastFailure).toBeNull();
  });

  it("tracks trip count across repeated trips", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const breaker = getCircuitBreaker("openai/gpt-4.1-mini", {
      maxFailures: 1,
      cooldownMs: 60_000,
      halfOpenAfterMs: 10,
    });

    breaker.recordFailure();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.010Z"));
    expect(breaker.canAttempt()).toBe(true);
    breaker.recordFailure();

    vi.setSystemTime(new Date("2026-01-01T00:00:00.020Z"));
    expect(breaker.canAttempt()).toBe(true);
    breaker.recordFailure();

    expect(breaker.getState().tripCount).toBe(3);
  });
});
