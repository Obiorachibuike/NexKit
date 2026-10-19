import { describe, expect, it } from "vitest";
import {
  createHealthRegistry,
  eventLoopLagCheck,
  healthStatusCode,
  memoryHeapCheck,
} from "../src/index.js";

describe("createHealthRegistry", () => {
  it("runs readiness checks and aggregates status", async () => {
    const health = createHealthRegistry({ info: { version: "1.0.0" }, now: () => 0 });
    health.register("db", () => true);
    health.register("cache", () => ({ status: "ok", details: { hits: 10 } }), {
      tags: ["optional"],
    });
    const report = await health.readiness();
    expect(report.status).toBe("ok");
    expect(report.probe).toBe("readiness");
    expect(report.info).toEqual({ version: "1.0.0" });
    expect(report.timestamp).toBe("1970-01-01T00:00:00.000Z");
    expect(report.checks.db).toMatchObject({ status: "ok", critical: true });
    expect(report.checks.cache).toMatchObject({
      status: "ok",
      details: { hits: 10 },
      tags: ["optional"],
    });
    expect(typeof report.checks.db?.durationMs).toBe("number");
    expect(healthStatusCode(report)).toBe(200);
  });

  it("fails on critical failures and degrades on non-critical ones", async () => {
    const health = createHealthRegistry();
    health.register("db", () => false);
    health.register(
      "cache",
      () => {
        throw new Error("redis://:pw@host down");
      },
      { critical: false },
    );
    let report = await health.readiness();
    expect(report.status).toBe("fail");
    expect(healthStatusCode(report)).toBe(503);
    expect(report.checks.cache?.message).toBe("Check failed");
    expect(JSON.stringify(report)).not.toContain("pw@host");

    health.unregister("db");
    report = await health.readiness();
    expect(report.status).toBe("degraded");
    expect(healthStatusCode(report)).toBe(200);
  });

  it("can expose error messages when explicitly enabled", async () => {
    const health = createHealthRegistry({ exposeErrorMessages: true });
    health.register("x", () => Promise.reject(new Error("specific reason")));
    const report = await health.readiness();
    expect(report.checks.x?.message).toBe("specific reason");
    expect(JSON.stringify(report)).not.toContain("at ");
  });

  it("times out slow checks and aborts their signal", async () => {
    const health = createHealthRegistry({ defaultTimeoutMs: 20 });
    let aborted = false;
    health.register(
      "slow",
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
          setTimeout(resolve, 200);
        }),
    );
    health.register("fast", () => undefined, { timeoutMs: 1000 });
    const report = await health.readiness();
    expect(report.status).toBe("fail");
    expect(report.checks.slow).toMatchObject({ status: "fail", message: "Timed out after 20ms" });
    expect(report.checks.fast?.status).toBe("ok");
    expect(aborted).toBe(true);
  });

  it("separates liveness and readiness probes", async () => {
    const health = createHealthRegistry();
    health.register("loop", () => true, { probe: "liveness" });
    health.register("db", () => false);
    health.register("both", () => true, { probe: "both" });
    const live = await health.liveness();
    const ready = await health.readiness();
    expect(Object.keys(live.checks).sort()).toEqual(["both", "loop"]);
    expect(live.status).toBe("ok");
    expect(Object.keys(ready.checks).sort()).toEqual(["both", "db"]);
    expect(ready.status).toBe("fail");
    expect(live.uptime).toBeGreaterThanOrEqual(0);
  });

  it("supports register/unregister/list/run", async () => {
    const health = createHealthRegistry();
    const dispose = health.register("a", () => ({ status: "degraded", message: "slow" }));
    expect(health.list()).toEqual(["a"]);
    expect(await health.run("a")).toMatchObject({ status: "degraded", message: "slow" });
    dispose();
    expect(health.list()).toEqual([]);
    await expect(health.run("a")).rejects.toThrow(RangeError);
    expect(() => health.register("", () => true)).toThrow(TypeError);
  });

  it("ships basic built-in checks", async () => {
    const health = createHealthRegistry();
    health.register("heap", memoryHeapCheck(Number.MAX_SAFE_INTEGER));
    health.register("heap-tight", memoryHeapCheck(1), { critical: false });
    health.register("loop", eventLoopLagCheck({ warnMs: 10_000 }));
    const report = await health.readiness();
    expect(report.checks.heap?.status).toBe("ok");
    expect(report.checks["heap-tight"]?.status).toBe("fail");
    expect(report.checks.loop?.status).toBe("ok");
    expect(report.status).toBe("degraded");
  });
});
