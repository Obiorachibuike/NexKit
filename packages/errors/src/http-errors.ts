import type { ValidationIssue } from "@nexkitjs/core";
import { AppError, type AppErrorOptions, type ErrorDetails } from "./app-error.js";
import { httpStatusText } from "./codes.js";

type HttpErrorOptions = Omit<AppErrorOptions, "status">;

function withStatus(options: HttpErrorOptions, status: number, code: string): AppErrorOptions {
  return { ...options, code: options.code ?? code, status };
}

/** 400 — malformed request syntax or invalid parameters. */
export class BadRequestError extends AppError {
  constructor(message: string = httpStatusText(400), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 400, "BAD_REQUEST"));
  }
}

/** 401 — missing or invalid authentication. */
export class UnauthorizedError extends AppError {
  constructor(message: string = httpStatusText(401), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 401, "UNAUTHORIZED"));
  }
}

/** 403 — authenticated but not permitted. */
export class ForbiddenError extends AppError {
  constructor(message: string = httpStatusText(403), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 403, "FORBIDDEN"));
  }
}

/** 404 — resource not found. */
export class NotFoundError extends AppError {
  constructor(message: string = httpStatusText(404), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 404, "NOT_FOUND"));
  }
}

/** 405 — method not allowed on this resource. */
export class MethodNotAllowedError extends AppError {
  constructor(message: string = httpStatusText(405), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 405, "METHOD_NOT_ALLOWED"));
  }
}

/** 409 — state conflict (duplicate, version mismatch). */
export class ConflictError extends AppError {
  constructor(message: string = httpStatusText(409), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 409, "CONFLICT"));
  }
}

/** 410 — resource permanently gone. */
export class GoneError extends AppError {
  constructor(message: string = httpStatusText(410), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 410, "GONE"));
  }
}

/** 413 — request body exceeds configured limits. */
export class PayloadTooLargeError extends AppError {
  constructor(message: string = httpStatusText(413), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 413, "PAYLOAD_TOO_LARGE"));
  }
}

/** 415 — unsupported content type. */
export class UnsupportedMediaTypeError extends AppError {
  constructor(message: string = httpStatusText(415), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 415, "UNSUPPORTED_MEDIA_TYPE"));
  }
}

/** 422 — semantically invalid request. Prefer {@link ValidationError} for field-level issues. */
export class UnprocessableEntityError extends AppError {
  constructor(message: string = httpStatusText(422), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 422, "UNPROCESSABLE_ENTITY"));
  }
}

/** 500 — unexpected failure. Message is never exposed by default. */
export class InternalError extends AppError {
  constructor(message: string = httpStatusText(500), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 500, "INTERNAL_ERROR"));
  }
}

/** 501 — functionality not implemented. */
export class NotImplementedError extends AppError {
  constructor(message: string = httpStatusText(501), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 501, "NOT_IMPLEMENTED"));
  }
}

/** 502 — upstream returned an invalid response. */
export class BadGatewayError extends AppError {
  constructor(message: string = httpStatusText(502), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 502, "BAD_GATEWAY"));
  }
}

/** 503 — temporarily unavailable (maintenance, overloaded, dependency down). */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = httpStatusText(503), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 503, "SERVICE_UNAVAILABLE"));
  }
}

/** 504 — upstream timed out. */
export class GatewayTimeoutError extends AppError {
  constructor(message: string = httpStatusText(504), options: HttpErrorOptions = {}) {
    super(message, withStatus(options, 504, "GATEWAY_TIMEOUT"));
  }
}

/** A single public-facing validation issue. */
export interface ValidationErrorIssue {
  path: string;
  message: string;
}

/**
 * 422 — request failed schema validation. Carries structured `issues` that are
 * exposed to clients under `details.issues`.
 */
export class ValidationError extends AppError {
  readonly issues: readonly ValidationErrorIssue[];

  constructor(
    issues: ReadonlyArray<ValidationErrorIssue | ValidationIssue>,
    message = "Validation failed",
    options: Omit<HttpErrorOptions, "details"> = {},
  ) {
    const publicIssues = issues.map((i) => ({ path: i.path, message: i.message }));
    super(message, {
      ...options,
      code: options.code ?? "VALIDATION_ERROR",
      status: 422,
      details: { issues: publicIssues } satisfies ErrorDetails,
    });
    this.issues = publicIssues;
  }

  /** Convenience for a single-field error. */
  static forField(path: string, message: string): ValidationError {
    return new ValidationError([{ path, message }]);
  }
}

export interface TooManyRequestsOptions extends HttpErrorOptions {
  /** Seconds until the client may retry. Emitted as a `Retry-After` header. */
  retryAfterSeconds?: number;
  /** The limit that was exceeded, for diagnostics/headers. */
  limit?: number;
}

/** 429 — rate limit exceeded. */
export class TooManyRequestsError extends AppError {
  readonly retryAfterSeconds: number | undefined;
  readonly limit: number | undefined;

  constructor(message = "Too Many Requests", options: TooManyRequestsOptions = {}) {
    const { retryAfterSeconds, limit, ...rest } = options;
    const headers = { ...rest.headers };
    if (retryAfterSeconds !== undefined) {
      headers["retry-after"] = String(Math.max(0, Math.ceil(retryAfterSeconds)));
    }
    super(message, { ...rest, code: rest.code ?? "RATE_LIMITED", status: 429, headers });
    this.retryAfterSeconds = retryAfterSeconds;
    this.limit = limit;
  }
}

/** Alias of {@link TooManyRequestsError}. */
export { TooManyRequestsError as RateLimitError };
