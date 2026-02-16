import { describe, expect, it } from "vitest";
import { mediaKindFromMime, isGifMedia, getFileExtension } from "./media.js";

describe("mediaKindFromMime", () => {
  it("returns image for image/*", () => {
    expect(mediaKindFromMime("image/png")).toBe("image");
  });
  it("returns audio for audio/*", () => {
    expect(mediaKindFromMime("audio/ogg")).toBe("audio");
  });
  it("returns video for video/*", () => {
    expect(mediaKindFromMime("video/mp4")).toBe("video");
  });
  it("returns document for application/*", () => {
    expect(mediaKindFromMime("application/pdf")).toBe("document");
  });
  it("returns unknown for null", () => {
    expect(mediaKindFromMime(null)).toBe("unknown");
  });
});

describe("isGifMedia", () => {
  it("detects gif by content type", () => {
    expect(isGifMedia({ contentType: "image/gif" })).toBe(true);
  });
  it("detects gif by file name", () => {
    expect(isGifMedia({ fileName: "animation.gif" })).toBe(true);
  });
  it("returns false for non-gif", () => {
    expect(isGifMedia({ contentType: "image/png" })).toBe(false);
  });
});

describe("getFileExtension", () => {
  it("extracts .ts", () => {
    expect(getFileExtension("foo.ts")).toBe(".ts");
  });
  it("returns undefined for no extension", () => {
    expect(getFileExtension("foo")).toBeUndefined();
  });
  it("returns undefined for null", () => {
    expect(getFileExtension(null)).toBeUndefined();
  });
});
