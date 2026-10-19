import { isTimeoutError } from "@nexkitjs/core";
import { AppError } from "./app-error.js";
import { isErrorStatus, statusToCode } from "./codes.js";
import {
  GatewayTimeoutError,
  InternalError,
  PayloadTooLargeError,
  ValidationError,
} from "./http-errors.js";

export interface NormalizeErrorOptions {
  /**
   * Trust `status`/`statusCode` properties on foreign errors (as set by Express
   * body parsers, `http-errors`, Fastify, etc.) and expose their message for 4xx.
   * Defaults to true.
   */
  trustForeignStatus?: boolean;
  /** Message used for wrapped non-operational errors. Defaults to "Internal Server Error". */
  fallbackMessage?: string;
}

interface ForeignErrorLike {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  type?: unknown;
  expose?: unknown;
  validation?: unknown;
  validationContext?: unknown;
  message?: unknown;
}

/**
 * Converts *any* thrown value into an {@link AppError} so error handlers only
 * ever deal with one shape. Recognizes:
 *
 * - `AppError` instances (returned as-is)
 * - Errors with numeric `status`/`statusCode` (Express `http-errors`, body-parser, Fastify)
 * - Body-parser `entity.too.large` → 413
 * - Fastify `FST_ERR_CTP_BODY_TOO_LARGE` → 413, Fastify schema `validation` → 422
 * - `TimeoutError` from `@nexkitjs/core` → 504
 * - Everything else → 500 `InternalError` with the original as `cause`
 */
export function normalizeError(error: unknown, options: NormalizeErrorOptions = {}): AppError {
  if (AppError.is(error)) return error;

  const trustForeign = options.trustForeignStatus ?? true;
  const fallback = options.fallbackMessage ?? "Internal Server Error";

  if (error instanceof Error) {
    const foreign = error as Error & ForeignErrorLike;

    if (isTimeoutError(error)) {
      return new GatewayTimeoutError("Upstream operation timed out", { cause: error });
    }

    if (foreign.type === "entity.too.large" || foreign.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return new PayloadTooLargeError("Request body is too large", { cause: error });
    }

    if (Array.isArray(foreign.validation)) {
      const issues = (foreign.validation as Array<Record<string, unknown>>).map((v) => {
        const rawPath =
          typeof v.instancePath === "string"
            ? v.instancePath
            : typeof v.dataPath === "string"
              ? v.dataPath
              : "";
        return {
          path: rawPath.replace(/^\//, "").replace(/\//g, "."),
          message: typeof v.message === "string" ? v.message : "is invalid",
        };
      });
      return new ValidationError(issues, "Validation failed", { cause: error });
    }

    const rawStatus = foreign.status ?? foreign.statusCode;
    if (trustForeign && isErrorStatus(rawStatus)) {
      const expose = typeof foreign.expose === "boolean" ? foreign.expose : rawStatus < 500;
      const code =
        typeof foreign.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(foreign.code)
          ? foreign.code
          : statusToCode(rawStatus);
      return new AppError(error.message || fallback, {
        status: rawStatus,
        code,
        expose,
        cause: error,
      });
    }

    return new InternalError(error.message || fallback, { cause: error, expose: false });
  }

  return new InternalError(fallback, {
    cause: error,
    meta: { thrownValue: typeof error === "string" ? error : safeDescribe(error) },
  });
}

function safeDescribe(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Asserts a condition, throwing the provided error (or a 400 `AppError` from a
 * message) when it is falsy. Narrows types like `assert` from `node:assert`.
 */
export function assert(
  condition: unknown,
  errorOrMessage: AppError | string | (() => AppError),
): asserts condition {
  if (condition) return;
  if (typeof errorOrMessage === "function") throw errorOrMessage();
  if (typeof errorOrMessage === "string") {
    throw new AppError(errorOrMessage, { code: "BAD_REQUEST", status: 400 });
  }
  throw errorOrMessage;
}
