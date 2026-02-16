import { describe, expect, it } from "vitest";
import {
  buildMentionedMessage,
  buildMentionedCardContent,
  formatMentionForText,
  formatMentionForCard,
} from "./mention.js";

const target = { openId: "ou_123", name: "Alice", key: "@_user_1" };

describe("formatMentionForText", () => {
  it("formats correctly", () => {
    expect(formatMentionForText(target)).toBe('<at user_id="ou_123">Alice</at>');
  });
});

describe("formatMentionForCard", () => {
  it("formats correctly", () => {
    expect(formatMentionForCard(target)).toBe("<at id=ou_123></at>");
  });
});

describe("buildMentionedMessage", () => {
  it("prepends mentions to message", () => {
    const result = buildMentionedMessage([target], "Hello");
    expect(result).toContain("ou_123");
    expect(result).toContain("Hello");
  });
  it("returns message unchanged with no targets", () => {
    expect(buildMentionedMessage([], "Hello")).toBe("Hello");
  });
});

describe("buildMentionedCardContent", () => {
  it("prepends card mentions to message", () => {
    const result = buildMentionedCardContent([target], "Hello");
    expect(result).toContain("ou_123");
    expect(result).toContain("Hello");
  });
});
