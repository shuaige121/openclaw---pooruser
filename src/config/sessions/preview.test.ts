import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractRecentMessages, extractSessionPreview } from "./preview.js";

describe("extractSessionPreview", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeTranscript(lines: unknown[]): string {
    const filePath = path.join(tempDir, `${crypto.randomUUID()}.jsonl`);
    const content = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  it("returns first user message text", () => {
    const filePath = writeTranscript([
      { type: "session", id: "s1", version: 3, timestamp: "2025-01-01T00:00:00Z", cwd: "/" },
      {
        type: "message",
        id: "m1",
        parentId: null,
        timestamp: "2025-01-01T00:01:00Z",
        message: { role: "user", content: "Hello world", timestamp: Date.now() },
      },
    ]);
    expect(extractSessionPreview(filePath)).toBe("Hello world");
  });

  it("truncates long messages to maxChars", () => {
    const longText = "A".repeat(100);
    const filePath = writeTranscript([
      { type: "session", id: "s1", version: 3, timestamp: "2025-01-01T00:00:00Z", cwd: "/" },
      {
        type: "message",
        id: "m1",
        parentId: null,
        timestamp: "2025-01-01T00:01:00Z",
        message: { role: "user", content: longText, timestamp: Date.now() },
      },
    ]);
    const preview = extractSessionPreview(filePath, 40);
    expect(preview).toBe("A".repeat(40) + "...");
  });

  it("skips assistant messages and returns first user message", () => {
    const filePath = writeTranscript([
      { type: "session", id: "s1", version: 3, timestamp: "2025-01-01T00:00:00Z", cwd: "/" },
      {
        type: "message",
        id: "m1",
        parentId: null,
        timestamp: "2025-01-01T00:01:00Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "I am assistant" }],
          timestamp: Date.now(),
        },
      },
      {
        type: "message",
        id: "m2",
        parentId: "m1",
        timestamp: "2025-01-01T00:02:00Z",
        message: { role: "user", content: "User question here", timestamp: Date.now() },
      },
    ]);
    expect(extractSessionPreview(filePath)).toBe("User question here");
  });

  it("handles content as array of text objects", () => {
    const filePath = writeTranscript([
      { type: "session", id: "s1", version: 3, timestamp: "2025-01-01T00:00:00Z", cwd: "/" },
      {
        type: "message",
        id: "m1",
        parentId: null,
        timestamp: "2025-01-01T00:01:00Z",
        message: {
          role: "user",
          content: [
            { type: "text", text: "part one" },
            { type: "text", text: "part two" },
          ],
          timestamp: Date.now(),
        },
      },
    ]);
    expect(extractSessionPreview(filePath)).toBe("part one part two");
  });

  it("returns '(empty session)' for transcript with no user messages", () => {
    const filePath = writeTranscript([
      { type: "session", id: "s1", version: 3, timestamp: "2025-01-01T00:00:00Z", cwd: "/" },
    ]);
    expect(extractSessionPreview(filePath)).toBe("(empty session)");
  });

  it("returns '(transcript unavailable)' for missing file", () => {
    expect(extractSessionPreview("/tmp/nonexistent-file.jsonl")).toBe("(transcript unavailable)");
  });
});

describe("extractRecentMessages", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recent-msg-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeTranscript(lines: unknown[]): string {
    const filePath = path.join(tempDir, `${crypto.randomUUID()}.jsonl`);
    const content = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  it("extracts user and assistant messages", () => {
    const filePath = writeTranscript([
      { type: "session", id: "s1", version: 3, timestamp: "2025-01-01T00:00:00Z", cwd: "/" },
      {
        type: "message",
        id: "m1",
        parentId: null,
        timestamp: "2025-01-01T00:01:00Z",
        message: { role: "user", content: "Hi", timestamp: Date.now() },
      },
      {
        type: "message",
        id: "m2",
        parentId: "m1",
        timestamp: "2025-01-01T00:02:00Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello!" }],
          timestamp: Date.now(),
        },
      },
    ]);
    const messages = extractRecentMessages(filePath);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: "user", text: "Hi", timestamp: "2025-01-01T00:01:00Z" });
    expect(messages[1]).toEqual({
      role: "assistant",
      text: "Hello!",
      timestamp: "2025-01-01T00:02:00Z",
    });
  });

  it("returns only last N messages", () => {
    const entries: unknown[] = [
      { type: "session", id: "s1", version: 3, timestamp: "2025-01-01T00:00:00Z", cwd: "/" },
    ];
    for (let i = 0; i < 10; i++) {
      entries.push({
        type: "message",
        id: `m${i}`,
        parentId: i === 0 ? null : `m${i - 1}`,
        timestamp: `2025-01-01T00:0${i}:00Z`,
        message: { role: "user", content: `Message ${i}`, timestamp: Date.now() },
      });
    }
    const filePath = writeTranscript(entries);
    const messages = extractRecentMessages(filePath, 3);
    expect(messages).toHaveLength(3);
    expect(messages[0].text).toBe("Message 7");
    expect(messages[2].text).toBe("Message 9");
  });

  it("skips non-message entries", () => {
    const filePath = writeTranscript([
      { type: "session", id: "s1", version: 3, timestamp: "2025-01-01T00:00:00Z", cwd: "/" },
      { type: "thinking_level_change", id: "t1", parentId: null, thinkingLevel: "high" },
      {
        type: "message",
        id: "m1",
        parentId: "t1",
        timestamp: "2025-01-01T00:01:00Z",
        message: { role: "user", content: "Only this", timestamp: Date.now() },
      },
    ]);
    const messages = extractRecentMessages(filePath);
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe("Only this");
  });

  it("returns empty array for missing file", () => {
    expect(extractRecentMessages("/tmp/nonexistent.jsonl")).toEqual([]);
  });
});
