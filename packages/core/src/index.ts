/**
 * @nexkitjs/core — framework-agnostic primitives shared by every NexKit module.
 *
 * @packageDocumentation
 */
export {
  DEFAULT_REDACT_PATTERNS,
  DEFAULT_REDACT_REPLACEMENT,
  createRedactor,
  isSensitiveKey,
  redact,
} from "./redact.js";
export type { RedactOptions, Redactor } from "./redact.js";

export {
  createRequestContext,
  enterRequestContext,
  getCorrelationId,
  getRequestContext,
  getRequestId,
  requestContextStorage,
  runWithRequestContext,
  setRequestContextValue,
} from "./context.js";
export type { RequestContext } from "./context.js";

export { generateRequestId, isValidRequestId, resolveRequestId } from "./ids.js";
export type { RequestIdValidationOptions } from "./ids.js";

export { TimeoutError, isTimeoutError, roundDuration, startTimer, withTimeout } from "./timeout.js";
export type { WithTimeoutOptions } from "./timeout.js";

export { formatByteSize, parseByteSize } from "./bytes.js";

export {
  formatIssuePath,
  isStandardSchema,
  normalizeIssues,
  parseWith,
  parseWithSync,
} from "./schema.js";
export type { ParseResult, StandardSchemaV1, ValidationIssue } from "./schema.js";

export {
  HEADERS_TO_REMOVE,
  secureHeaders,
  serializeContentSecurityPolicy,
  serializePermissionsPolicy,
} from "./headers.js";
export type {
  ContentSecurityPolicyOptions,
  SecureHeadersOptions,
  StrictTransportSecurityOptions,
} from "./headers.js";

export { deepFreeze, isObject, isPlainObject } from "./types.js";
export type {
  JsonObject,
  JsonPrimitive,
  JsonValue,
  MaybePromise,
  Prettify,
  RequireKeys,
} from "./types.js";
