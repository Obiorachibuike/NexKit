import {
  NotFoundError,
  normalizeError,
  type AppError,
  type NormalizeErrorOptions,
} from "@nexkitjs/errors";
import type { Logger } from "@nexkitjs/logger";
import { errorBody } from "@nexkitjs/response";
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";

export interface ErrorHandlerOptions extends NormalizeErrorOptions {
  /** Logger for errors. 5xx are logged at `error`, 4xx at `warn` (configurable via `logClientErrors`). */
  logger?: Logger;
  /** Log 4xx errors. Defaults to true (at `warn`). */
  logClientErrors?: boolean;
  /** Include the request id in the response body. Defaults to true. */
  includeRequestId?: boolean;
  /** Hook invoked with the normalized error before the response is written. */
  onError?: (error: AppError, req: Request, res: Response) => void;
  /** Customize the response body. Defaults to `@nexkitjs/response`'s `errorBody`. */
  formatBody?: (error: AppError, req: Request) => unknown;
}

/**
 * Express error-handling middleware. Normalizes anything thrown into an
 * `AppError`, logs it (without leaking to the client), sets any headers the
 * error carries (e.g. `Retry-After`), and responds with a consistent JSON body.
 *
 * Mount it **last**.
 */
export function errorHandler(options: ErrorHandlerOptions = {}): ErrorRequestHandler {
  const includeRequestId = options.includeRequestId ?? true;
  const logClientErrors = options.logClientErrors ?? true;

  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    const error = normalizeError(err, options);

    const logger = options.logger;
    if (logger) {
      const fields = { err: error, method: req.method, path: req.path, status: error.status };
      if (error.status >= 500) logger.error(fields, error.message);
      else if (logClientErrors) logger.warn(fields, error.publicMessage);
    }

    options.onError?.(error, req, res);

    if (res.headersSent) {
      // Delegate to Express' default handler which closes the connection.
      next(err);
      return;
    }

    for (const [name, value] of Object.entries(error.headers ?? {})) res.setHeader(name, value);
    const body = options.formatBody
      ? options.formatBody(error, req)
      : errorBody(error, { requestId: includeRequestId ? req.id : undefined });
    res.status(error.status).json(body);
  };
}

/** Converts unmatched routes into a 404 `NotFoundError`. Mount after your routes, before `errorHandler`. */
export function notFoundHandler(message = "Route not found"): RequestHandler {
  return (req, _res, next) => {
    next(new NotFoundError(message, { details: { method: req.method, path: req.path } }));
  };
}
