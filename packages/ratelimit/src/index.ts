/**
 * @nexkitjs/ratelimit — adapter interfaces for established rate limiters.
 *
 * NexKit does **not** ship a distributed rate limiter. It defines a small
 * `RateLimiter` contract that framework adapters consume, plus helpers to wrap
 * existing implementations (`rate-limiter-flexible`, Redis-backed stores) and
 * a clearly-labelled single-process memory store for development and tests.
 *
 * @packageDocumentation
 */
import { TooManyRequestsError } from "@nexkitjs/errors";

/* -------------------------------------------------------------------------- */
/*                                 Contracts                                  */
/* -------------------------------------------------------------------------- */

/** Outcome of consuming from a rate limit. */
export interface RateLimitDecision {
  allowed: boolean;
  /** Maximum requests per window. */
  limit: number;
  /** Requests left in the current window (never negative). */
  remaining: number;
  /** Epoch milliseconds when the window resets. */
  resetAt: number;
  /** Milliseconds until a retry may succeed (only meaningful when `allowed` is false). */
  retryAfterMs: number;
}

/**
 * The contract consumed by `@nexkitjs/express` and `@nexkitjs/fastify`.
 * Implement it directly or use one of the adapters below.
 */
export interface RateLimiter {
  /** Consume `cost` (default 1) from the bucket identified by `key`. Must never throw for limit hits. */
  consume(key: string, cost?: number): Promise<RateLimitDecision>;
  /** Optional: clear a key (e.g. after successful login). */
  reset?(key: string): Promise<void>;
}

/**
 * Storage contract for {@link createFixedWindowLimiter}. Implementations must
 * be atomic per key (Redis `INCR` + `PEXPIRE`, a database row with
 * `UPDATE ... RETURNING`, etc.) to be correct across multiple instances.
 */
export interface RateLimitStore {
  /** Atomically increments `key` by `cost` within a window of `windowMs`. Returns the new count and window expiry. */
  increment(
    key: string,
    windowMs: number,
    cost: number,
  ): Promise<{ count: number; resetAt: number }>;
  reset(key: string): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*                         Fixed-window store limiter                         */
/* -------------------------------------------------------------------------- */

export interface FixedWindowOptions {
  store: RateLimitStore;
  /** Max requests per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
  /** Prefix applied to all keys in the store. Defaults to `"rl:"`. */
  keyPrefix?: string;
  /** Clock override (ms since epoch). */
  now?: () => number;
}

/**
 * Fixed-window limiter on top of any atomic {@link RateLimitStore}.
 * Correctness across instances depends entirely on the store's atomicity.
 */
export function createFixedWindowLimiter(options: FixedWindowOptions): RateLimiter {
  const { store, limit, windowMs } = options;
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError("limit must be a positive integer");
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new RangeError("windowMs must be > 0");
  const prefix = options.keyPrefix ?? "rl:";
  const now = options.now ?? (() => Date.now());

  return {
    async consume(key, cost = 1) {
      const { count, resetAt } = await store.increment(prefix + key, windowMs, cost);
      const allowed = count <= limit;
      return {
        allowed,
        limit,
        remaining: Math.max(0, limit - count),
        resetAt,
        retryAfterMs: allowed ? 0 : Math.max(0, resetAt - now()),
      };
    },
    reset: (key) => store.reset(prefix + key),
  };
}

/* -------------------------------------------------------------------------- */
/*                         Single-process memory store                        */
/* -------------------------------------------------------------------------- */

export interface MemoryStoreOptions {
  /** How often to purge expired windows. Defaults to 60s. Timer is `unref`'d. */
  cleanupIntervalMs?: number;
  /** Clock override (ms since epoch). */
  now?: () => number;
}

/**
 * **Single-process, in-memory** store.
 *
 * Suitable for local development, tests, and single-instance deployments only.
 * Each process keeps its own counters, so behind a load balancer the effective
 * limit is `limit × instances`, and counters reset on restart. For multi-instance
 * deployments use {@link createRedisStore} or wrap an established library with
 * {@link adaptRateLimiterFlexible}.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  readonly #buckets = new Map<string, { count: number; resetAt: number }>();
  readonly #now: () => number;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: MemoryStoreOptions = {}) {
    this.#now = options.now ?? (() => Date.now());
    const interval = options.cleanupIntervalMs ?? 60_000;
    if (interval > 0 && Number.isFinite(interval)) {
      this.#timer = setInterval(() => this.purge(), interval);
      this.#timer.unref?.();
    }
  }

  async increment(
    key: string,
    windowMs: number,
    cost: number,
  ): Promise<{ count: number; resetAt: number }> {
    const current = this.#now();
    const bucket = this.#buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      const fresh = { count: cost, resetAt: current + windowMs };
      this.#buckets.set(key, fresh);
      return { ...fresh };
    }
    bucket.count += cost;
    return { count: bucket.count, resetAt: bucket.resetAt };
  }

  async reset(key: string): Promise<void> {
    this.#buckets.delete(key);
  }

  /** Removes expired windows. */
  purge(): void {
    const current = this.#now();
    for (const [key, bucket] of this.#buckets) {
      if (bucket.resetAt <= current) this.#buckets.delete(key);
    }
  }

  /** Number of tracked keys (for tests/metrics). */
  get size(): number {
    return this.#buckets.size;
  }

  /** Stops the cleanup timer. */
  dispose(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }
}

/* -------------------------------------------------------------------------- */
/*                              Redis-backed store                            */
/* -------------------------------------------------------------------------- */

/**
 * Minimal Redis client surface (matches `ioredis`). For `node-redis` pass a
 * small wrapper mapping `incrBy`/`pExpire`/`pTTL`/`eval`.
 */
export interface RedisLikeClient {
  eval?(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  incrby(key: string, increment: number): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<unknown>;
  pttl(key: string): Promise<number>;
  del(key: string): Promise<unknown>;
}

const INCR_SCRIPT = `
local count = redis.call('INCRBY', KEYS[1], ARGV[1])
if count == tonumber(ARGV[1]) then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  ttl = tonumber(ARGV[2])
end
return {count, ttl}
`;

/**
 * Redis store for {@link createFixedWindowLimiter}. Uses a Lua script for
 * atomicity when `eval` is available, otherwise falls back to
 * `INCRBY` + `PEXPIRE` (a narrow race on the first hit of a window — acceptable
 * for most APIs, but prefer a client that supports `eval`).
 */
export function createRedisStore(
  client: RedisLikeClient,
  options: { now?: () => number } = {},
): RateLimitStore {
  const now = options.now ?? (() => Date.now());
  return {
    async increment(key, windowMs, cost) {
      if (typeof client.eval === "function") {
        const raw = await client.eval(INCR_SCRIPT, 1, key, cost, Math.ceil(windowMs));
        const [count, ttl] = Array.isArray(raw) ? (raw as [unknown, unknown]) : [raw, windowMs];
        return { count: Number(count), resetAt: now() + Number(ttl) };
      }
      const count = await client.incrby(key, cost);
      if (count === cost) await client.pexpire(key, Math.ceil(windowMs));
      let ttl = await client.pttl(key);
      if (ttl < 0) {
        await client.pexpire(key, Math.ceil(windowMs));
        ttl = windowMs;
      }
      return { count, resetAt: now() + ttl };
    },
    async reset(key) {
      await client.del(key);
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                     rate-limiter-flexible adapter                          */
/* -------------------------------------------------------------------------- */

/** Structural subset of a `rate-limiter-flexible` result (`RateLimiterRes`). */
export interface RateLimiterFlexibleRes {
  remainingPoints: number;
  msBeforeNext: number;
  consumedPoints: number;
  isFirstInDuration?: boolean;
}

/** Structural subset of a `rate-limiter-flexible` limiter instance. */
export interface RateLimiterFlexibleLike {
  points: number;
  consume(key: string | number, pointsToConsume?: number): Promise<RateLimiterFlexibleRes>;
  delete?(key: string | number): Promise<boolean>;
}

/**
 * Wraps any `rate-limiter-flexible` limiter (Memory, Redis, Mongo, Postgres,
 * Cluster…) so it can be used with NexKit's framework adapters.
 *
 * @example
 * import { RateLimiterRedis } from "rate-limiter-flexible";
 * const limiter = adaptRateLimiterFlexible(new RateLimiterRedis({ storeClient: redis, points: 100, duration: 60 }));
 */
export function adaptRateLimiterFlexible(
  limiter: RateLimiterFlexibleLike,
  options: { now?: () => number } = {},
): RateLimiter {
  const now = options.now ?? (() => Date.now());
  const toDecision = (res: RateLimiterFlexibleRes, allowed: boolean): RateLimitDecision => ({
    allowed,
    limit: limiter.points,
    remaining: Math.max(0, res.remainingPoints),
    resetAt: now() + res.msBeforeNext,
    retryAfterMs: allowed ? 0 : res.msBeforeNext,
  });
  return {
    async consume(key, cost = 1) {
      try {
        return toDecision(await limiter.consume(key, cost), true);
      } catch (rejected: unknown) {
        if (isFlexibleRes(rejected)) return toDecision(rejected, false);
        throw rejected; // store error (e.g. Redis down) — surface it
      }
    },
    async reset(key) {
      await limiter.delete?.(key);
    },
  };
}

function isFlexibleRes(value: unknown): value is RateLimiterFlexibleRes {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RateLimiterFlexibleRes).remainingPoints === "number" &&
    typeof (value as RateLimiterFlexibleRes).msBeforeNext === "number"
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

export interface RateLimitHeadersOptions {
  /** `"standard"` → `RateLimit-*` (IETF draft); `"legacy"` → `X-RateLimit-*`; `"both"`. Defaults to `"standard"`. */
  style?: "standard" | "legacy" | "both";
}

/** Builds response headers describing a decision. Header names are lower-case. */
export function rateLimitHeaders(
  decision: RateLimitDecision,
  options: RateLimitHeadersOptions = {},
): Record<string, string> {
  const style = options.style ?? "standard";
  const resetSeconds = Math.max(0, Math.ceil((decision.resetAt - Date.now()) / 1000));
  const headers: Record<string, string> = {};
  if (style === "standard" || style === "both") {
    headers["ratelimit-limit"] = String(decision.limit);
    headers["ratelimit-remaining"] = String(decision.remaining);
    headers["ratelimit-reset"] = String(resetSeconds);
  }
  if (style === "legacy" || style === "both") {
    headers["x-ratelimit-limit"] = String(decision.limit);
    headers["x-ratelimit-remaining"] = String(decision.remaining);
    headers["x-ratelimit-reset"] = String(Math.ceil(decision.resetAt / 1000));
  }
  if (!decision.allowed) {
    headers["retry-after"] = String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000)));
  }
  return headers;
}

/** Creates the standard 429 error for a denied decision. */
export function rateLimitError(
  decision: RateLimitDecision,
  message = "Too many requests",
): TooManyRequestsError {
  return new TooManyRequestsError(message, {
    retryAfterSeconds: Math.max(1, Math.ceil(decision.retryAfterMs / 1000)),
    limit: decision.limit,
    details: {
      limit: decision.limit,
      remaining: decision.remaining,
      resetAt: new Date(decision.resetAt).toISOString(),
    },
  });
}

/** A limiter that always allows. Useful to disable limiting in tests. */
export const noopRateLimiter: RateLimiter = {
  async consume() {
    return {
      allowed: true,
      limit: Number.MAX_SAFE_INTEGER,
      remaining: Number.MAX_SAFE_INTEGER,
      resetAt: 0,
      retryAfterMs: 0,
    };
  },
};
