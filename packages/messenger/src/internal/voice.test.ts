import { describe, expect, it } from "vitest";
import { isVoiceCompatibleAudio, resolveVoiceDecision } from "./voice.js";

describe("isVoiceCompatibleAudio", () => {
  it("returns true for ogg mime", () => {
    expect(isVoiceCompatibleAudio({ contentType: "audio/ogg" })).toBe(true);
  });
  it("returns true for opus mime", () => {
    expect(isVoiceCompatibleAudio({ contentType: "audio/opus" })).toBe(true);
  });
  it("returns false for mp3", () => {
    expect(isVoiceCompatibleAudio({ contentType: "audio/mpeg" })).toBe(false);
  });
  it("returns true for .ogg file extension", () => {
    expect(isVoiceCompatibleAudio({ fileName: "voice.ogg" })).toBe(true);
  });
  it("returns false for .mp3 file extension", () => {
    expect(isVoiceCompatibleAudio({ fileName: "song.mp3" })).toBe(false);
  });
});

describe("resolveVoiceDecision", () => {
  it("returns useVoice=false when not wanted", () => {
    const result = resolveVoiceDecision({ wantsVoice: false, contentType: "audio/ogg" });
    expect(result.useVoice).toBe(false);
  });
  it("returns useVoice=true for compatible audio", () => {
    const result = resolveVoiceDecision({ wantsVoice: true, contentType: "audio/ogg" });
    expect(result.useVoice).toBe(true);
  });
  it("returns useVoice=false with reason for incompatible", () => {
    const result = resolveVoiceDecision({ wantsVoice: true, contentType: "audio/mpeg" });
    expect(result.useVoice).toBe(false);
    expect(result.reason).toBeDefined();
  });
});
