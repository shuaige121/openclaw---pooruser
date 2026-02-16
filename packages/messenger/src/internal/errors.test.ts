import { describe, expect, it } from "vitest";
import { MessengerError, formatErrorMessage, extractErrorCode } from "./errors.js";

describe("MessengerError", () => {
  it("has correct name", () => {
    const err = new MessengerError("test");
    expect(err.name).toBe("MessengerError");
    expect(err.message).toBe("test");
    expect(err instanceof Error).toBe(true);
  });
});

describe("formatErrorMessage", () => {
  it("formats Error instances", () => {
    expect(formatErrorMessage(new Error("hello"))).toBe("hello");
  });
  it("formats strings", () => {
    expect(formatErrorMessage("oops")).toBe("oops");
  });
  it("formats numbers", () => {
    expect(formatErrorMessage(42)).toBe("42");
  });
  it("formats objects as JSON", () => {
    expect(formatErrorMessage({ key: "val" })).toBe(JSON.stringify({ key: "val" }));
  });
});

describe("extractErrorCode", () => {
  it("extracts string code", () => {
    const err = Object.assign(new Error("x"), { code: "ENOENT" });
    expect(extractErrorCode(err)).toBe("ENOENT");
  });
  it("extracts numeric code", () => {
    const err = Object.assign(new Error("x"), { code: 404 });
    expect(extractErrorCode(err)).toBe("404");
  });
  it("returns undefined for non-objects", () => {
    expect(extractErrorCode(null)).toBeUndefined();
    expect(extractErrorCode("string")).toBeUndefined();
  });
});
