import {
  createRequestContext,
  createRedactor,
  isValidRequestId,
  resolveRequestId,
  roundDuration,
  runWithRequestContext,
  type RedactOptions,
  type RequestContext,
} from "@nexkitjs/core";
import type { EmittableLevel, Logger } from "@nexkitjs/logger";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface RequestContextOptions {
  /** Logger used for request logs. When omitted, no request logs are emitted (ids/timing still work). */
  logger?: Logger;
  /** Header to read/write the request id. Defaults to `"x-request-id"`. */
  requestIdHeader?: string;
  /** Header to read/write the correlation id. Defaults to `"x-correlation-id"`. */
  correlationIdHeader?: string;
  /** Accept a client-supplied request id (validated). Defaults to true. */
  trustIncomingRequestId?: boolean;
  /** Echo ids back as response headers. Defaults to true. */
  setResponseHeaders?: boolean;
  /** Paths (exact) or predicate for requests that should not be logged (e.g. health probes). */
  ignore?: readonly string[] | ((req: Request) => boolean);
  /** Extra fields for the request log and context. */
  metadata?: (req: Request, res: Response) => Record<string, unknown>;
  /** Include request headers in the log (redacted). Defaults to false. */
  logHeaders?: boolean;
  /** Include the parsed query in the log (redacted). Defaults to true. */
  logQuery?: boolean;
  /** Log level chooser. Defaults to 5xx→error, 4xx→warn, else info. */
  level?: (req: Request, res: Response) => EmittableLevel;
  /** Redaction applied to logged headers/query. */
  redact?: RedactOptions;
  /** Message for the completion log. Defaults to `"request completed"`. */
  message?: string;
}

function defaultLevel(_req: Request, res: Response): EmittableLevel {
  if (res.statusCode >= 500) return "error";
  if (res.statusCode >= 400) return "warn";
  return "info";
}

/**
 * Express middleware that assigns request/correlation ids, records timing,
 * runs the rest of the chain inside a NexKit request context (so loggers pick
 * up `requestId` automatically) and emits one structured log per request.
 *
 * Mount it first.
 *
 * @example
 * app.use(requestContext({ logger, ignore: ["/health/live", "/health/ready"] }));
 */
export function requestContext(options: RequestContextOptions = {}): RequestHandler {
  const requestIdHeader = (options.requestIdHeader ?? "x-request-id").toLowerCase();
  const correlationIdHeader = (options.correlationIdHeader ?? "x-correlation-id").toLowerCase();
  const trust = options.trustIncomingRequestId ?? true;
  const setHeaders = options.setResponseHeaders ?? true;
  const logHeaders = options.logHeaders ?? false;
  const logQuery = options.logQuery ?? true;
  const levelFor = options.level ?? defaultLevel;
  const message = options.message ?? "request completed";
  const redactor = createRedactor(options.redact);
  const ignored =
    typeof options.ignore === "function"
      ? options.ignore
      : options.ignore
        ? (
            (set) => (req: Request) =>
              set.has(req.path)
          )(new Set(options.ignore))
        : () => false;

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = resolveRequestId(req.headers[requestIdHeader], { trustIncoming: trust });
    const incomingCorrelation = req.headers[correlationIdHeader];
    const correlationId =
      trust &&
      isValidRequestId(
        Array.isArray(incomingCorrelation) ? incomingCorrelation[0] : incomingCorrelation,
      )
        ? Array.isArray(incomingCorrelation)
          ? incomingCorrelation[0]!
          : incomingCorrelation!
        : requestId;

    req.id = requestId;
    req.correlationId = correlationId;
    if (setHeaders) {
      res.setHeader(requestIdHeader, requestId);
      res.setHeader(correlationIdHeader, correlationId);
    }

    const context: RequestContext = createRequestContext({
      requestId,
      correlationId,
      method: req.method,
      path: req.path,
    });

    const logger = options.logger;
    if (logger && !ignored(req)) {
      const start = performance.now();
      const done = () => {
        res.removeListener("finish", done);
        res.removeListener("close", done);
        const fields: Record<string, unknown> = {
          req: {
            method: req.method,
            path: req.path,
            ...(logQuery && Object.keys(req.query ?? {}).length
              ? { query: redactor(req.query) }
              : {}),
            ...(logHeaders ? { headers: redactor(req.headers) } : {}),
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
          res: {
            statusCode: res.statusCode,
            contentLength: res.getHeader("content-length"),
          },
          durationMs: roundDuration(performance.now() - start),
          ...(options.metadata ? options.metadata(req, res) : {}),
        };
        if (!res.writableFinished) fields.aborted = true;
        logger[levelFor(req, res)](fields, message);
      };
      res.once("finish", done);
      res.once("close", done);
    }

    runWithRequestContext(context, () => next());
  };
}
