import { getRequestId } from "@nexkitjs/core";
import { NotFoundError } from "@nexkitjs/errors";
import { createHealthRegistry } from "@nexkitjs/health";
import { createLogger, memoryTransport } from "@nexkitjs/logger";
import { MemoryRateLimitStore, createFixedWindowLimiter } from "@nexkitjs/ratelimit";
import { ok } from "@nexkitjs/response";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  getValidated,
  nexkit,
  rateLimitHook,
  requestIdGenerator,
  validateRequest,
} from "../src/index.js";

const transport = memoryTransport();
const logger = createLogger({ transport, timestamp: () => "T" });
const health = createHealthRegistry({ defaultTimeoutMs: 50 });
let healthy = true;
health.register("db", () => healthy);
const store = new MemoryRateLimitStore({ cleanupIntervalMs: 0 });
const limiter = createFixedWindowLimiter({ store, limit: 2, windowMs: 60_000 });

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    genReqId: requestIdGenerator(),
    trustProxy: true,
    bodyLimit: 200,
  });
  await app.register(nexkit, {
    logger,
    health,
    secureHeaders: { strictTransportSecurity: false },
    requestContext: { ignore: ["/health/live"] },
  });

  app.get("/ctx", async (req) =>
    ok({ reqId: req.id, ctxId: getRequestId(), correlationId: req.correlationId }),
  );
  app.get("/async-ctx", async () => {
    await new Promise((r) => setTimeout(r, 5));
    return ok({ ctxId: getRequestId() });
  });
  app.post(
    "/users",
    {
      preHandler: validateRequest({
        body: z.object({ name: z.string().min(2), age: z.coerce.number().int() }),
        query: z.object({ dry: z.enum(["1", "0"]).optional() }),
      }),
    },
    async (req, reply) => {
      const { body, query } = getValidated<{ name: string; age: number }, { dry?: string }>(req);
      return reply.code(201).send(ok({ ...body, dry: query.dry ?? null }));
    },
  );
  app.get("/limited", { onRequest: rateLimitHook({ limiter }) }, async () => ok("fine"));
  app.get("/boom", async () => {
    throw new Error("database password=hunter2 unreachable");
  });
  app.get("/missing", async () => {
    throw new NotFoundError("Widget not found");
  });
  app.post(
    "/native",
    {
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: { email: { type: "string", format: "email" } },
        },
      },
    },
    async () => ok(1),
  );
  await app.ready();
  return app;
}

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  store.dispose();
  await app.close();
});
beforeEach(() => transport.clear());

describe("@nexkitjs/fastify", () => {
  it("assigns request ids, propagates context and echoes headers", async () => {
    const res = await app.inject({ method: "GET", url: "/ctx" });
    const body = res.json<{ data: { reqId: string; ctxId: string; correlationId: string } }>();
    expect(res.statusCode).toBe(200);
    expect(body.data.reqId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.data.ctxId).toBe(body.data.reqId);
    expect(res.headers["x-request-id"]).toBe(body.data.reqId);
    expect(res.headers["x-correlation-id"]).toBe(body.data.reqId);

    const trusted = await app.inject({
      method: "GET",
      url: "/async-ctx",
      headers: { "x-request-id": "client-42", "x-correlation-id": "corr-9" },
    });
    expect(trusted.json<{ data: { ctxId: string } }>().data.ctxId).toBe("client-42");
    expect(trusted.headers["x-correlation-id"]).toBe("corr-9");

    const bad = await app.inject({
      method: "GET",
      url: "/ctx",
      headers: { "x-request-id": "bad id!" },
    });
    expect(bad.headers["x-request-id"]).not.toBe("bad id!");
  });

  it("logs one structured entry per request and skips ignored paths", async () => {
    await app.inject({
      method: "GET",
      url: "/ctx?token=abc&page=2",
      headers: { "x-request-id": "log-1" },
    });
    await app.inject({ method: "GET", url: "/health/live" });
    const logs = transport.entries.filter((e) => e.msg === "request completed");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      level: "info",
      requestId: "log-1",
      req: { method: "GET", path: "/ctx", query: { token: "[REDACTED]", page: "2" } },
      res: { statusCode: 200 },
    });
    expect(typeof logs[0]?.durationMs).toBe("number");
  });

  it("sets secure headers", async () => {
    const res = await app.inject({ method: "GET", url: "/ctx" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["strict-transport-security"]).toBeUndefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("serves health routes", async () => {
    let res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json()).toMatchObject({ status: "ok", checks: { db: { status: "ok" } } });
    healthy = false;
    res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    healthy = true;
    res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.json()).toMatchObject({ status: "ok", probe: "liveness" });
  });

  it("validates with standard schemas and normalizes native validation errors", async () => {
    const okRes = await app.inject({
      method: "POST",
      url: "/users?dry=1",
      payload: { name: "Ana", age: "30" },
    });
    expect(okRes.statusCode).toBe(201);
    expect(okRes.json()).toEqual({ success: true, data: { name: "Ana", age: 30, dry: "1" } });

    const bad = await app.inject({
      method: "POST",
      url: "/users?dry=maybe",
      payload: { name: "A", age: "x" },
    });
    expect(bad.statusCode).toBe(422);
    const body = bad.json<{
      error: { code: string; details: { issues: { path: string }[] } };
      requestId: string;
    }>();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.issues.map((i) => i.path).sort()).toEqual([
      "body.age",
      "body.name",
      "query.dry",
    ]);
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);

    const native = await app.inject({ method: "POST", url: "/native", payload: { nope: 1 } });
    expect(native.statusCode).toBe(422);
    expect(native.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("maps body limit violations to 413", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/users",
      payload: { name: "x".repeat(500) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
  });

  it("rate limits with headers and 429 responses", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    const first = await app.inject({ method: "GET", url: "/limited", headers });
    expect(first.statusCode).toBe(200);
    expect(first.headers["ratelimit-remaining"]).toBe("1");
    await app.inject({ method: "GET", url: "/limited", headers });
    const third = await app.inject({ method: "GET", url: "/limited", headers });
    expect(third.statusCode).toBe(429);
    expect(third.headers["retry-after"]).toMatch(/^\d+$/);
    expect(third.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/limited",
          headers: { "x-forwarded-for": "203.0.113.10" },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("hides internal errors, logs them with request ids, and handles 404s", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/boom",
      headers: { "x-request-id": "err-1" },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Internal Server Error", status: 500 },
      requestId: "err-1",
    });
    const logged = transport.entries.find((e) => e.level === "error" && e.status === 500);
    expect(logged?.requestId).toBe("err-1");
    expect((logged?.err as { internalMessage: string }).internalMessage).toContain("hunter2");

    expect((await app.inject({ method: "GET", url: "/missing" })).json()).toMatchObject({
      error: { code: "NOT_FOUND", message: "Widget not found" },
    });
    const unknown = await app.inject({ method: "GET", url: "/nope?x=1" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({
      error: { code: "NOT_FOUND", details: { path: "/nope" } },
    });
  });

  it("can be configured minimally and disables features", async () => {
    const bare = Fastify({ logger: false });
    await bare.register(nexkit, {
      secureHeaders: false,
      requestContext: false,
      notFoundHandler: false,
    });
    bare.get("/", async () => ok(1));
    const res = await bare.inject({ method: "GET", url: "/" });
    expect(res.headers["x-frame-options"]).toBeUndefined();
    expect(res.headers["x-request-id"]).toBeUndefined();
    // notFoundHandler disabled → Fastify's default 404 body remains in place
    const notFound = await bare.inject({ method: "GET", url: "/none" });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({ error: "Not Found" });
    await bare.close();
  });
});
