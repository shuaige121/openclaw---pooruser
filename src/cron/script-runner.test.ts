import { describe, expect, it } from "vitest";
import { runScriptJob } from "./script-runner.js";

describe("runScriptJob", () => {
  it("runs a command and captures stdout", async () => {
    const res = await runScriptJob({
      command: `printf "hello"`,
      timeoutMs: 2_000,
    });
    expect(res.status).toBe("ok");
    expect(res.stdout).toBe("hello");
    expect(res.stderr).toBe("");
    expect(res.exitCode).toBe(0);
  });

  it("times out long-running commands", async () => {
    const res = await runScriptJob({
      command: `sleep 2`,
      timeoutMs: 100,
    });
    expect(res.status).toBe("timeout");
    expect(res.error).toContain("timed out");
  });

  it("returns error for empty command", async () => {
    const res = await runScriptJob({ command: "  ", timeoutMs: 2_000 });
    expect(res.status).toBe("error");
    expect(res.error).toBe("script command is required");
    expect(res.exitCode).toBeNull();
    expect(res.durationMs).toBe(0);
  });

  it("returns error with exit code for non-zero exit", async () => {
    const res = await runScriptJob({ command: "exit 42", timeoutMs: 2_000 });
    expect(res.status).toBe("error");
    expect(res.exitCode).toBe(42);
    expect(res.error).toContain("42");
  });

  it("captures stderr from failing commands", async () => {
    const res = await runScriptJob({
      command: `echo "err msg" >&2; exit 1`,
      timeoutMs: 2_000,
    });
    expect(res.status).toBe("error");
    expect(res.stderr).toContain("err msg");
    expect(res.exitCode).toBe(1);
  });

  it("truncates stdout exceeding 100KB", async () => {
    // Generate ~120KB of output (each line ~101 bytes × 1200 lines)
    const res = await runScriptJob({
      command: `python3 -c "import sys; [sys.stdout.write('A' * 100 + '\\n') for _ in range(1200)]"`,
      timeoutMs: 5_000,
    });
    expect(res.status).toBe("ok");
    expect(res.stdout.length).toBeLessThanOrEqual(100 * 1024 + 50);
    expect(res.stdout).toContain("...[truncated]");
  });
});
