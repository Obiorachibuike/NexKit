/**
 * @nexkitjs/express — Express middleware for NexKit.
 *
 * Mount order that works for most apps:
 *
 * ```ts
 * app.disable("x-powered-by");
 * app.use(requestContext({ logger }));
 * app.use(secureHeaders());
 * app.use(requestSizeLimit({ maxBytes: "1mb" }));
 * app.use(express.json({ limit: "1mb" }));
 * app.use(healthRoutes(health));
 * app.use("/api", rateLimit({ limiter }), apiRouter);
 * app.use(notFoundHandler());
 * app.use(errorHandler({ logger }));
 * ```
 *
 * @packageDocumentation
 */
export { requestContext } from "./request-context.js";
export type { RequestContextOptions } from "./request-context.js";

export {
  asyncHandler,
  healthRoutes,
  rateLimit,
  requestSizeLimit,
  secureHeaders,
  validateRequest,
} from "./middleware.js";
export type {
  HealthRoutesOptions,
  RateLimitMiddlewareOptions,
  RequestSizeLimitOptions,
  ValidateRequestSchemas,
} from "./middleware.js";

export { errorHandler, notFoundHandler } from "./error-handler.js";
export type { ErrorHandlerOptions } from "./error-handler.js";

export { getValidated } from "./types.js";
export type { ValidatedRequestParts } from "./types.js";
