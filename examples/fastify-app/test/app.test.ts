import { createTestLogger } from "@nexkitjs/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const logs = createTestLogger();
let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createApp({ logger: logs.logger, isProduction: false }));
  await app.ready();
});
afterAll(() => app.close());

describe("fastify example app (built packages)", () => {
  it("serves paginated users with request ids and secure headers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/users?pageSize=1",
      headers: { "x-request-id": "ex-1" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBe("ex-1");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["ratelimit-limit"]).toBe("100");
    expect(res.json()).toMatchObject({
      success: true,
      requestId: "ex-1",
      meta: { page: 1, pageSize: 1, total: 2, hasNext: true },
    });
  });

  it("validates input and creates users", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/users",
      payload: { name: "x", email: "nope" },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.details.issues.map((i: { path: string }) => i.path)).toEqual([
      "body.name",
      "body.email",
    ]);
    const good = await app.inject({
      method: "POST",
      url: "/users",
      payload: { name: "Linus", email: "linus@example.com" },
    });
    expect(good.statusCode).toBe(201);
    expect(good.json().data).toMatchObject({ id: 3, name: "Linus" });
  });

  it("returns 404s and validates params", async () => {
    expect((await app.inject({ method: "GET", url: "/users/99" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/users/abc" })).statusCode).toBe(422);
    const missing = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("NOT_FOUND");
  });

  it("never leaks internal error details but logs them", async () => {
    const res = await app.inject({ method: "GET", url: "/users/1/crash" });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("s3cret");
    expect(res.json().error.message).toBe("Internal Server Error");
    expect(logs.at("error").length).toBeGreaterThan(0);
    expect(logs.contains("10.0.0.5")).toBe(true);
  });

  it("exposes health endpoints and does not log them", async () => {
    logs.clear();
    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: "ok", checks: { memory: { status: "ok" } } });
    expect((await app.inject({ method: "GET", url: "/health/live" })).statusCode).toBe(200);
    expect(logs.find("request completed")).toBeUndefined();
  });
});
