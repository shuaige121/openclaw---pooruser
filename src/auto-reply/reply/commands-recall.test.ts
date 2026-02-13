import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HandleCommandsParams } from "./commands-types.js";
import { handleRecallCommand } from "./commands-recall.js";

function buildMinimalParams(
  commandBody: string,
  overrides?: Partial<HandleCommandsParams>,
): HandleCommandsParams {
  return {
    ctx: { Body: commandBody } as HandleCommandsParams["ctx"],
    cfg: {} as HandleCommandsParams["cfg"],
    command: {
      surface: "whatsapp",
      channel: "whatsapp",
      ownerList: [],
      senderIsOwner: true,
      isAuthorizedSender: true,
      rawBodyNormalized: commandBody,
      commandBodyNormalized: commandBody,
    },
    directives: { hasThinkDirective: false } as HandleCommandsParams["directives"],
    elevated: { enabled: false, allowed: false, failures: [] },
    sessionKey: "test:session:current",
    workspaceDir: os.tmpdir(),
    defaultGroupActivation: () => "mention",
    resolvedVerboseLevel: "off",
    resolvedReasoningLevel: "off",
    resolveDefaultThinkingLevel: async () => undefined,
    provider: "whatsapp",
    model: "test-model",
    contextTokens: 0,
    isGroup: false,
    ...overrides,
  } as HandleCommandsParams;
}

describe("handleRecallCommand", () => {
  let tempDir: string;
  let storePath: string;
  let sessionsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recall-test-"));
    sessionsDir = tempDir;
    storePath = path.join(sessionsDir, "sessions.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeStore(store: Record<string, unknown>) {
    fs.writeFileSync(storePath, JSON.stringify(store), "utf-8");
  }

  function writeTranscript(sessionId: string, lines: unknown[]): string {
    const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);
    const content = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  it("returns null for non-recall commands", async () => {
    const params = buildMinimalParams("/help");
    const result = await handleRecallCommand(params, true);
    expect(result).toBeNull();
  });

  it("returns null when text commands disabled", async () => {
    const params = buildMinimalParams("/recall abc123");
    const result = await handleRecallCommand(params, false);
    expect(result).toBeNull();
  });

  it("blocks unauthorized senders", async () => {
    const params = buildMinimalParams("/recall abc123", {
      command: {
        surface: "whatsapp",
        channel: "whatsapp",
        ownerList: [],
        senderIsOwner: false,
        isAuthorizedSender: false,
        rawBodyNormalized: "/recall abc123",
        commandBodyNormalized: "/recall abc123",
      },
    });
    const result = await handleRecallCommand(params, true);
    expect(result).toEqual({ shouldContinue: false });
  });

  it("shows usage when no argument given", async () => {
    const params = buildMinimalParams("/recall", { storePath });
    const result = await handleRecallCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("Usage:");
  });

  it("reports error when no session store", async () => {
    const params = buildMinimalParams("/recall abc123", { storePath: undefined });
    const result = await handleRecallCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("no session store");
  });

  it("reports error when session not found", async () => {
    writeStore({});
    const params = buildMinimalParams("/recall nonexistent", { storePath });
    const result = await handleRecallCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("No session found");
  });

  it("recalls a session by ID prefix", async () => {
    const targetSessionId = crypto.randomUUID();
    const targetKey = "test:session:old";
    const transcriptFile = path.join(sessionsDir, `${targetSessionId}.jsonl`);

    writeStore({
      [targetKey]: {
        sessionId: targetSessionId,
        updatedAt: Date.now() - 3600_000,
        sessionFile: transcriptFile,
      },
    });

    writeTranscript(targetSessionId, [
      {
        type: "session",
        id: targetSessionId,
        version: 3,
        timestamp: "2025-01-01T00:00:00Z",
        cwd: "/",
      },
      {
        type: "message",
        id: "m1",
        parentId: null,
        timestamp: "2025-01-01T00:01:00Z",
        message: { role: "user", content: "What is the weather?", timestamp: Date.now() },
      },
      {
        type: "message",
        id: "m2",
        parentId: "m1",
        timestamp: "2025-01-01T00:02:00Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "It's sunny today." }],
          timestamp: Date.now(),
        },
      },
    ]);

    const prefix = targetSessionId.slice(0, 8);
    const params = buildMinimalParams(`/recall ${prefix}`, {
      storePath,
      sessionEntry: {
        sessionId: crypto.randomUUID(),
        updatedAt: Date.now(),
      } as HandleCommandsParams["sessionEntry"],
    });

    const result = await handleRecallCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("Restored context");
    expect(result?.reply?.text).toContain("2 messages");
    expect(result?.reply?.text).toContain("What is the weather?");
    expect(result?.reply?.text).toContain("It's sunny today.");
  });

  it("reports error when transcript file missing", async () => {
    const targetSessionId = crypto.randomUUID();
    writeStore({
      "test:session:old": {
        sessionId: targetSessionId,
        updatedAt: Date.now(),
      },
    });

    const prefix = targetSessionId.slice(0, 8);
    const params = buildMinimalParams(`/recall ${prefix}`, { storePath });
    const result = await handleRecallCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("Transcript file not found");
  });

  it("skips the current session when matching", async () => {
    const currentSessionId = crypto.randomUUID();
    const currentKey = "test:session:current";

    writeStore({
      [currentKey]: {
        sessionId: currentSessionId,
        updatedAt: Date.now(),
      },
    });

    const prefix = currentSessionId.slice(0, 8);
    const params = buildMinimalParams(`/recall ${prefix}`, {
      storePath,
      sessionKey: currentKey,
    });
    const result = await handleRecallCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("No session found");
  });
});
