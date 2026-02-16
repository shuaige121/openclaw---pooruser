import { describe, expect, it } from "vitest";
import {
  normalizeFeishuTarget,
  resolveReceiveIdType,
  detectIdType,
  looksLikeFeishuId,
} from "./targets.js";

describe("normalizeFeishuTarget", () => {
  it("returns null for empty string", () => {
    expect(normalizeFeishuTarget("")).toBeNull();
  });
  it("strips chat: prefix", () => {
    expect(normalizeFeishuTarget("chat:oc_123")).toBe("oc_123");
  });
  it("strips user: prefix", () => {
    expect(normalizeFeishuTarget("user:ou_456")).toBe("ou_456");
  });
  it("returns raw id without prefix", () => {
    expect(normalizeFeishuTarget("oc_789")).toBe("oc_789");
  });
});

describe("resolveReceiveIdType", () => {
  it("detects chat_id", () => {
    expect(resolveReceiveIdType("oc_123")).toBe("chat_id");
  });
  it("detects open_id", () => {
    expect(resolveReceiveIdType("ou_456")).toBe("open_id");
  });
  it("defaults to open_id", () => {
    expect(resolveReceiveIdType("unknown")).toBe("open_id");
  });
});

describe("detectIdType", () => {
  it("detects chat_id", () => {
    expect(detectIdType("oc_abc")).toBe("chat_id");
  });
  it("detects open_id", () => {
    expect(detectIdType("ou_abc")).toBe("open_id");
  });
});

describe("looksLikeFeishuId", () => {
  it("returns true for oc_ prefix", () => {
    expect(looksLikeFeishuId("oc_123")).toBe(true);
  });
  it("returns true for chat: prefix", () => {
    expect(looksLikeFeishuId("chat:oc_123")).toBe(true);
  });
  it("returns false for random text", () => {
    expect(looksLikeFeishuId("hello world")).toBe(false);
  });
});
