/** Thrown by {@link withTimeout} when the wrapped operation exceeds its deadline. */
export class TimeoutError extends Error {
  readonly code = "TIMEOUT" as const;
  readonly timeoutMs: number;

  constructor(timeoutMs: number, message?: string) {
    super(message ?? `Operation timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export interface WithTimeoutOptions {
  /** Custom error message. */
  message?: string;
  /** Optional external abort signal; aborting rejects early with the signal's reason. */
  signal?: AbortSignal;
}

/** Returns true when `err` is a {@link TimeoutError} (or structurally equivalent). */
export function isTimeoutError(err: unknown): err is TimeoutError {
  return (
    err instanceof TimeoutError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { code?: unknown }).code === "TIMEOUT" &&
      (err as { name?: unknown }).name === "TimeoutError")
  );
}

/**
 * Races a promise (or promise-returning function) against a timeout.
 *
 * When a function is supplied it receives an `AbortSignal` that is aborted on
 * timeout so cooperative operations (fetch, database drivers) can cancel work.
 *
 * @example
 * const rows = await withTimeout((signal) => db.query(sql, { signal }), 2000);
 */
export function withTimeout<T>(
  operation: Promise<T> | ((signal: AbortSignal) => Promise<T> | T),
  timeoutMs: number,
  options: WithTimeoutOptions = {},
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError(`timeoutMs must be a non-negative finite number, received ${timeoutMs}`);
  }

  const controller = new AbortController();
  const promise = Promise.resolve(
    typeof operation === "function" ? operation(controller.signal) : operation,
  );

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort(new TimeoutError(timeoutMs, options.message));
      reject(new TimeoutError(timeoutMs, options.message));
    }, timeoutMs);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const reason: unknown = options.signal?.reason;
      controller.abort(reason);
      reject(reason instanceof Error ? reason : new Error("Operation aborted"));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** Returns a function that reports elapsed milliseconds (fractional) since it was created. */
export function startTimer(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}

/** Rounds a millisecond duration to a sensible precision for logs. */
export function roundDuration(ms: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(ms * factor) / factor;
}
