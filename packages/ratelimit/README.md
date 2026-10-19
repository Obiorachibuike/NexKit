# @nexkitjs/ratelimit

Adapter contracts and helpers for plugging **established** rate limiters into NexKit's
Express/Fastify adapters. NexKit deliberately does not ship a distributed limiter of its own.

```bash
npm install @nexkitjs/ratelimit
```

## The contract

```ts
interface RateLimiter {
  consume(key: string, cost?: number): Promise<RateLimitDecision>;
  reset?(key: string): Promise<void>;
}
// RateLimitDecision = { allowed, limit, remaining, resetAt, retryAfterMs }
```

## Ways to get a `RateLimiter`

```ts
// 1. Wrap rate-limiter-flexible (Memory, Redis, Mongo, Postgres, Cluster…)
import { RateLimiterRedis } from "rate-limiter-flexible";
const limiter = adaptRateLimiterFlexible(
  new RateLimiterRedis({ storeClient: redis, points: 100, duration: 60 }),
);

// 2. Fixed window over a Redis store (ioredis-compatible client; uses a Lua script when `eval` exists)
const limiter = createFixedWindowLimiter({
  store: createRedisStore(redis),
  limit: 100,
  windowMs: 60_000,
});

// 3. Single-process memory store — development, tests, single-instance deployments ONLY
const limiter = createFixedWindowLimiter({
  store: new MemoryRateLimitStore(),
  limit: 100,
  windowMs: 60_000,
});
```

`MemoryRateLimitStore` keeps counters per process: behind a load balancer the effective limit
is `limit × instances` and counters reset on restart. Its documentation says so and so does this
README — use Redis for anything multi-instance.

Helpers: `rateLimitHeaders(decision, { style: "standard" | "legacy" | "both" })`,
`rateLimitError(decision)` (429 with `Retry-After`), `noopRateLimiter`.

## License

MIT
