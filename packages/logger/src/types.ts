export const LOG_LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Number.POSITIVE_INFINITY,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;
export type EmittableLevel = Exclude<LogLevel, "silent">;

/** A single structured log record, after redaction and context enrichment. */
export interface LogEntry {
  level: EmittableLevel;
  /** Numeric severity (pino-compatible). */
  levelValue: number;
  time: string;
  msg: string;
  name?: string;
  requestId?: string;
  correlationId?: string;
  err?: unknown;
  [key: string]: unknown;
}

/** Destination for log entries. */
export interface LogTransport {
  /** Receives every entry at or above the logger's level. Should never throw. */
  write(entry: LogEntry): void;
  /** Flush buffered output (called by `logger.flush()`). */
  flush?(): Promise<void> | void;
}

/** Fields accepted by every log method. */
export type LogFields = Record<string, unknown>;

export interface LogMethod {
  (message: string, fields?: LogFields): void;
  (fields: LogFields, message?: string): void;
  (error: Error, message?: string): void;
}

export interface Logger {
  readonly level: LogLevel;
  readonly bindings: Readonly<LogFields>;
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  fatal: LogMethod;
  /** Creates a child logger with additional bound fields. */
  child(bindings: LogFields): Logger;
  /** Changes the minimum level (affects children that haven't overridden it). */
  setLevel(level: LogLevel): void;
  isLevelEnabled(level: LogLevel): boolean;
  /** Flushes all transports. */
  flush(): Promise<void>;
}
