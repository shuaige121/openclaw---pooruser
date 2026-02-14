import { spawn } from "node:child_process";

const OUTPUT_LIMIT_BYTES = 100 * 1024;
const KILL_GRACE_MS = 3_000;

export type ScriptRunnerStatus = "ok" | "error" | "timeout";

export type ScriptRunnerResult = {
  status: ScriptRunnerStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
  durationMs: number;
};

type BufferState = {
  buffer: Buffer;
  truncated: boolean;
};

function appendBuffer(state: BufferState, chunk: Buffer) {
  if (state.buffer.length >= OUTPUT_LIMIT_BYTES) {
    state.truncated = true;
    return;
  }
  const remaining = OUTPUT_LIMIT_BYTES - state.buffer.length;
  const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
  if (slice.length < chunk.length) {
    state.truncated = true;
  }
  state.buffer = Buffer.concat([state.buffer, slice], state.buffer.length + slice.length);
}

function finalizeOutput(state: BufferState): string {
  const text = state.buffer.toString("utf8");
  if (!state.truncated) {
    return text;
  }
  const marker = "\n...[truncated]\n";
  return text.endsWith("\n") ? `${text}...[truncated]\n` : `${text}${marker}`;
}

export async function runScriptJob(params: {
  command: string;
  timeoutMs: number;
  cwd?: string;
  shell?: string;
}): Promise<ScriptRunnerResult> {
  const command = params.command.trim();
  if (!command) {
    return {
      status: "error",
      stdout: "",
      stderr: "",
      exitCode: null,
      error: "script command is required",
      durationMs: 0,
    };
  }

  const startedAt = Date.now();
  const stdoutState: BufferState = { buffer: Buffer.alloc(0), truncated: false };
  const stderrState: BufferState = { buffer: Buffer.alloc(0), truncated: false };

  let timedOut = false;
  let timeout: NodeJS.Timeout | null = null;
  let forceKill: NodeJS.Timeout | null = null;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let spawnErrorMessage: string | undefined;

  const shell =
    typeof params.shell === "string" && params.shell.trim() ? params.shell.trim() : true;
  const child = spawn(command, {
    cwd: params.cwd,
    shell,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk: Buffer | string) => {
    appendBuffer(stdoutState, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    appendBuffer(stderrState, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const completed = new Promise<void>((resolve) => {
    child.once("error", (err) => {
      spawnErrorMessage = err instanceof Error ? err.message : String(err);
      resolve();
    });
    child.once("close", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
      resolve();
    });
  });

  timeout = setTimeout(
    () => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKill = setTimeout(() => {
        child.kill("SIGKILL");
      }, KILL_GRACE_MS);
      forceKill.unref?.();
    },
    Math.max(1, params.timeoutMs),
  );
  timeout.unref?.();

  await completed;

  if (timeout) {
    clearTimeout(timeout);
  }
  if (forceKill) {
    clearTimeout(forceKill);
  }

  const durationMs = Math.max(0, Date.now() - startedAt);
  const stdout = finalizeOutput(stdoutState);
  const stderr = finalizeOutput(stderrState);

  if (timedOut) {
    return {
      status: "timeout",
      stdout,
      stderr,
      exitCode,
      error: `script timed out after ${params.timeoutMs}ms`,
      durationMs,
    };
  }
  if (spawnErrorMessage) {
    return {
      status: "error",
      stdout,
      stderr,
      exitCode,
      error: spawnErrorMessage,
      durationMs,
    };
  }
  if (typeof exitCode === "number" && exitCode === 0) {
    return {
      status: "ok",
      stdout,
      stderr,
      exitCode,
      durationMs,
    };
  }

  const error =
    exitSignal != null
      ? `script terminated by signal ${exitSignal}`
      : `script exited with code ${exitCode}`;
  return {
    status: "error",
    stdout,
    stderr,
    exitCode,
    error,
    durationMs,
  };
}
