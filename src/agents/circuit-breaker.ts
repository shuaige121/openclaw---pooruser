export type CircuitBreakerState = {
  failures: number;
  lastFailure: number | null;
  state: "open" | "closed" | "half-open";
  tripCount: number;
};

type CircuitBreakerOptions = {
  maxFailures: number;
  cooldownMs: number;
  halfOpenAfterMs: number;
  maxTripsBeforeRollback?: number;
  agentDir?: string;
};

type CircuitBreakerFactoryOptions = Partial<CircuitBreakerOptions>;

const DEFAULT_MAX_FAILURES = 3;
const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_HALF_OPEN_AFTER_MS = 30_000;
const DEFAULT_MAX_TRIPS_BEFORE_ROLLBACK = 3;

function positiveNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function resolveOptions(opts: CircuitBreakerFactoryOptions | undefined): Required<
  Omit<CircuitBreakerOptions, "agentDir">
> & {
  agentDir?: string;
} {
  return {
    maxFailures: positiveNumber(opts?.maxFailures, DEFAULT_MAX_FAILURES),
    cooldownMs: positiveNumber(opts?.cooldownMs, DEFAULT_COOLDOWN_MS),
    halfOpenAfterMs: positiveNumber(opts?.halfOpenAfterMs, DEFAULT_HALF_OPEN_AFTER_MS),
    maxTripsBeforeRollback: positiveNumber(
      opts?.maxTripsBeforeRollback,
      DEFAULT_MAX_TRIPS_BEFORE_ROLLBACK,
    ),
    agentDir: opts?.agentDir,
  };
}

export class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailure: null,
    state: "closed",
    tripCount: 0,
  };

  private options: ReturnType<typeof resolveOptions>;

  private rollbackSuggested = false;

  constructor(opts: {
    maxFailures: number;
    cooldownMs: number;
    halfOpenAfterMs: number;
    maxTripsBeforeRollback?: number;
    agentDir?: string;
  }) {
    this.options = resolveOptions(opts);
  }

  configure(opts: CircuitBreakerFactoryOptions): void {
    const next = resolveOptions({ ...this.options, ...opts });
    this.options = next;
  }

  recordSuccess(): void {
    this.state.failures = 0;
    this.state.lastFailure = null;
    this.state.state = "closed";
  }

  recordFailure(): void {
    const now = Date.now();

    if (this.state.lastFailure !== null && now - this.state.lastFailure > this.options.cooldownMs) {
      this.state.failures = 0;
    }

    this.state.lastFailure = now;

    if (this.state.state === "half-open") {
      this.trip();
      return;
    }

    this.state.failures += 1;
    if (this.state.failures >= this.options.maxFailures) {
      this.trip();
    }
  }

  canAttempt(): boolean {
    if (this.state.state === "closed" || this.state.state === "half-open") {
      return true;
    }

    if (this.state.lastFailure === null) {
      return false;
    }

    if (Date.now() - this.state.lastFailure >= this.options.halfOpenAfterMs) {
      this.state.state = "half-open";
      return true;
    }

    return false;
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  private trip(): void {
    this.state.state = "open";
    this.state.failures = 0;
    this.state.tripCount += 1;

    if (!this.rollbackSuggested && this.state.tripCount >= this.options.maxTripsBeforeRollback) {
      const maxTrips = this.options.maxTripsBeforeRollback;
      console.warn(
        `[circuit-breaker][CRITICAL] Circuit tripped ${this.state.tripCount} times (threshold=${maxTrips}). Consider rollback for provider/model.`,
      );
      suggestRollback(this.options.agentDir);
      this.rollbackSuggested = true;
    }
  }
}

const registry = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  key: string,
  opts?: CircuitBreakerFactoryOptions,
): CircuitBreaker {
  const normalizedKey = String(key ?? "").trim() || "default";
  const resolved = resolveOptions(opts);
  const existing = registry.get(normalizedKey);

  if (existing) {
    existing.configure(resolved);
    return existing;
  }

  const breaker = new CircuitBreaker(resolved);
  registry.set(normalizedKey, breaker);
  return breaker;
}

export function suggestRollback(agentDir?: string): void {
  const targetDir = agentDir?.trim() || ".";
  console.warn(`[circuit-breaker] Review recent commits:`);
  console.warn(`[circuit-breaker]   git -C ${targetDir} log --oneline -n 10`);
  console.warn(`[circuit-breaker] Suggested rollback command (manual):`);
  console.warn(`[circuit-breaker]   git -C ${targetDir} revert <commit-sha>`);
}

export function resetCircuitBreakersForTest(): void {
  registry.clear();
}
