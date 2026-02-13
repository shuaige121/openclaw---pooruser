import fs from "node:fs";

/**
 * Extract a short preview string from a session transcript JSONL file.
 * Reads the first user message and truncates it for display.
 * Does NOT use LLM — purely file-based extraction.
 */
export function extractSessionPreview(transcriptPath: string, maxChars = 40): string {
  let content: string;
  try {
    content = fs.readFileSync(transcriptPath, "utf-8");
  } catch {
    return "(transcript unavailable)";
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let entry: unknown;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isMessageEntry(entry) || entry.message?.role !== "user") {
      continue;
    }

    const text = extractTextFromMessage(entry.message);
    if (!text) {
      continue;
    }

    return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
  }

  return "(empty session)";
}

/**
 * Extract the most recent N messages (user + assistant) from a session transcript.
 * Used by `/recall` to inject previous conversation context.
 */
export function extractRecentMessages(
  transcriptPath: string,
  lastN = 20,
): Array<{ role: "user" | "assistant"; text: string; timestamp?: string }> {
  let content: string;
  try {
    content = fs.readFileSync(transcriptPath, "utf-8");
  } catch {
    return [];
  }

  const messages: Array<{ role: "user" | "assistant"; text: string; timestamp?: string }> = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let entry: unknown;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isMessageEntry(entry)) {
      continue;
    }

    const role = entry.message?.role;
    if (role !== "user" && role !== "assistant") {
      continue;
    }

    const text = extractTextFromMessage(entry.message);
    if (!text) {
      continue;
    }

    messages.push({ role, text, timestamp: entry.timestamp });
  }

  return messages.slice(-lastN);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TranscriptMessageEntry = {
  type: "message";
  message: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  };
  timestamp?: string;
};

function isMessageEntry(entry: unknown): entry is TranscriptMessageEntry {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const e = entry as Record<string, unknown>;
  return e.type === "message" && e.message != null && typeof e.message === "object";
}

function extractTextFromMessage(message: TranscriptMessageEntry["message"]): string {
  if (typeof message.content === "string") {
    return message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text!)
      .join(" ")
      .trim();
  }
  return "";
}
