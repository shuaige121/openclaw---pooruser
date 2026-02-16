const VOICE_AUDIO_EXTENSIONS = new Set([".oga", ".ogg", ".opus"]);

function getFileExtension(filePath?: string | null): string | undefined {
  if (!filePath) {
    return undefined;
  }
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot < 0 || lastDot === filePath.length - 1) {
    return undefined;
  }
  return filePath.slice(lastDot).toLowerCase();
}

export function isVoiceCompatibleAudio(opts: {
  contentType?: string | null;
  fileName?: string | null;
}): boolean {
  const mime = opts.contentType?.toLowerCase();
  if (mime && (mime.includes("ogg") || mime.includes("opus"))) {
    return true;
  }
  const fileName = opts.fileName?.trim();
  if (!fileName) {
    return false;
  }
  const ext = getFileExtension(fileName);
  if (!ext) {
    return false;
  }
  return VOICE_AUDIO_EXTENSIONS.has(ext);
}

export function resolveVoiceDecision(opts: {
  wantsVoice: boolean;
  contentType?: string | null;
  fileName?: string | null;
}): { useVoice: boolean; reason?: string } {
  if (!opts.wantsVoice) {
    return { useVoice: false };
  }
  if (isVoiceCompatibleAudio(opts)) {
    return { useVoice: true };
  }
  const contentType = opts.contentType ?? "unknown";
  const fileName = opts.fileName ?? "unknown";
  return {
    useVoice: false,
    reason: `media is ${contentType} (${fileName})`,
  };
}

export function resolveVoiceSend(opts: {
  wantsVoice: boolean;
  contentType?: string | null;
  fileName?: string | null;
  logFallback?: (message: string) => void;
}): { useVoice: boolean } {
  const decision = resolveVoiceDecision(opts);
  if (decision.reason && opts.logFallback) {
    opts.logFallback(`Voice requested but ${decision.reason}; sending as audio file instead.`);
  }
  return { useVoice: decision.useVoice };
}
