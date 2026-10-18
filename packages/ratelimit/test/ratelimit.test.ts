import { TooManyRequestsError } from "@nexkitjs/errors";
import { afterEach, describe, expect, it } from "vitest";
import {
  MemoryRateLimitStore,
  adaptRateLimiterFlexible,
  createFixedWindowLimiter,
  createRedisStore,
  noopRateLimiter,
  rateLimitError,
  rateLimitHeaders,
  type RateLimiterFlexibleRes,
  type RedisLikeClient,
} from "../src/index.js";

function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("MemoryRateLimitStore + fixed window", () => {
  const stores: MemoryRateLimitStore[] = [];
  afterEach(() => stores.forEach((s) => s.dispose()));

  it("counts within a window and resets after it", async () => {
    const c = clock();
    const store = new MemoryRateLimitStore({ now: c.now, cleanupIntervalMs: 0 });
    stores.push(store);
    const limiter = createFixedWindowLimiter({ store, limit: 2, windowMs: 1000, now: c.now });

    const first = await limiter.consume("ip");
    expect(first).toMatchObject({
      allowed: true,
      limit: 2,
      remaining: 1,
      resetAt: c.now() + 1000,
      retryAfterMs: 0,
    });
    expect((await limiter.consume("ip")).remaining).toBe(0);
    const denied = await limiter.consume("ip");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(1000);

    c.advance(500);
    expect((await limiter.consume("ip")).retryAfterMs).toBe(500);
    expect((await limiter.consume("other")).allowed).toBe(true);

    c.advance(600);
    expect(await limiter.consume("ip")).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("supports cost, reset and purge", async () => {
    const c = clock();
    const store = new MemoryRateLimitStore({ now: c.now, cleanupIntervalMs: 0 });
    stores.push(store);
    const limiter = createFixedWindowLimiter({ store, limit: 5, windowMs: 100, now: c.now });
    expect((await limiter.consume("k", 5)).remaining).toBe(0);
    await limiter.reset?.("k");
    expect((await limiter.consume("k")).remaining).toBe(4);
    expect(store.size).toBe(1);
    c.advance(101);
    store.purge();
    expect(store.size).toBe(0);
  });

  it("validates options", () => {
    const store = new MemoryRateLimitStore({ cleanupIntervalMs: 0 });
    stores.push(store);
    expect(() => createFixedWindowLimiter({ store, limit: 0, windowMs: 10 })).toThrow(RangeError);
    expect(() => createFixedWindowLimiter({ store, limit: 1, windowMs: 0 })).toThrow(RangeError);
  });
});

describe("createRedisStore", () => {
  function fakeRedis(withEval: boolean) {
    const data = new Map<string, { value: number; expiresAt: number | null }>();
    let now = 0;
    const calls: string[] = [];
    const client: RedisLikeClient = {
      async incrby(key, inc) {
        calls.push("incrby");
        const cur = data.get(key) ?? { value: 0, expiresAt: null };
        cur.value += inc;
        data.set(key, cur);
        return cur.value;
      },
      async pexpire(key, ms) {
        calls.push("pexpire");
        const cur = data.get(key);
        if (cur) cur.expiresAt = now + ms;
        return 1;
      },
      async pttl(key) {
        calls.push("pttl");
        const cur = data.get(key);
        return cur?.expiresAt == null ? -1 : cur.expiresAt - now;
      },
      async del(key) {
        data.delete(key);
        return 1;
      },
    };
    if (withEval) {
      client.eval = async (_script, _n, key, cost, windowMs) => {
        calls.push("eval");
        const count = await client.incrby(String(key), Number(cost));
        if (count === Number(cost)) await client.pexpire(String(key), Number(windowMs));
        return [count, await client.pttl(String(key))];
      };
    }
    return {
      client,
      calls,
      data,
      setNow: (t: number) => {
        now = t;
      },
    };
  }

  it("uses eval when available", async () => {
    const { client, calls } = fakeRedis(true);
    const store = createRedisStore(client, { now: () => 0 });
    expect(await store.increment("k", 1000, 1)).toEqual({ count: 1, resetAt: 1000 });
    expect(await store.increment("k", 1000, 1)).toEqual({ count: 2, resetAt: 1000 });
    expect(calls[0]).toBe("eval");
    await store.reset("k");
    expect(await store.increment("k", 1000, 1)).toEqual({ count: 1, resetAt: 1000 });
  });

  it("falls back to INCRBY/PEXPIRE/PTTL", async () => {
    const { client, calls } = fakeRedis(false);
    const store = createRedisStore(client, { now: () => 0 });
    expect(await store.increment("k", 500, 1)).toEqual({ count: 1, resetAt: 500 });
    expect(calls).toEqual(["incrby", "pexpire", "pttl"]);
    expect(await store.increment("k", 500, 1)).toEqual({ count: 2, resetAt: 500 });
  });
});

describe("adaptRateLimiterFlexible", () => {
  function fakeFlexible(points: number) {
    const consumed = new Map<string, number>();
    return {
      points,
      async consume(key: string | number, n = 1): Promise<RateLimiterFlexibleRes> {
        const k = String(key);
        const total = (consumed.get(k) ?? 0) + n;
        consumed.set(k, total);
        const res: RateLimiterFlexibleRes = {
          remainingPoints: points - total,
          msBeforeNext: 750,
          consumedPoints: total,
        };
        if (total > points) {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw { ...res, remainingPoints: 0 };
        }
        return res;
      },
      async delete(key: string | number) {
        return consumed.delete(String(key));
      },
    };
  }

  it("maps resolutions and rejections to decisions", async () => {
    const limiter = adaptRateLimiterFlexible(fakeFlexible(2), { now: () => 0 });
    expect(await limiter.consume("a")).toEqual({
      allowed: true,
      limit: 2,
      remaining: 1,
      resetAt: 750,
      retryAfterMs: 0,
    });
    await limiter.consume("a");
    expect(await limiter.consume("a")).toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      resetAt: 750,
      retryAfterMs: 750,
    });
    await limiter.reset?.("a");
    expect((await limiter.consume("a")).allowed).toBe(true);
  });

  it("surfaces store errors instead of swallowing them", async () => {
    const broken = {
      points: 1,
      consume: async () => {
        throw new Error("redis down");
      },
    };
    await expect(adaptRateLimiterFlexible(broken).consume("x")).rejects.toThrow("redis down");
  });
});

describe("helpers", () => {
  it("builds headers in standard, legacy and both styles", () => {
    const decision = {
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      retryAfterMs: 30_000,
    };
    const standard = rateLimitHeaders(decision);
    expect(standard["ratelimit-limit"]).toBe("10");
    expect(standard["ratelimit-remaining"]).toBe("0");
    expect(Number(standard["ratelimit-reset"])).toBeGreaterThanOrEqual(29);
    expect(standard["retry-after"]).toBe("30");
    expect(standard["x-ratelimit-limit"]).toBeUndefined();
    expect(rateLimitHeaders(decision, { style: "legacy" })["x-ratelimit-limit"]).toBe("10");
    const both = rateLimitHeaders({ ...decision, allowed: true }, { style: "both" });
    expect(both["ratelimit-limit"]).toBe("10");
    expect(both["x-ratelimit-remaining"]).toBe("0");
    expect(both["retry-after"]).toBeUndefined();
  });

  it("creates 429 errors and a noop limiter", async () => {
    const err = rateLimitError({
      allowed: false,
      limit: 5,
      remaining: 0,
      resetAt: 0,
      retryAfterMs: 1500,
    });
    expect(err).toBeInstanceOf(TooManyRequestsError);
    expect(err.headers?.["retry-after"]).toBe("2");
    expect(err.toPublicJSON().details).toMatchObject({ limit: 5 });
    expect((await noopRateLimiter.consume("x")).allowed).toBe(true);
  });
});
