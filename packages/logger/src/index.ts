/**
 * @nexkitjs/logger — structured JSON logging with redaction and request correlation.
 *
 * @packageDocumentation
 */
export { createLogger, createNoopLogger, serializeErrorForLog } from "./logger.js";
export type { LoggerOptions } from "./logger.js";

export {
  callbackTransport,
  jsonTransport,
  memoryTransport,
  multiTransport,
  prettyTransport,
  stringifyEntry,
} from "./transports.js";
export type { MemoryTransport, PrettyTransportOptions, WritableLike } from "./transports.js";

export { LOG_LEVELS } from "./types.js";
export type {
  EmittableLevel,
  LogEntry,
  LogFields,
  LogLevel,
  LogMethod,
  LogTransport,
  Logger,
} from "./types.js";
