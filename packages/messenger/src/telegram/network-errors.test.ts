import { describe, expect, it } from "vitest";
import { isRecoverableTelegramNetworkError } from "./network-errors.js";

describe("isRecoverableTelegramNetworkError", () => {
  it("returns false for null", () => {
    expect(isRecoverableTelegramNetworkError(null)).toBe(false);
  });
  it("detects ECONNRESET", () => {
    const err = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    expect(isRecoverableTelegramNetworkError(err)).toBe(true);
  });
  it("detects ETIMEDOUT", () => {
    const err = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
    expect(isRecoverableTelegramNetworkError(err)).toBe(true);
  });
  it("detects AbortError by name", () => {
    const err = new DOMException("aborted", "AbortError");
    expect(isRecoverableTelegramNetworkError(err)).toBe(true);
  });
  it("does not match message snippets in send context by default", () => {
    const err = new Error("fetch failed");
    expect(isRecoverableTelegramNetworkError(err, { context: "send" })).toBe(false);
  });
  it("matches message snippets in polling context", () => {
    const err = new Error("fetch failed");
    expect(isRecoverableTelegramNetworkError(err, { context: "polling" })).toBe(true);
  });
  it("follows error chain via cause", () => {
    const cause = Object.assign(new Error("inner"), { code: "ECONNREFUSED" });
    const err = new Error("outer", { cause });
    expect(isRecoverableTelegramNetworkError(err)).toBe(true);
  });
});
