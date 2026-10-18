/**
 * Built-in error codes. Codes are stable, machine-readable identifiers that
 * clients can branch on; HTTP statuses are a lossy projection of them.
 */
export const ErrorCodes = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  CONFLICT: "CONFLICT",
  GONE: "GONE",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  BAD_GATEWAY: "BAD_GATEWAY",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  GATEWAY_TIMEOUT: "GATEWAY_TIMEOUT",
  CONFIG_INVALID: "CONFIG_INVALID",
  TIMEOUT: "TIMEOUT",
} as const;

export type BuiltinErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Any error code: a built-in one, or a custom `UPPER_SNAKE_CASE` string of your own.
 * The `(string & {})` trick keeps autocompletion for built-ins.
 */
export type ErrorCode = BuiltinErrorCode | (string & {});

/** Default HTTP status for each built-in code. */
export const CODE_TO_STATUS: Readonly<Record<BuiltinErrorCode, number>> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  GONE: 410,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_ENTITY: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  CONFIG_INVALID: 500,
  TIMEOUT: 504,
};

/** Default code for an HTTP status (used when wrapping foreign errors). */
export const STATUS_TO_CODE: Readonly<Record<number, BuiltinErrorCode>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  410: "GONE",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE_ENTITY",
  429: "RATE_LIMITED",
  500: "INTERNAL_ERROR",
  501: "NOT_IMPLEMENTED",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
  504: "GATEWAY_TIMEOUT",
};

const STATUS_TEXT: Readonly<Record<number, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Payload Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a teapot",
  422: "Unprocessable Entity",
  423: "Locked",
  424: "Failed Dependency",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  507: "Insufficient Storage",
  511: "Network Authentication Required",
};

/** Returns the status for a code; unknown custom codes default to 500. */
export function codeToStatus(code: ErrorCode): number {
  return (CODE_TO_STATUS as Record<string, number | undefined>)[code] ?? 500;
}

/** Returns the default code for a status; unknown statuses map by class (4xx → BAD_REQUEST, 5xx → INTERNAL_ERROR). */
export function statusToCode(status: number): BuiltinErrorCode {
  const direct = STATUS_TO_CODE[status];
  if (direct) return direct;
  if (status >= 400 && status < 500) return "BAD_REQUEST";
  return "INTERNAL_ERROR";
}

/** Returns the canonical reason phrase for a status (`404` → `"Not Found"`). */
export function httpStatusText(status: number): string {
  return STATUS_TEXT[status] ?? (status >= 500 ? "Internal Server Error" : "Error");
}

/** Returns true if `status` is a valid HTTP error status (400–599). */
export function isErrorStatus(status: unknown): status is number {
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599;
}
