/**
 * @nexkitjs/errors — standardized application errors.
 *
 * @packageDocumentation
 */
export { AppError, isAppError, serializeError } from "./app-error.js";
export type {
  AppErrorOptions,
  ErrorDetails,
  InternalErrorJSON,
  PublicErrorJSON,
  SerializeOptions,
} from "./app-error.js";

export {
  CODE_TO_STATUS,
  ErrorCodes,
  STATUS_TO_CODE,
  codeToStatus,
  httpStatusText,
  isErrorStatus,
  statusToCode,
} from "./codes.js";
export type { BuiltinErrorCode, ErrorCode } from "./codes.js";

export {
  BadGatewayError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  GatewayTimeoutError,
  GoneError,
  InternalError,
  MethodNotAllowedError,
  NotFoundError,
  NotImplementedError,
  PayloadTooLargeError,
  RateLimitError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableEntityError,
  UnsupportedMediaTypeError,
  ValidationError,
} from "./http-errors.js";
export type { TooManyRequestsOptions, ValidationErrorIssue } from "./http-errors.js";

export { assert, normalizeError } from "./normalize.js";
export type { NormalizeErrorOptions } from "./normalize.js";
