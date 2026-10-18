/**
 * @nexkitjs/testing — helpers for testing applications built with NexKit.
 * Framework-agnostic: works with Vitest, Jest, node:test and others.
 *
 * @packageDocumentation
 */
import { createRequestContext, runWithRequestContext, type RequestContext } from "@nexkitjs/core";
import { AppError, type ErrorCode } from "@nexkitjs/errors";
import {
  createLogger,
  memoryTransport,
  type LogEntry,
  type LogLevel,
  type Logger,
  type LoggerOptions,
} from "@nexkitjs/logger";
import {
  MemoryRateLimitStore,
  createFixedWindowLimiter,
  type RateLimiter,
} from "@nexkitjs/ratelimit";

/* -------------------------------------------------------------------------- */
/*                                   Logger                                   */
/* -------------------------------------------------------------------------- */

export interface TestLogger {
  logger: Logger;
  /** All captured entries, in order. */
  entries: LogEntry[];
  /** Entries at a given level. */
  at(level: LogLevel): LogEntry[];
  /** First entry whose message contains `text` (or matches the RegExp). */
  find(text: string | RegExp): LogEntry | undefined;
  /** True when any entry contains `text` anywhere in its JSON form. Useful for secret-leak assertions. */
  contains(text: string): boolean;
  clear(): void;
}

/** Creates a logger that captures entries in memory (level `trace`, fixed timestamp). */
export function createTestLogger(options: Omit<LoggerOptions, "transport"> = {}): TestLogger {
  const transport = memoryTransport();
  const logger = createLogger({
    level: "trace",
    timestamp: () => "1970-01-01T00:00:00.000Z",
    ...options,
    transport,
  });
  return {
    logger,
    entries: transport.entries,
    at: (level) => transport.entries.filter((e) => e.level === level),
    find: (text) =>
      transport.entries.find((e) =>
        typeof text === "string" ? e.msg.includes(text) : text.test(e.msg),
      ),
    contains: (text) => transport.entries.some((e) => JSON.stringify(e).includes(text)),
    clear: () => transport.clear(),
  };
}

/* -------------------------------------------------------------------------- */
/*                                Environment                                 */
/* -------------------------------------------------------------------------- */

/**
 * Temporarily overrides `process.env` for the duration of `fn` (sync or async),
 * then restores the previous values. `undefined` deletes a variable.
 */
export async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                               Error assertions                             */
/* -------------------------------------------------------------------------- */

export interface AppErrorExpectation {
  code?: ErrorCode;
  status?: number;
  /** Substring or RegExp matched against the *internal* message. */
  message?: string | RegExp;
  /** Substring or RegExp matched against the public message. */
  publicMessage?: string | RegExp;
  /** Expected class (e.g. `NotFoundError`). */
  instanceOf?: abstract new (...args: never[]) => unknown;
}

/** Thrown by {@link expectAppError} on mismatch. */
export class AppErrorAssertionError extends Error {
  constructor(
    message: string,
    readonly actual: unknown,
  ) {
    super(message);
    this.name = "AppErrorAssertionError";
  }
}

function matches(actual: string, expected: string | RegExp): boolean {
  return typeof expected === "string" ? actual.includes(expected) : expected.test(actual);
}

/**
 * Asserts that `value` is an `AppError` matching the expectation and returns it typed.
 *
 * @example
 * const err = expectAppError(await rejected(() => service.get(1)), { code: "NOT_FOUND", status: 404 });
 */
export function expectAppError(value: unknown, expectation: AppErrorExpectation = {}): AppError {
  if (!AppError.is(value)) {
    throw new AppErrorAssertionError(`Expected an AppError but received ${describe(value)}`, value);
  }
  const problems: string[] = [];
  if (expectation.code !== undefined && value.code !== expectation.code) {
    problems.push(`code: expected "${expectation.code}", received "${value.code}"`);
  }
  if (expectation.status !== undefined && value.status !== expectation.status) {
    problems.push(`status: expected ${expectation.status}, received ${value.status}`);
  }
  if (expectation.message !== undefined && !matches(value.message, expectation.message)) {
    problems.push(
      `message: expected to match ${String(expectation.message)}, received "${value.message}"`,
    );
  }
  if (
    expectation.publicMessage !== undefined &&
    !matches(value.publicMessage, expectation.publicMessage)
  ) {
    problems.push(
      `publicMessage: expected to match ${String(expectation.publicMessage)}, received "${value.publicMessage}"`,
    );
  }
  if (expectation.instanceOf && !(value instanceof expectation.instanceOf)) {
    problems.push(
      `instanceOf: expected ${expectation.instanceOf.name}, received ${value.constructor.name}`,
    );
  }
  if (problems.length) {
    throw new AppErrorAssertionError(
      `AppError did not match expectation:\n  - ${problems.join("\n  - ")}`,
      value,
    );
  }
  return value;
}

/** Runs `fn` and returns the thrown value (or rejection reason). Throws if nothing was thrown. */
export async function rejected(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new AppErrorAssertionError(
    "Expected function to throw, but it returned normally",
    undefined,
  );
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/* -------------------------------------------------------------------------- */
/*                               Request context                              */
/* -------------------------------------------------------------------------- */

/** Runs `fn` inside a request context (defaults to `requestId: "test-request-id"`). */
export function runInTestContext<T>(fn: () => T, init: Partial<RequestContext> = {}): T {
  const { requestId = "test-request-id", ...rest } = init;
  return runWithRequestContext(createRequestContext({ requestId, ...rest }), fn);
}

/* -------------------------------------------------------------------------- */
/*                               Clock & limiter                              */
/* -------------------------------------------------------------------------- */

export interface ManualClock {
  now(this: void): number;
  advance(this: void, ms: number): void;
  set(this: void, epochMs: number): void;
}

/** A deterministic clock for time-dependent code (rate limiters, caches). */
export function createManualClock(start = 1_700_000_000_000): ManualClock {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
    set: (epochMs) => {
      t = epochMs;
    },
  };
}

export interface TestRateLimiter {
  limiter: RateLimiter;
  clock: ManualClock;
  store: MemoryRateLimitStore;
  dispose(): void;
}

/** A single-process limiter wired to a manual clock, for deterministic rate-limit tests. */
export function createTestRateLimiter(options: {
  limit: number;
  windowMs: number;
}): TestRateLimiter {
  const clock = createManualClock();
  const store = new MemoryRateLimitStore({ now: clock.now, cleanupIntervalMs: 0 });
  const limiter = createFixedWindowLimiter({
    store,
    limit: options.limit,
    windowMs: options.windowMs,
    now: clock.now,
  });
  return { limiter, clock, store, dispose: () => store.dispose() };
}

/* -------------------------------------------------------------------------- */
/*                                Health stubs                                */
/* -------------------------------------------------------------------------- */

/** Creates a health check that resolves/rejects after `delayMs` with the given outcome. */
export function healthCheckStub(
  options: { status?: "ok" | "degraded" | "fail"; delayMs?: number; throws?: boolean } = {},
) {
  const { status = "ok", delayMs = 0, throws = false } = options;
  return async (): Promise<{ status: "ok" | "degraded" | "fail" }> => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    if (throws) throw new Error("stubbed failure");
    return { status };
  };
}
