import {
  HEADERS_TO_REMOVE,
  parseByteSize,
  parseWith,
  secureHeaders as buildSecureHeaders,
  type SecureHeadersOptions,
  type StandardSchemaV1,
} from "@nexkitjs/core";
import { PayloadTooLargeError, ValidationError } from "@nexkitjs/errors";
import { healthStatusCode, type HealthRegistry } from "@nexkitjs/health";
import {
  rateLimitError,
  rateLimitHeaders,
  type RateLimitHeadersOptions,
  type RateLimiter,
} from "@nexkitjs/ratelimit";
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { ValidatedRequestParts } from "./types.js";

/* -------------------------------------------------------------------------- */
/*                               Secure headers                               */
/* -------------------------------------------------------------------------- */

/**
 * Sets secure response headers (strict API defaults) and removes
 * `X-Powered-By`. See `secureHeaders` in `@nexkitjs/core` for options.
 *
 * Tip: Express ≥ 4 — also call `app.disable("x-powered-by")`; this middleware
 * removes the header defensively regardless.
 */
export function secureHeaders(options: SecureHeadersOptions = {}): RequestHandler {
  const headers = Object.entries(buildSecureHeaders(options));
  return (_req, res, next) => {
    for (const [name, value] of headers) res.setHeader(name, value);
    for (const name of HEADERS_TO_REMOVE) res.removeHeader(name);
    next();
  };
}

/* -------------------------------------------------------------------------- */
/*                               Size guard                                   */
/* -------------------------------------------------------------------------- */

export interface RequestSizeLimitOptions {
  /** Maximum allowed `Content-Length`, e.g. `"1mb"` or bytes. Defaults to `"1mb"`. */
  maxBytes?: string | number;
}

/**
 * Rejects requests whose declared `Content-Length` exceeds `maxBytes` with 413
 * *before* the body is read. Complements (does not replace) the `limit` option of
 * `express.json()` / `express.urlencoded()`, which also guards chunked bodies.
 */
export function requestSizeLimit(options: RequestSizeLimitOptions = {}): RequestHandler {
  const max = parseByteSize(options.maxBytes ?? "1mb");
  return (req, _res, next) => {
    const declared = req.headers["content-length"];
    if (declared !== undefined) {
      const size = Number(declared);
      if (Number.isFinite(size) && size > max) {
        next(
          new PayloadTooLargeError(`Request body exceeds ${max} bytes`, {
            details: { maxBytes: max },
          }),
        );
        return;
      }
    }
    next();
  };
}

/* -------------------------------------------------------------------------- */
/*                                Validation                                  */
/* -------------------------------------------------------------------------- */

export interface ValidateRequestSchemas<
  B extends StandardSchemaV1 | undefined = undefined,
  Q extends StandardSchemaV1 | undefined = undefined,
  P extends StandardSchemaV1 | undefined = undefined,
  H extends StandardSchemaV1 | undefined = undefined,
> {
  body?: B;
  query?: Q;
  params?: P;
  headers?: H;
}

type Out<S> = S extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<S> : unknown;

/**
 * Validates `body`, `query`, `params` and/or `headers` against Standard Schema
 * validators (Zod, Valibot, ArkType…). Parsed output is stored on
 * `req.validated`; `req.body` is replaced with the parsed body. Failures become a
 * 422 `ValidationError` passed to `next()`.
 *
 * @example
 * router.post("/users", validateRequest({ body: CreateUser }), (req, res) => {
 *   const { body } = getValidated<z.infer<typeof CreateUser>>(req);
 * });
 */
export function validateRequest<
  B extends StandardSchemaV1 | undefined = undefined,
  Q extends StandardSchemaV1 | undefined = undefined,
  P extends StandardSchemaV1 | undefined = undefined,
  H extends StandardSchemaV1 | undefined = undefined,
>(schemas: ValidateRequestSchemas<B, Q, P, H>): RequestHandler {
  const entries = (
    Object.entries(schemas) as Array<[keyof ValidatedRequestParts, StandardSchemaV1 | undefined]>
  ).filter((e): e is [keyof ValidatedRequestParts, StandardSchemaV1] => e[1] !== undefined);

  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      const issues: { path: string; message: string }[] = [];
      const validated: Partial<ValidatedRequestParts<Out<B>, Out<Q>, Out<P>, Out<H>>> = {
        ...req.validated,
      } as never;
      for (const [part, schema] of entries) {
        const result = await parseWith(schema, req[part]);
        if (result.success) {
          (validated as Record<string, unknown>)[part] = result.data;
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
      if (issues.length) {
        next(new ValidationError(issues));
        return;
      }
      req.validated = validated;
      next();
    })().catch(next);
  };
}

/* -------------------------------------------------------------------------- */
/*                                Health routes                               */
/* -------------------------------------------------------------------------- */

export interface HealthRoutesOptions {
  /** Defaults to `"/health/live"`. */
  livenessPath?: string;
  /** Defaults to `"/health/ready"`. */
  readinessPath?: string;
  /** Add `Cache-Control: no-store`. Defaults to true. */
  noCache?: boolean;
}

/** Returns a Router exposing liveness and readiness endpoints for a registry. */
export function healthRoutes(registry: HealthRegistry, options: HealthRoutesOptions = {}): Router {
  const router = Router();
  const noCache = options.noCache ?? true;
  const handler =
    (probe: "liveness" | "readiness"): RequestHandler =>
    (_req, res, next) => {
      registry[probe]()
        .then((report) => {
          if (noCache) res.setHeader("cache-control", "no-store");
          res.status(healthStatusCode(report)).json(report);
        })
        .catch(next);
    };
  router.get(options.livenessPath ?? "/health/live", handler("liveness"));
  router.get(options.readinessPath ?? "/health/ready", handler("readiness"));
  return router;
}

/* -------------------------------------------------------------------------- */
/*                                 Rate limit                                 */
/* -------------------------------------------------------------------------- */

export interface RateLimitMiddlewareOptions extends RateLimitHeadersOptions {
  limiter: RateLimiter;
  /** Derives the bucket key. Defaults to `req.ip` (configure `trust proxy` appropriately!). */
  keyGenerator?: (req: Request) => string | Promise<string>;
  /** Cost per request. Defaults to 1. */
  cost?: number | ((req: Request) => number);
  /** Skip limiting for some requests. */
  skip?: (req: Request) => boolean | Promise<boolean>;
  /** Emit `RateLimit-*` headers on every response. Defaults to true. */
  headers?: boolean;
  /** Custom handler when the limit is hit. Defaults to passing a 429 `TooManyRequestsError` to `next()`. */
  onLimit?: (req: Request, res: Response, next: NextFunction) => void;
  /**
   * What to do when the limiter itself fails (store unreachable).
   * `"allow"` (default) lets the request through; `"deny"` returns 503 via `next(err)`.
   */
  onStoreError?: "allow" | "deny";
}

/**
 * Rate-limits requests using any `RateLimiter` from `@nexkitjs/ratelimit`.
 *
 * @example
 * app.use("/api", rateLimit({ limiter, keyGenerator: (req) => req.user?.id ?? req.ip }));
 */
export function rateLimit(options: RateLimitMiddlewareOptions): RequestHandler {
  const keyFor = options.keyGenerator ?? ((req: Request) => req.ip ?? "unknown");
  const costFor =
    typeof options.cost === "function"
      ? options.cost
      : () => (options.cost as number | undefined) ?? 1;
  const emitHeaders = options.headers ?? true;
  const storePolicy = options.onStoreError ?? "allow";

  return (req, res, next) => {
    void (async () => {
      if (options.skip && (await options.skip(req))) {
        next();
        return;
      }
      let decision;
      try {
        decision = await options.limiter.consume(await keyFor(req), costFor(req));
      } catch (err) {
        if (storePolicy === "allow") {
          next();
          return;
        }
        next(err);
        return;
      }
      if (emitHeaders) {
        for (const [name, value] of Object.entries(rateLimitHeaders(decision, options)))
          res.setHeader(name, value);
      }
      if (!decision.allowed) {
        if (options.onLimit) options.onLimit(req, res, next);
        else next(rateLimitError(decision));
        return;
      }
      next();
    })().catch(next);
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Utilities                                  */
/* -------------------------------------------------------------------------- */

/**
 * Wraps an async handler so rejections reach `next()`.
 * Express 5 does this natively; keep it for Express 4 compatibility.
 */
export function asyncHandler<Req extends Request = Request, Res extends Response = Response>(
  fn: (req: Req, res: Res, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req as Req, res as Res, next).catch(next);
  };
}
