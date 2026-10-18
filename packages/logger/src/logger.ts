import {
  createRedactor,
  getRequestContext,
  type RedactOptions,
  type Redactor,
} from "@nexkitjs/core";
import { jsonTransport, prettyTransport } from "./transports.js";
import {
  LOG_LEVELS,
  type EmittableLevel,
  type LogEntry,
  type LogFields,
  type LogLevel,
  type LogMethod,
  type LogTransport,
  type Logger,
} from "./types.js";

export interface LoggerOptions {
  /** Minimum level to emit. Defaults to `LOG_LEVEL` env var, or `"info"`. */
  level?: LogLevel;
  /** Logger name included in every entry. */
  name?: string;
  /** Static fields included in every entry (service, version, env…). */
  base?: LogFields;
  /**
   * Where entries go. Defaults to `jsonTransport(process.stdout)`.
   * Pass `"pretty"` for a development-friendly format.
   */
  transport?: LogTransport | readonly LogTransport[] | "json" | "pretty";
  /** Redaction options, or `false` to disable. Defaults to the core defaults. */
  redact?: RedactOptions | false;
  /** Attach `requestId`/`correlationId` from the active request context. Defaults to true. */
  includeContext?: boolean;
  /** Timestamp function. Defaults to ISO-8601 `new Date().toISOString()`. */
  timestamp?: () => string;
  /** Key under which errors are serialized. Defaults to `"err"`. */
  errorKey?: string;
  /** Include stack traces when serializing errors. Defaults to true. */
  includeStack?: boolean;
  /** Called when a transport throws; defaults to a no-op. */
  onTransportError?: (error: unknown) => void;
}

const EMITTABLE: readonly EmittableLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

function resolveTransport(
  transport: LoggerOptions["transport"],
): LogTransport | readonly LogTransport[] {
  if (transport === undefined || transport === "json") return jsonTransport();
  if (transport === "pretty") return prettyTransport();
  return transport;
}

function resolveLevel(level: LogLevel | undefined): LogLevel {
  if (level) return level;
  const fromEnv = process.env.LOG_LEVEL?.toLowerCase();
  if (fromEnv && fromEnv in LOG_LEVELS) return fromEnv as LogLevel;
  return "info";
}

interface SerializedErrorLike {
  name: string;
  message: string;
  stack?: string;
  [key: string]: unknown;
}

/**
 * Serializes an error for logging. Honors `toInternalJSON()` (NexKit AppError)
 * and plain `Error` cause chains without depending on `@nexkitjs/errors`.
 */
export function serializeErrorForLog(error: unknown, includeStack = true, depth = 0): unknown {
  if (depth > 5) return "[MaxCauseDepth]";
  if (error === null || error === undefined) return error;
  const maybeInternal = (error as { toInternalJSON?: (o: { includeStack: boolean }) => unknown })
    .toInternalJSON;
  if (typeof maybeInternal === "function") {
    try {
      return maybeInternal.call(error, { includeStack });
    } catch {
      // fall through to generic handling
    }
  }
  if (error instanceof Error) {
    const out: SerializedErrorLike = { name: error.name, message: error.message };
    if (includeStack && error.stack) out.stack = error.stack;
    for (const key of Object.keys(error)) {
      if (key === "cause") continue;
      out[key] = (error as unknown as Record<string, unknown>)[key];
    }
    const cause = (error as { cause?: unknown }).cause;
    if (cause !== undefined) out.cause = serializeErrorForLog(cause, includeStack, depth + 1);
    return out;
  }
  return error;
}

interface SharedState {
  level: LogLevel;
  transports: readonly LogTransport[];
  redactor: Redactor | null;
  includeContext: boolean;
  timestamp: () => string;
  errorKey: string;
  includeStack: boolean;
  onTransportError: ((error: unknown) => void) | undefined;
}

class NexkitLogger implements Logger {
  readonly bindings: Readonly<LogFields>;
  readonly #state: SharedState;
  #ownLevel: LogLevel | undefined;
  readonly #name: string | undefined;

  trace!: LogMethod;
  debug!: LogMethod;
  info!: LogMethod;
  warn!: LogMethod;
  error!: LogMethod;
  fatal!: LogMethod;

  constructor(
    state: SharedState,
    bindings: LogFields,
    name: string | undefined,
    ownLevel?: LogLevel,
  ) {
    this.#state = state;
    this.bindings = Object.freeze({ ...bindings });
    this.#name = name;
    this.#ownLevel = ownLevel;
    for (const level of EMITTABLE) {
      this[level] = (a: unknown, b?: unknown) => this.#log(level, a, b);
    }
  }

  get level(): LogLevel {
    return this.#ownLevel ?? this.#state.level;
  }

  setLevel(level: LogLevel): void {
    if (!(level in LOG_LEVELS)) throw new RangeError(`Unknown log level "${level}"`);
    this.#ownLevel = level;
  }

  isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  child(bindings: LogFields): Logger {
    const name = typeof bindings.name === "string" ? bindings.name : this.#name;
    const { name: _ignored, ...rest } = bindings;
    return new NexkitLogger(this.#state, { ...this.bindings, ...rest }, name, this.#ownLevel);
  }

  async flush(): Promise<void> {
    await Promise.all(this.#state.transports.map(async (t) => t.flush?.()));
  }

  #log(level: EmittableLevel, first: unknown, second: unknown): void {
    if (!this.isLevelEnabled(level)) return;
    const state = this.#state;

    let msg = "";
    let fields: LogFields = {};
    let err: unknown;

    if (typeof first === "string") {
      msg = first;
      if (second && typeof second === "object") fields = second as LogFields;
    } else if (first instanceof Error) {
      err = first;
      msg = typeof second === "string" ? second : first.message;
    } else if (first && typeof first === "object") {
      fields = first as LogFields;
      if (typeof second === "string") msg = second;
    } else {
      msg = String(first);
    }

    if (fields[state.errorKey] !== undefined) {
      err = fields[state.errorKey];
      const { [state.errorKey]: _omit, ...rest } = fields;
      fields = rest;
    }
    if (!msg && err instanceof Error) msg = err.message;

    const entry: LogEntry = {
      level,
      levelValue: LOG_LEVELS[level],
      time: state.timestamp(),
      msg,
    };
    if (this.#name) entry.name = this.#name;

    if (state.includeContext) {
      const ctx = getRequestContext();
      if (ctx) {
        entry.requestId = ctx.requestId;
        entry.correlationId = ctx.correlationId;
      }
    }

    const merged: LogFields = { ...this.bindings, ...fields };
    const redacted = state.redactor ? state.redactor(merged) : merged;
    for (const key of Object.keys(redacted)) {
      if (key === "level" || key === "time" || key === "msg" || key === "levelValue") continue;
      entry[key] = redacted[key];
    }

    if (err !== undefined) {
      const serialized = serializeErrorForLog(err, state.includeStack);
      entry[state.errorKey] = state.redactor ? state.redactor(serialized) : serialized;
    }

    for (const transport of state.transports) {
      try {
        transport.write(entry);
      } catch (transportError) {
        state.onTransportError?.(transportError);
      }
    }
  }
}

/**
 * Creates a structured logger.
 *
 * @example
 * const logger = createLogger({ name: "api", base: { service: "billing" } });
 * logger.info({ userId: 42 }, "user signed in");
 * logger.error(err, "payment failed");
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const transports = resolveTransport(options.transport);
  const state: SharedState = {
    level: resolveLevel(options.level),
    transports: Array.isArray(transports) ? transports : [transports as LogTransport],
    redactor: options.redact === false ? null : createRedactor(options.redact ?? {}),
    includeContext: options.includeContext ?? true,
    timestamp: options.timestamp ?? (() => new Date().toISOString()),
    errorKey: options.errorKey ?? "err",
    includeStack: options.includeStack ?? true,
    onTransportError: options.onTransportError,
  };
  return new NexkitLogger(state, options.base ?? {}, options.name);
}

/** A logger that discards everything. Handy as a default parameter. */
export function createNoopLogger(): Logger {
  return createLogger({ level: "silent", transport: [] });
}
