# @nexkitjs/express

Express middleware for NexKit. Peer dependency: `express >=4.18 <6` (Express 5 recommended).

```bash
npm install @nexkitjs/express @nexkitjs/logger @nexkitjs/health @nexkitjs/ratelimit express
```

```ts
import express from "express";
import { createLogger } from "@nexkitjs/logger";
import { createHealthRegistry } from "@nexkitjs/health";
import {
  requestContext,
  secureHeaders,
  requestSizeLimit,
  healthRoutes,
  rateLimit,
  validateRequest,
  getValidated,
  notFoundHandler,
  errorHandler,
} from "@nexkitjs/express";

const logger = createLogger({ name: "api" });
const health = createHealthRegistry();
const app = express();

app.disable("x-powered-by");
app.use(requestContext({ logger, ignore: ["/health/live", "/health/ready"] })); // ids, timing, one log per request
app.use(secureHeaders());
app.use(requestSizeLimit({ maxBytes: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(healthRoutes(health));
app.use("/api", rateLimit({ limiter }));

app.post("/api/users", validateRequest({ body: CreateUser }), (req, res) => {
  const { body } = getValidated<z.infer<typeof CreateUser>>(req);
  res.status(201).json(ok(body));
});

app.use(notFoundHandler());
app.use(errorHandler({ logger }));
```

| Middleware                  | Does                                                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestContext(options)`   | Validates/assigns `X-Request-Id` + `X-Correlation-Id`, sets `req.id`, runs the chain in an AsyncLocalStorage context, logs method/path/status/duration (query & headers redacted) |
| `secureHeaders(options)`    | Applies the `@nexkitjs/core` header preset and removes `X-Powered-By`                                                                                                             |
| `requestSizeLimit(options)` | Rejects declared `Content-Length` over the limit with 413 before parsing                                                                                                          |
| `validateRequest(schemas)`  | Validates `body`/`query`/`params`/`headers` with any Standard Schema (Zod, Valibot…) → 422                                                                                        |
| `healthRoutes(registry)`    | `GET /health/live`, `GET /health/ready` (200/503, `Cache-Control: no-store`)                                                                                                      |
| `rateLimit(options)`        | Enforces a `RateLimiter`; `RateLimit-*` headers; 429 with `Retry-After`                                                                                                           |
| `notFoundHandler()`         | 404 `NotFoundError` for unmatched routes                                                                                                                                          |
| `errorHandler(options)`     | Normalizes any error, logs it (5xx `error`, 4xx `warn`), responds with a safe envelope                                                                                            |
| `asyncHandler(fn)`          | Express 4 compatibility for async handlers                                                                                                                                        |

## License

MIT
