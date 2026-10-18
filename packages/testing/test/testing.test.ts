import { getRequestId } from "@nexkitjs/core";
import { NotFoundError } from "@nexkitjs/errors";
import { createHealthRegistry } from "@nexkitjs/health";
import { describe, expect, it } from "vitest";
import {
  AppErrorAssertionError,
  createManualClock,
  createTestLogger,
  createTestRateLimiter,
  expectAppError,
  healthCheckStub,
  rejected,
  runInTestContext,
  withEnv,
} from "../src/index.js";

describe("createTestLogger", () => {
  it("captures entries and supports queries", () => {
    const t = createTestLogger({ name: "t" });
    t.logger.debug("first");
    t.logger.error({ password: "s3cret" }, "second entry");
    expect(t.entries).toHaveLength(2);
    expect(t.at("error")).toHaveLength(1);
    expect(t.find("second")?.level).toBe("error");
    expect(t.find(/^fir/)?.msg).toBe("first");
    expect(t.contains("s3cret")).toBe(false);
    expect(t.contains("[REDACTED]")).toBe(true);
    t.clear();
    expect(t.entries).toHaveLength(0);
  });
});

describe("withEnv", () => {
  it("overrides and restores variables, including deletions", async () => {
    process.env.NEXKIT_KEEP = "orig";
    delete process.env.NEXKIT_NEW;
    const result = await withEnv({ NEXKIT_KEEP: undefined, NEXKIT_NEW: "x" }, async () => {
      expect(process.env.NEXKIT_KEEP).toBeUndefined();
      expect(process.env.NEXKIT_NEW).toBe("x");
      return 7;
    });
    expect(result).toBe(7);
    expect(process.env.NEXKIT_KEEP).toBe("orig");
    expect(process.env.NEXKIT_NEW).toBeUndefined();
    delete process.env.NEXKIT_KEEP;
  });

  it("restores even when fn throws", async () => {
    delete process.env.NEXKIT_TMP;
    await expect(
      withEnv({ NEXKIT_TMP: "1" }, () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(process.env.NEXKIT_TMP).toBeUndefined();
  });
});

describe("expectAppError / rejected", () => {
  it("passes for matching errors and returns the typed error", async () => {
    const err = expectAppError(
      await rejected(() => Promise.reject(new NotFoundError("User 1 missing"))),
      {
        code: "NOT_FOUND",
        status: 404,
        message: /User \d/,
        publicMessage: "missing",
        instanceOf: NotFoundError,
      },
    );
    expect(err.status).toBe(404);
  });

  it("fails with descriptive messages", async () => {
    expect(() => expectAppError(new Error("plain"))).toThrow(
      /Expected an AppError but received Error: plain/,
    );
    expect(() => expectAppError(new NotFoundError(), { code: "CONFLICT", status: 409 })).toThrow(
      AppErrorAssertionError,
    );
    try {
      expectAppError(new NotFoundError(), { code: "CONFLICT" });
    } catch (e) {
      expect((e as Error).message).toContain('code: expected "CONFLICT", received "NOT_FOUND"');
    }
    await expect(rejected(() => 1)).rejects.toThrow(/Expected function to throw/);
  });
});

describe("context, clock, limiter, health stubs", () => {
  it("runs code in a test request context", () => {
    expect(runInTestContext(() => getRequestId())).toBe("test-request-id");
    expect(runInTestContext(() => getRequestId(), { requestId: "custom" })).toBe("custom");
  });

  it("manual clock drives the test rate limiter deterministically", async () => {
    const clock = createManualClock(1000);
    clock.advance(5);
    expect(clock.now()).toBe(1005);
    clock.set(1);
    expect(clock.now()).toBe(1);

    const { limiter, clock: c, dispose } = createTestRateLimiter({ limit: 1, windowMs: 100 });
    expect((await limiter.consume("k")).allowed).toBe(true);
    expect((await limiter.consume("k")).allowed).toBe(false);
    c.advance(101);
    expect((await limiter.consume("k")).allowed).toBe(true);
    dispose();
  });

  it("health stubs integrate with the registry", async () => {
    const health = createHealthRegistry({ defaultTimeoutMs: 30 });
    health.register("ok", healthCheckStub());
    health.register("slow", healthCheckStub({ delayMs: 100 }), { critical: false });
    health.register("throws", healthCheckStub({ throws: true }), { critical: false });
    health.register("degraded", healthCheckStub({ status: "degraded" }));
    const report = await health.readiness();
    expect(report.checks.ok?.status).toBe("ok");
    expect(report.checks.slow?.message).toMatch(/Timed out/);
    expect(report.checks.throws?.status).toBe("fail");
    expect(report.checks.degraded?.status).toBe("degraded");
    expect(report.status).toBe("degraded");
  });
});
