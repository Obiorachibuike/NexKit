import { createRedactor, type JsonValue, type RedactOptions } from "@nexkitjs/core";
import { codeToStatus, httpStatusText, statusToCode, type ErrorCode } from "./codes.js";

/** Public-safe details attached to an error (e.g. validation issues). */
export type ErrorDetails = Record<string, JsonValue> | JsonValue[];

export interface AppErrorOptions {
  /** Machine-readable code. Defaults to the code implied by `status`, or `INTERNAL_ERROR`. */
  code?: ErrorCode;
  /** HTTP status. Defaults to the status implied by `code`. */
  status?: number;
  /**
   * Message shown to API clients. Defaults to `message` for 4xx errors and to
   * the generic status text for 5xx errors (so internals never leak).
   */
  publicMessage?: string;
  /** Whether `message` is safe to expose. Defaults to `status < 500`. */
  expose?: boolean;
  /** Public-safe, JSON-serializable details (e.g. field errors). */
  details?: ErrorDetails;
  /** Internal diagnostic data. Never included in public output; redacted in internal output. */
  meta?: Record<string, unknown>;
  /** Underlying cause. */
  cause?: unknown;
  /** Extra headers that should accompany the response (e.g. `Retry-After`). */
  headers?: Record<string, string>;
}

/** Shape returned by {@link AppError.toPublicJSON}. Safe to send to clients. */
export interface PublicErrorJSON {
  code: string;
  message: string;
  status: number;
  details?: ErrorDetails;
}

/** Shape returned by {@link AppError.toInternalJSON}. For logs and diagnostics only. */
export interface InternalErrorJSON extends PublicErrorJSON {
  name: string;
  internalMessage: string;
  expose: boolean;
  stack?: string;
  meta?: Record<string, unknown>;
  cause?: unknown;
}

export interface SerializeOptions {
  /** Include stack traces. Defaults to true. */
  includeStack?: boolean;
  /** Redaction applied to `meta` and `cause`. Pass `false` to disable. */
  redact?: RedactOptions | false;
  /** Max cause-chain depth to serialize. Defaults to 5. */
  maxCauseDepth?: number;
}

const APP_ERROR_MARKER = Symbol.for("nexkit.AppError");

/**
 * Base class for all NexKit application errors.
 *
 * Separates *internal* information (message, meta, cause, stack) from the
 * *public* projection (`code`, `status`, `publicMessage`, `details`).
 *
 * @example
 * throw new AppError("Plan limit reached", { code: "PLAN_LIMIT", status: 402 });
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly expose: boolean;
  readonly details: ErrorDetails | undefined;
  readonly meta: Record<string, unknown> | undefined;
  readonly headers: Readonly<Record<string, string>> | undefined;
  override readonly cause: unknown;
  /** Operational errors are expected failure modes (vs. programmer bugs). Always true for AppError. */
  readonly isOperational: boolean = true;
  readonly #publicMessage: string | undefined;
  readonly [APP_ERROR_MARKER] = true;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    const status = options.status ?? (options.code ? codeToStatus(options.code) : 500);
    this.status = status;
    this.code = options.code ?? statusToCode(status);
    this.expose = options.expose ?? status < 500;
    this.details = options.details;
    this.meta = options.meta;
    this.headers = options.headers;
    this.cause = options.cause;
    this.#publicMessage = options.publicMessage;
    Object.defineProperty(this, APP_ERROR_MARKER, { enumerable: false, value: true });
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, new.target);
    }
  }

  /** The message that is safe to return to clients. */
  get publicMessage(): string {
    if (this.#publicMessage !== undefined) return this.#publicMessage;
    if (this.expose) return this.message;
    return httpStatusText(this.status);
  }

  /** Returns a new error of the same class with extra internal metadata merged in. */
  withMeta(meta: Record<string, unknown>): this {
    const Ctor = this.constructor as new (message: string, options: AppErrorOptions) => this;
    const next = new Ctor(this.message, {
      code: this.code,
      status: this.status,
      expose: this.expose,
      ...(this.#publicMessage !== undefined ? { publicMessage: this.#publicMessage } : {}),
      ...(this.details !== undefined ? { details: this.details } : {}),
      meta: { ...this.meta, ...meta },
      ...(this.cause !== undefined ? { cause: this.cause } : {}),
      ...(this.headers !== undefined ? { headers: { ...this.headers } } : {}),
    });
    if (this.stack !== undefined) next.stack = this.stack;
    return next;
  }

  /** Public, client-safe JSON. Never includes stack, meta, cause or non-exposed messages. */
  toPublicJSON(): PublicErrorJSON {
    const out: PublicErrorJSON = {
      code: this.code,
      message: this.publicMessage,
      status: this.status,
    };
    if (this.details !== undefined) out.details = this.details;
    return out;
  }

  /** Alias for {@link toPublicJSON} so `JSON.stringify(error)` is safe by default. */
  toJSON(): PublicErrorJSON {
    return this.toPublicJSON();
  }

  /** Full diagnostic JSON for logging. `meta` and `cause` are redacted by default. */
  toInternalJSON(options: SerializeOptions = {}): InternalErrorJSON {
    return serializeError(this, options) as InternalErrorJSON;
  }

  /** Type guard that also works across package duplicates (checks a well-known symbol). */
  static is(value: unknown): value is AppError {
    return (
      value instanceof AppError ||
      (typeof value === "object" &&
        value !== null &&
        (value as Record<symbol, unknown>)[APP_ERROR_MARKER] === true)
    );
  }
}

/** Returns true when `value` is an {@link AppError}. */
export function isAppError(value: unknown): value is AppError {
  return AppError.is(value);
}

interface SerializedPlainError {
  name: string;
  message: string;
  stack?: string;
  code?: unknown;
  cause?: unknown;
  [key: string]: unknown;
}

/**
 * Serializes any error (AppError or not) into a JSON-safe object suitable for logs.
 * Cause chains are followed up to `maxCauseDepth`. Output is redacted.
 */
export function serializeError(
  error: unknown,
  options: SerializeOptions = {},
): InternalErrorJSON | SerializedPlainError {
  const includeStack = options.includeStack ?? true;
  const maxCauseDepth = options.maxCauseDepth ?? 5;
  const redactor =
    options.redact === false ? <T>(v: T): T => v : createRedactor(options.redact ?? {});

  const serializeCause = (cause: unknown, depth: number): unknown => {
    if (cause === undefined) return undefined;
    if (depth >= maxCauseDepth) return "[MaxCauseDepth]";
    if (cause instanceof Error) return serializePlain(cause, depth + 1);
    return redactor(cause);
  };

  const serializePlain = (err: Error, depth: number): SerializedPlainError => {
    const out: SerializedPlainError = { name: err.name, message: err.message };
    if (includeStack && err.stack) out.stack = err.stack;
    const extras: Record<string, unknown> = {};
    for (const key of Object.keys(err)) {
      if (key === "cause" || key === "stack" || key === "message" || key === "name") continue;
      extras[key] = (err as unknown as Record<string, unknown>)[key];
    }
    Object.assign(out, redactor(extras));
    const cause = serializeCause((err as { cause?: unknown }).cause, depth);
    if (cause !== undefined) out.cause = cause;
    return out;
  };

  if (AppError.is(error)) {
    const out: InternalErrorJSON = {
      ...error.toPublicJSON(),
      name: error.name,
      internalMessage: error.message,
      expose: error.expose,
    };
    if (includeStack && error.stack) out.stack = error.stack;
    if (error.meta !== undefined) out.meta = redactor(error.meta);
    const cause = serializeCause(error.cause, 0);
    if (cause !== undefined) out.cause = cause;
    return out;
  }

  if (error instanceof Error) return serializePlain(error, 0);

  return {
    name: "NonError",
    message: typeof error === "string" ? error : safeStringify(error),
    value: redactor(error),
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
