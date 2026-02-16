import { describe, expect, it } from "vitest";
import { resolveRetryConfig, retryAsync } from "./retry.js";

describe("resolveRetryConfig", () => {
  it("uses defaults when no overrides", () => {
    const config = resolveRetryConfig();
    expect(config.attempts).toBe(3);
    expect(config.minDelayMs).toBe(300);
    expect(config.maxDelayMs).toBe(30_000);
    expect(config.jitter).toBe(0);
  });
  it("overrides attempts", () => {
    const config = resolveRetryConfig(undefined, { attempts: 5 });
    expect(config.attempts).toBe(5);
  });
  it("clamps attempts to at least 1", () => {
    const config = resolveRetryConfig(undefined, { attempts: 0 });
    expect(config.attempts).toBe(1);
  });
});

describe("retryAsync", () => {
  it("returns result on first success", async () => {
    const result = await retryAsync(() => Promise.resolve(42));
    expect(result).toBe(42);
  });
  it("retries on failure", async () => {
    let calls = 0;
    const result = await retryAsync(
      () => {
        calls++;
        if (calls < 3) {
          throw new Error("fail");
        }
        return Promise.resolve("ok");
      },
      { attempts: 3, minDelayMs: 1, maxDelayMs: 1 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });
  it("throws after max attempts", async () => {
    await expect(
      retryAsync(() => Promise.reject(new Error("always fails")), {
        attempts: 2,
        minDelayMs: 1,
        maxDelayMs: 1,
      }),
    ).rejects.toThrow("always fails");
  });
});
