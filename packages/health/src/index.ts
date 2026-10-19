/**
 * @nexkitjs/health — liveness and readiness checks with timeouts and sanitized output.
 *
 * @packageDocumentation
 */
import {
  isTimeoutError,
  roundDuration,
  withTimeout,
  type JsonValue,
  type MaybePromise,
} from "@nexkitjs/core";

export type HealthStatus = "ok" | "degraded" | "fail";

/** What a check may return. `void`/`true` mean ok; `false` means fail. */
export interface HealthCheckResult {
  status: HealthStatus;
  /** Short, client-safe message. */
  message?: string;
  /** Public-safe details (connection counts, versions…). Never put secrets here. */
  details?: Record<string, JsonValue>;
}

export type HealthCheckFn = (
  signal: AbortSignal,
) => MaybePromise<void | boolean | HealthCheckResult>;

export type HealthProbe = "liveness" | "readiness" | "both";

export interface HealthCheckOptions {
  /** Per-check timeout in ms. Defaults to the registry's `defaultTimeoutMs`. */
  timeoutMs?: number;
  /**
   * Critical checks make the whole report `fail` when they fail. Non-critical
   * checks only degrade it. Defaults to true.
   */
  critical?: boolean;
  /** Which probe(s) this check participates in. Defaults to `"readiness"`. */
  probe?: HealthProbe;
  /** Optional tags surfaced in the report. */
  tags?: readonly string[];
}

export interface HealthRegistryOptions {
  /** Default per-check timeout. Defaults to 5000ms. */
  defaultTimeoutMs?: number;
  /**
   * Include thrown error messages in reports. Defaults to false — error
   * messages often contain hostnames, credentials or internal paths.
   */
  exposeErrorMessages?: boolean;
  /** Static info included in every report (e.g. `{ version: "1.2.3" }`). */
  info?: Record<string, JsonValue>;
  /** Clock override for testing. */
  now?: () => number;
}

export interface CheckReport {
  status: HealthStatus;
  durationMs: number;
  critical: boolean;
  message?: string;
  details?: Record<string, JsonValue>;
  tags?: readonly string[];
}

export interface HealthReport {
  status: HealthStatus;
  probe: "liveness" | "readiness";
  timestamp: string;
  /** Process uptime in seconds. */
  uptime: number;
  info?: Record<string, JsonValue>;
  checks: Record<string, CheckReport>;
}

interface Registered {
  name: string;
  fn: HealthCheckFn;
  timeoutMs: number | undefined;
  critical: boolean;
  probe: HealthProbe;
  tags: readonly string[] | undefined;
}

export interface HealthRegistry {
  /** Registers a check. Re-registering a name replaces the previous check. */
  register(name: string, fn: HealthCheckFn, options?: HealthCheckOptions): () => void;
  unregister(name: string): boolean;
  /** Names of registered checks. */
  list(): string[];
  /** Runs liveness checks (should be cheap — "is the process alive and not deadlocked?"). */
  liveness(): Promise<HealthReport>;
  /** Runs readiness checks ("can we serve traffic — are dependencies reachable?"). */
  readiness(): Promise<HealthReport>;
  /** Runs a single named check. */
  run(name: string): Promise<CheckReport>;
}

const HTTP_STATUS: Record<HealthStatus, number> = { ok: 200, degraded: 200, fail: 503 };

/** Maps a report to an HTTP status: `ok`/`degraded` → 200, `fail` → 503. */
export function healthStatusCode(report: Pick<HealthReport, "status">): number {
  return HTTP_STATUS[report.status];
}

function normalizeResult(value: void | boolean | HealthCheckResult): HealthCheckResult {
  if (value === undefined || value === true) return { status: "ok" };
  if (value === false) return { status: "fail" };
  return value;
}

function combine(statuses: Array<{ status: HealthStatus; critical: boolean }>): HealthStatus {
  let overall: HealthStatus = "ok";
  for (const { status, critical } of statuses) {
    if (status === "fail") {
      if (critical) return "fail";
      overall = "degraded";
    } else if (status === "degraded" && overall === "ok") {
      overall = "degraded";
    }
  }
  return overall;
}

/**
 * Creates a health-check registry.
 *
 * @example
 * const health = createHealthRegistry({ info: { version: "1.4.0" } });
 * health.register("postgres", (signal) => db.ping({ signal }), { timeoutMs: 2000 });
 * health.register("cache", () => redis.ping(), { critical: false });
 * const report = await health.readiness(); // { status: "ok", checks: { postgres: {...}, cache: {...} } }
 */
export function createHealthRegistry(options: HealthRegistryOptions = {}): HealthRegistry {
  const checks = new Map<string, Registered>();
  const defaultTimeout = options.defaultTimeoutMs ?? 5000;
  const exposeErrors = options.exposeErrorMessages ?? false;
  const now = options.now ?? (() => Date.now());

  const execute = async (check: Registered): Promise<CheckReport> => {
    const timeoutMs = check.timeoutMs ?? defaultTimeout;
    const started = performance.now();
    let result: HealthCheckResult;
    try {
      const value = await withTimeout((signal) => check.fn(signal), timeoutMs);
      result = normalizeResult(value);
    } catch (err) {
      if (isTimeoutError(err)) {
        result = { status: "fail", message: `Timed out after ${timeoutMs}ms` };
      } else {
        const message = exposeErrors && err instanceof Error ? err.message : "Check failed";
        result = { status: "fail", message };
      }
    }
    const report: CheckReport = {
      status: result.status,
      durationMs: roundDuration(performance.now() - started),
      critical: check.critical,
    };
    if (result.message !== undefined) report.message = result.message;
    if (result.details !== undefined) report.details = result.details;
    if (check.tags) report.tags = check.tags;
    return report;
  };

  const runProbe = async (probe: "liveness" | "readiness"): Promise<HealthReport> => {
    const selected = [...checks.values()].filter((c) => c.probe === probe || c.probe === "both");
    const results = await Promise.all(
      selected.map(async (c) => [c.name, await execute(c)] as const),
    );
    const reportChecks: Record<string, CheckReport> = {};
    for (const [name, report] of results) reportChecks[name] = report;
    const status = combine(results.map(([, r]) => ({ status: r.status, critical: r.critical })));
    const report: HealthReport = {
      status,
      probe,
      timestamp: new Date(now()).toISOString(),
      uptime: Math.round(process.uptime()),
      checks: reportChecks,
    };
    if (options.info) report.info = options.info;
    return report;
  };

  return {
    register(name, fn, opts = {}) {
      if (!name || typeof name !== "string")
        throw new TypeError("Health check name must be a non-empty string");
      checks.set(name, {
        name,
        fn,
        timeoutMs: opts.timeoutMs,
        critical: opts.critical ?? true,
        probe: opts.probe ?? "readiness",
        tags: opts.tags,
      });
      return () => {
        checks.delete(name);
      };
    },
    unregister(name) {
      return checks.delete(name);
    },
    list() {
      return [...checks.keys()];
    },
    liveness: () => runProbe("liveness"),
    readiness: () => runProbe("readiness"),
    async run(name) {
      const check = checks.get(name);
      if (!check) throw new RangeError(`Unknown health check "${name}"`);
      return execute(check);
    },
  };
}

/** Built-in check: fails when heap usage exceeds `maxHeapUsedBytes`. */
export function memoryHeapCheck(maxHeapUsedBytes: number): HealthCheckFn {
  return () => {
    const { heapUsed, heapTotal } = process.memoryUsage();
    return {
      status: heapUsed > maxHeapUsedBytes ? "fail" : "ok",
      details: { heapUsed, heapTotal, limit: maxHeapUsedBytes },
    };
  };
}

/** Built-in check: measures event-loop lag; `degraded` above `warnMs`, `fail` above `failMs`. */
export function eventLoopLagCheck(opts: { warnMs?: number; failMs?: number } = {}): HealthCheckFn {
  const warnMs = opts.warnMs ?? 100;
  const failMs = opts.failMs ?? 1000;
  return () =>
    new Promise<HealthCheckResult>((resolve) => {
      const start = performance.now();
      setImmediate(() => {
        const lag = roundDuration(performance.now() - start);
        const status: HealthStatus = lag > failMs ? "fail" : lag > warnMs ? "degraded" : "ok";
        resolve({ status, details: { lagMs: lag } });
      });
    });
}
