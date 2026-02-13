import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CommandHandler } from "./commands-types.js";
import { loadSessionStore, resolveSessionFilePath } from "../../config/sessions.js";
import { extractRecentMessages } from "../../config/sessions/preview.js";
import { logVerbose } from "../../globals.js";

const MAX_RECALL_MESSAGES = 20;

/**
 * Handle `/recall <session-id-prefix>` command.
 *
 * Loads the transcript from a previous session and injects it as a
 * custom_message entry into the current session so the LLM sees the
 * recalled context on subsequent turns. Zero extra token cost until
 * the user explicitly invokes this command.
 */
export const handleRecallCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }

  const body = params.command.commandBodyNormalized;
  if (body !== "/recall" && !body.startsWith("/recall ")) {
    return null;
  }

  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /recall from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  const arg = body.slice("/recall".length).trim();
  if (!arg) {
    return {
      shouldContinue: false,
      reply: {
        text: "⚙️ Usage: /recall <session-id>\nUse the session ID shown in the idle-timeout notification.",
      },
    };
  }

  // Find the target session in the store
  const storePath = params.storePath;
  if (!storePath) {
    return {
      shouldContinue: false,
      reply: { text: "⚙️ Recall unavailable (no session store)." },
    };
  }

  const store = loadSessionStore(storePath);
  const targetEntry = findSessionByPrefix(store, arg, params.sessionKey);
  if (!targetEntry) {
    return {
      shouldContinue: false,
      reply: { text: `⚙️ No session found matching "${arg}".` },
    };
  }

  // Resolve the transcript file path
  const transcriptPath = resolveSessionFilePath(targetEntry.sessionId, targetEntry);
  if (!fs.existsSync(transcriptPath)) {
    return {
      shouldContinue: false,
      reply: {
        text: `⚙️ Transcript file not found for session ${targetEntry.sessionId.slice(0, 8)}.`,
      },
    };
  }

  // Extract recent messages from the recalled session
  const messages = extractRecentMessages(transcriptPath, MAX_RECALL_MESSAGES);
  if (messages.length === 0) {
    return {
      shouldContinue: false,
      reply: { text: `⚙️ Session ${targetEntry.sessionId.slice(0, 8)} has no messages to recall.` },
    };
  }

  // Format the context block
  const contextBlock = formatRecalledContext(targetEntry.sessionId, messages);

  // Inject into current session transcript as a custom_message entry
  const currentSessionId = params.sessionEntry?.sessionId;
  if (currentSessionId) {
    const currentTranscriptPath = resolveSessionFilePath(currentSessionId, params.sessionEntry);
    await injectContextToTranscript(currentTranscriptPath, currentSessionId, contextBlock);
  }

  const shortId = targetEntry.sessionId.slice(0, 8);
  return {
    shouldContinue: false,
    reply: {
      text: `📋 Restored context from session [${shortId}] (${messages.length} messages).\n\n${contextBlock}\n\n---\nContext has been loaded into this session. Send your next message to continue.`,
    },
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSessionByPrefix(
  store: Record<string, import("../../config/sessions/types.js").SessionEntry>,
  prefix: string,
  currentSessionKey?: string,
): import("../../config/sessions/types.js").SessionEntry | null {
  const lowered = prefix.toLowerCase();

  // Try exact session ID match or prefix match
  for (const [key, entry] of Object.entries(store)) {
    if (!entry?.sessionId) {
      continue;
    }
    // Skip the current session
    if (key === currentSessionKey) {
      continue;
    }
    if (entry.sessionId === prefix || entry.sessionId.toLowerCase().startsWith(lowered)) {
      return entry;
    }
  }

  // Try matching by session key prefix
  for (const [key, entry] of Object.entries(store)) {
    if (!entry?.sessionId) {
      continue;
    }
    if (key === currentSessionKey) {
      continue;
    }
    if (key.toLowerCase().startsWith(lowered)) {
      return entry;
    }
  }

  return null;
}

function formatRecalledContext(
  sessionId: string,
  messages: Array<{ role: "user" | "assistant"; text: string; timestamp?: string }>,
): string {
  const lines: string[] = [];
  for (const msg of messages) {
    const label = msg.role === "user" ? "User" : "Assistant";
    // Truncate very long messages to avoid flooding
    const text = msg.text.length > 500 ? `${msg.text.slice(0, 500)}...` : msg.text;
    lines.push(`[${label}] ${text}`);
  }
  return lines.join("\n\n");
}

async function injectContextToTranscript(
  transcriptPath: string,
  sessionId: string,
  contextBlock: string,
): Promise<void> {
  try {
    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(transcriptPath), { recursive: true });

    // Ensure session header exists
    if (!fs.existsSync(transcriptPath)) {
      const header = {
        type: "session",
        version: 3,
        id: sessionId,
        timestamp: new Date().toISOString(),
        cwd: process.cwd(),
      };
      await fs.promises.writeFile(transcriptPath, `${JSON.stringify(header)}\n`, "utf-8");
    }

    // Read the current file to find the latest entry ID for parentId
    const content = fs.readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n");
    let lastEntryId: string | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed.id) {
          lastEntryId = parsed.id;
          break;
        }
      } catch {
        continue;
      }
    }

    // Append a custom_message entry that will be visible to the LLM
    const entry = {
      type: "custom_message",
      id: crypto.randomUUID(),
      parentId: lastEntryId,
      timestamp: new Date().toISOString(),
      customType: "recall",
      content: `[Recalled conversation context from a previous session]\n\n${contextBlock}`,
      display: false,
      details: { source: "recall" },
    };
    await fs.promises.appendFile(transcriptPath, `${JSON.stringify(entry)}\n`, "utf-8");
  } catch (err) {
    logVerbose(`Failed to inject recall context into transcript: ${err}`);
  }
}
