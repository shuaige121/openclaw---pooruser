export type MediaAttachment = {
  buffer: Buffer;
  contentType?: string;
  fileName?: string;
};

export type MediaKind = "image" | "audio" | "video" | "document" | "unknown";

export function mediaKindFromMime(mime?: string | null): MediaKind {
  if (!mime) {
    return "unknown";
  }
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime === "application/pdf" || mime.startsWith("application/")) {
    return "document";
  }
  return "unknown";
}

export function isGifMedia(opts: {
  contentType?: string | null;
  fileName?: string | null;
}): boolean {
  if (opts.contentType?.toLowerCase() === "image/gif") {
    return true;
  }
  const ext = getFileExtension(opts.fileName);
  return ext === ".gif";
}

export function getFileExtension(filePath?: string | null): string | undefined {
  if (!filePath) {
    return undefined;
  }
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot < 0 || lastDot === filePath.length - 1) {
    return undefined;
  }
  return filePath.slice(lastDot).toLowerCase();
}
