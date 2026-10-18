/**
 * @nexkitjs/fastify — Fastify plugin for NexKit.
 *
 * ```ts
 * const app = Fastify({ genReqId: requestIdGenerator() });
 * await app.register(nexkit, { logger, health, rateLimit: { limiter } });
 * ```
 *
 * @packageDocumentation
 */
import {
  HEADERS_TO_REMOVE,
  createRedactor,
  createRequestContext,
  generateRequestId,
  isValidRequestId,
  parseWith,
  requestContextStorage,
  roundDuration,
  secureHeaders as buildSecureHeaders,
  type RedactOptions,
  type SecureHeadersOptions,
  type StandardSchemaV1,
} from "@nexkitjs/core";
import {
  NotFoundError,
  ValidationError,
  normalizeError,
  type AppError,
  type NormalizeErrorOptions,
} from "@nexkitjs/errors";
import { healthStatusCode, type HealthRegistry } from "@nexkitjs/health";
import type { EmittableLevel, Logger } from "@nexkitjs/logger";
import {
  rateLimitError,
  rateLimitHeaders,
  type RateLimitHeadersOptions,
  type RateLimiter,
} from "@nexkitjs/ratelimit";
import { errorBody } from "@nexkitjs/response";
import type {
  FastifyError,
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from "fastify";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export interface ValidatedRequestParts<B = unknown, Q = unknown, P = unknown, H = unknown> {
  body: B;
  query: Q;
  params: P;
  headers: H;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Correlation id assigned by the NexKit plugin. */
    correlationId?: string;
    /** Validated data populated by `validateRequest()`. */
    validated?: Partial<ValidatedRequestParts>;
  }
}

export interface RequestContextPluginOptions {
  /** Header to read/write the request id. Defaults to `"x-request-id"`. */
  requestIdHeader?: string;
  /** Header to read/write the correlation id. Defaults to `"x-correlation-id"`. */
  correlationIdHeader?: string;
  /** Trust a validated client-supplied request/correlation id. Defaults to true. */
  trustIncomingRequestId?: boolean;
  /** Echo ids as response headers. Defaults to true. */
  setResponseHeaders?: boolean;
  /** Paths (exact) or predicate for requests that should not be logged. */
  ignore?: readonly string[] | ((req: FastifyRequest) => boolean);
  /** Extra fields for the request log. */
  metadata?: (req: FastifyRequest, reply: FastifyReply) => Record<string, unknown>;
  /** Include request headers in the log (redacted). Defaults to false. */
  logHeaders?: boolean;
  /** Include the parsed query in the log (redacted). Defaults to true. */
  logQuery?: boolean;
  /** Log level chooser. Defaults to 5xx→error, 4xx→warn, else info. */
  level?: (req: FastifyRequest, reply: FastifyReply) => EmittableLevel;
  redact?: RedactOptions;
  message?: string;
}

export interface HealthPluginOptions {
  registry: HealthRegistry;
  /** Defaults to `"/health/live"`. */
  livenessPath?: string;
  /** Defaults to `"/health/ready"`. */
  readinessPath?: string;
}

export interface RateLimitPluginOptions extends RateLimitHeadersOptions {
  limiter: RateLimiter;
  /** Defaults to `request.ip` (configure `trustProxy` appropriately!). */
  keyGenerator?: (req: FastifyRequest) => string | Promise<string>;
  cost?: number | ((req: FastifyRequest) => number);
  skip?: (req: FastifyRequest) => boolean | Promise<boolean>;
  /** Emit `RateLimit-*` headers. Defaults to true. */
  headers?: boolean;
  /** `"allow"` (default) or `"deny"` when the limiter store fails. */
  onStoreError?: "allow" | "deny";
}

export interface ErrorHandlerPluginOptions extends NormalizeErrorOptions {
  /** Log 4xx errors at `warn`. Defaults to true. */
  logClientErrors?: boolean;
  /** Include the request id in the response body. Defaults to true. */
  includeRequestId?: boolean;
  onError?: (error: AppError, req: FastifyRequest, reply: FastifyReply) => void;
  formatBody?: (error: AppError, req: FastifyRequest) => unknown;
}

export interface NexkitPluginOptions {
  /** Logger used for request logs and error logs. */
  logger?: Logger;
  /** Request id/correlation/timing/logging. Pass `false` to disable. Defaults to enabled. */
  requestContext?: RequestContextPluginOptions | false;
  /** Secure headers. Pass `false` to disable. Defaults to enabled with API defaults. */
  secureHeaders?: SecureHeadersOptions | false;
  /** Health routes. Pass a registry or full options. */
  health?: HealthRegistry | HealthPluginOptions;
  /** Rate limiting applied to every route registered in this scope. */
  rateLimit?: RateLimitPluginOptions;
  /** Error handler. Pass `false` to keep Fastify's default. Defaults to enabled. */
  errorHandler?: ErrorHandlerPluginOptions | false;
  /** Register a NexKit-style 404 handler. Defaults to true. */
  notFoundHandler?: boolean;
}

/* -------------------------------------------------------------------------- */
/*                            Request id generation                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns a `genReqId` function for the Fastify factory that trusts a validated
 * incoming header and otherwise generates a UUID.
 *
 * @example
 * const app = Fastify({ genReqId: requestIdGenerator() });
 */
export function requestIdGenerator(options: { header?: string; trustIncoming?: boolean } = {}) {
  const header = (options.header ?? "x-request-id").toLowerCase();
  const trust = options.trustIncoming ?? true;
  return (req: { headers: Record<string, string | string[] | undefined> }): string => {
    const raw = req.headers[header];
    const first = Array.isArray(raw) ? raw[0] : raw;
    return trust && isValidRequestId(first) ? first : generateRequestId();
  };
}

/* -------------------------------------------------------------------------- */
/*                               Hook builders                                */
/* -------------------------------------------------------------------------- */

function defaultLevel(_req: FastifyRequest, reply: FastifyReply): EmittableLevel {
  if (reply.statusCode >= 500) return "error";
  if (reply.statusCode >= 400) return "warn";
  return "info";
}

function registerRequestContext(
  app: FastifyInstance,
  logger: Logger | undefined,
  options: RequestContextPluginOptions,
): void {
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
            (set) => (req: FastifyRequest) =>
              set.has(req.url.split("?")[0] ?? req.url)
          )(new Set(options.ignore))
        : () => false;

  app.addHook("onRequest", (req, reply, done) => {
    const incomingId = req.headers[requestIdHeader];
    const firstId = Array.isArray(incomingId) ? incomingId[0] : incomingId;
    // Fastify assigns `req.id` via genReqId; override only when a trusted header is present
    // and the factory didn't already adopt it.
    if (trust && isValidRequestId(firstId) && req.id !== firstId) req.id = firstId;
    const requestId = isValidRequestId(req.id) ? req.id : generateRequestId();
    if (requestId !== req.id) req.id = requestId;

    const incomingCorr = req.headers[correlationIdHeader];
    const firstCorr = Array.isArray(incomingCorr) ? incomingCorr[0] : incomingCorr;
    const correlationId = trust && isValidRequestId(firstCorr) ? firstCorr : requestId;
    req.correlationId = correlationId;

    if (setHeaders) {
      void reply.header(requestIdHeader, requestId);
      void reply.header(correlationIdHeader, correlationId);
    }

    const context = createRequestContext({
      requestId,
      correlationId,
      method: req.method,
      path: req.url,
    });
    // Run the remainder of the lifecycle inside the context. Fastify continues
    // synchronously from `done()`, so AsyncLocalStorage propagates correctly.
    requestContextStorage.run(context, done);
  });

  if (logger) {
    app.addHook("onResponse", (req, reply, done) => {
      if (!ignored(req)) {
        const path = req.url.split("?")[0] ?? req.url;
        const query = req.query as Record<string, unknown> | undefined;
        const fields: Record<string, unknown> = {
          req: {
            method: req.method,
            path,
            ...(logQuery && query && Object.keys(query).length ? { query: redactor(query) } : {}),
            ...(logHeaders ? { headers: redactor(req.headers) } : {}),
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
          res: { statusCode: reply.statusCode, contentLength: reply.getHeader("content-length") },
          durationMs: roundDuration(reply.elapsedTime),
          ...(options.metadata ? options.metadata(req, reply) : {}),
        };
        logger[levelFor(req, reply)](fields, message);
      }
      done();
    });
  }
}

function registerSecureHeaders(app: FastifyInstance, options: SecureHeadersOptions): void {
  const headers = Object.entries(buildSecureHeaders(options));
  app.addHook("onSend", (_req, reply, payload, done) => {
    for (const [name, value] of headers) void reply.header(name, value);
    for (const name of HEADERS_TO_REMOVE) void reply.removeHeader(name);
    done(null, payload);
  });
}

function registerHealth(app: FastifyInstance, options: HealthPluginOptions): void {
  const handler =
    (probe: "liveness" | "readiness") => async (_req: FastifyRequest, reply: FastifyReply) => {
      const report = await options.registry[probe]();
      return reply.code(healthStatusCode(report)).header("cache-control", "no-store").send(report);
    };
  app.get(options.livenessPath ?? "/health/live", { logLevel: "silent" }, handler("liveness"));
  app.get(options.readinessPath ?? "/health/ready", { logLevel: "silent" }, handler("readiness"));
}

/** Builds a Fastify `onRequest`/`preHandler` hook that enforces a NexKit rate limiter. */
export function rateLimitHook(options: RateLimitPluginOptions) {
  const keyFor = options.keyGenerator ?? ((req: FastifyRequest) => req.ip);
  const costFor =
    typeof options.cost === "function"
      ? options.cost
      : () => (options.cost as number | undefined) ?? 1;
  const emitHeaders = options.headers ?? true;
  const storePolicy = options.onStoreError ?? "allow";

  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (options.skip && (await options.skip(req))) return;
    let decision;
    try {
      decision = await options.limiter.consume(await keyFor(req), costFor(req));
    } catch (err) {
      if (storePolicy === "allow") return;
      throw err;
    }
    if (emitHeaders) {
      for (const [name, value] of Object.entries(rateLimitHeaders(decision, options)))
        void reply.header(name, value);
    }
    if (!decision.allowed) throw rateLimitError(decision);
  };
}

function registerErrorHandler(
  app: FastifyInstance,
  logger: Logger | undefined,
  options: ErrorHandlerPluginOptions,
): void {
  const includeRequestId = options.includeRequestId ?? true;
  const logClientErrors = options.logClientErrors ?? true;

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    const error = normalizeError(err, options);
    if (logger) {
      const fields = { err: error, method: req.method, path: req.url, status: error.status };
      if (error.status >= 500) logger.error(fields, error.message);
      else if (logClientErrors) logger.warn(fields, error.publicMessage);
    }
    options.onError?.(error, req, reply);
    for (const [name, value] of Object.entries(error.headers ?? {})) void reply.header(name, value);
    const body = options.formatBody
      ? options.formatBody(error, req)
      : errorBody(error, { requestId: includeRequestId ? req.id : undefined });
    return reply.code(error.status).send(body);
  });
}

/* -------------------------------------------------------------------------- */
/*                                Validation                                  */
/* -------------------------------------------------------------------------- */

export interface ValidateRequestSchemas {
  body?: StandardSchemaV1;
  query?: StandardSchemaV1;
  params?: StandardSchemaV1;
  headers?: StandardSchemaV1;
}

/**
 * `preHandler` hook validating request parts with Standard Schema validators.
 * Prefer Fastify's native JSON-schema validation when possible; use this when
 * you want to share Zod/Valibot schemas with the rest of your codebase.
 *
 * @example
 * app.post("/users", { preHandler: validateRequest({ body: CreateUser }) }, handler);
 */
export function validateRequest(schemas: ValidateRequestSchemas): preHandlerAsyncHookHandler {
  const entries = (
    Object.entries(schemas) as Array<[keyof ValidatedRequestParts, StandardSchemaV1 | undefined]>
  ).filter((e): e is [keyof ValidatedRequestParts, StandardSchemaV1] => e[1] !== undefined);
  return async (req) => {
    const issues: { path: string; message: string }[] = [];
    const validated: Partial<ValidatedRequestParts> = { ...req.validated };
    for (const [part, schema] of entries) {
      const result = await parseWith(schema, req[part]);
      if (result.success) {
        validated[part] = result.data;
        if (part === "body") req.body = result.data;
      } else {
        for (const issue of result.issues) {
          issues.push({
            path: issue.path ? `${part}.${issue.path}` : part,
            message: issue.message,
          });
        }
      }
    }
    if (issues.length) throw new ValidationError(issues);
    req.validated = validated;
  };
}

/** Reads validated parts with proper typing. */
export function getValidated<B = unknown, Q = unknown, P = unknown, H = unknown>(
  req: FastifyRequest,
): ValidatedRequestParts<B, Q, P, H> {
  const v = (req.validated ?? {}) as Partial<ValidatedRequestParts<B, Q, P, H>>;
  return {
    body: (v.body ?? req.body) as B,
    query: (v.query ?? req.query) as Q,
    params: (v.params ?? req.params) as P,
    headers: (v.headers ?? req.headers) as H,
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Plugin                                   */
/* -------------------------------------------------------------------------- */

const plugin: FastifyPluginAsync<NexkitPluginOptions> = async (app, options) => {
  const logger = options.logger;

  if (options.requestContext !== false)
    registerRequestContext(app, logger, options.requestContext ?? {});
  if (options.secureHeaders !== false) registerSecureHeaders(app, options.secureHeaders ?? {});
  if (options.health) {
    const healthOptions: HealthPluginOptions =
      "registry" in options.health ? options.health : { registry: options.health };
    registerHealth(app, healthOptions);
  }
  if (options.rateLimit) {
    const hook = rateLimitHook(options.rateLimit);
    app.addHook("onRequest", hook);
  }
  if (options.errorHandler !== false) registerErrorHandler(app, logger, options.errorHandler ?? {});
  if (options.notFoundHandler !== false) {
    app.setNotFoundHandler((req) => {
      throw new NotFoundError("Route not found", {
        details: { method: req.method, path: req.url.split("?")[0] ?? req.url },
      });
    });
  }
};

/**
 * The NexKit Fastify plugin. It is registered without encapsulation
 * (`skip-override`) so hooks and handlers apply to the whole instance.
 */
export const nexkit = Object.assign(plugin, {
  [Symbol.for("skip-override")]: true,
  [Symbol.for("fastify.display-name")]: "@nexkitjs/fastify",
}) as FastifyPluginAsync<NexkitPluginOptions>;

export default nexkit;
