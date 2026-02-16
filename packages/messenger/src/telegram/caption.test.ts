import { describe, expect, it } from "vitest";
import { splitTelegramCaption, TELEGRAM_MAX_CAPTION_LENGTH } from "./caption.js";

describe("splitTelegramCaption", () => {
  it("returns empty for undefined input", () => {
    expect(splitTelegramCaption(undefined)).toEqual({
      caption: undefined,
      followUpText: undefined,
    });
  });
  it("returns caption for short text", () => {
    expect(splitTelegramCaption("Hello")).toEqual({
      caption: "Hello",
      followUpText: undefined,
    });
  });
  it("splits long text into followUpText", () => {
    const longText = "x".repeat(TELEGRAM_MAX_CAPTION_LENGTH + 1);
    const result = splitTelegramCaption(longText);
    expect(result.caption).toBeUndefined();
    expect(result.followUpText).toBe(longText);
  });
  it("handles exactly max length", () => {
    const text = "x".repeat(TELEGRAM_MAX_CAPTION_LENGTH);
    expect(splitTelegramCaption(text)).toEqual({
      caption: text,
      followUpText: undefined,
    });
  });
});
