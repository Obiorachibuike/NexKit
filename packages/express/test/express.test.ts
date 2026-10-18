import { getRequestId } from "@nexkitjs/core";
import { NotFoundError } from "@nexkitjs/errors";
import { createHealthRegistry } from "@nexkitjs/health";
import { createLogger, memoryTransport } from "@nexkitjs/logger";
import { MemoryRateLimitStore, createFixedWindowLimiter } from "@nexkitjs/ratelimit";
import { ok } from "@nexkitjs/response";
import express, { type Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  asyncHandler,
  errorHandler,
  getValidated,
  healthRoutes,
  notFoundHandler,
  rateLimit,
  requestContext,
  requestSizeLimit,
  secureHeaders,
  validateRequest,
} from "../src/index.js";

const transport = memoryTransport();
const logger = createLogger({ transport, timestamp: () => "T" });
const health = createHealthRegistry({ defaultTimeoutMs: 50 });
let healthy = true;
health.register("db", () => healthy);

const store = new MemoryRateLimitStore({ cleanupIntervalMs: 0 });
const limiter = createFixedWindowLimiter({ store, limit: 2, windowMs: 60_000 });

function buildApp(): Express {
  const app = express();
  app.set("trust proxy", true);
  app.use(requestContext({ logger, ignore: ["/health/live"] }));
  app.use(secureHeaders({ strictTransportSecurity: false }));
  app.use(requestSizeLimit({ maxBytes: 100 }));
  app.use(express.json({ limit: "1kb" }));
  app.use(healthRoutes(health));

  app.get("/ctx", (req, res) => {
    res.json(ok({ reqId: req.id, ctxId: getRequestId(), correlationId: req.correlationId }));
  });
  app.get(
    "/async-ctx",
    asyncHandler(async (_req, res) => {
      await new Promise((r) => setTimeout(r, 5));
      res.json(ok({ ctxId: getRequestId() }));
    }),
  );
  app.post(
    "/users",
    validateRequest({
      body: z.object({ name: z.string().min(2), age: z.coerce.number().int() }),
      query: z.object({ dry: z.enum(["1", "0"]).optional() }),
    }),
    (req, res) => {
      const { body, query } = getValidated<{ name: string; age: number }, { dry?: string }>(req);
      res.status(201).json(ok({ ...body, dry: query.dry ?? null }));
    },
  );
  app.get("/limited", rateLimit({ limiter }), (_req, res) => res.json(ok("fine")));
  app.get("/boom", () => {
    throw new Error("database password=hunter2 unreachable");
  });
  app.get("/missing", () => {
    throw new NotFoundError("Widget not found", { meta: { id: 1 } });
  });
  app.get("/async-boom", async () => {
    await Promise.resolve();
    throw new Error("async failure");
  });
  app.use(notFoundHandler());
  app.use(errorHandler({ logger }));
  return app;
}

let server: Server;
let base: string;

beforeAll(async () => {
  server = buildApp().listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  store.dispose();
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => transport.clear());

describe("@nexkitjs/express", () => {
  it("assigns request ids, propagates context through async code and echoes headers", async () => {
    const res = await fetch(`${base}/ctx`);
    const body = (await res.json()) as {
      data: { reqId: string; ctxId: string; correlationId: string };
    };
    expect(res.status).toBe(200);
    expect(body.data.reqId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.data.ctxId).toBe(body.data.reqId);
    expect(body.data.correlationId).toBe(body.data.reqId);
    expect(res.headers.get("x-request-id")).toBe(body.data.reqId);

    const async = await fetch(`${base}/async-ctx`, {
      headers: { "x-request-id": "client-42", "x-correlation-id": "corr-9" },
    });
    const asyncBody = (await async.json()) as { data: { ctxId: string } };
    expect(asyncBody.data.ctxId).toBe("client-42");
    expect(async.headers.get("x-correlation-id")).toBe("corr-9");

    const bad = await fetch(`${base}/ctx`, { headers: { "x-request-id": "not valid!!" } });
    expect(bad.headers.get("x-request-id")).not.toBe("not valid!!");
  });

  it("emits one structured request log with timing and ids, skipping ignored paths", async () => {
    await fetch(`${base}/ctx?token=abc&page=2`, { headers: { "x-request-id": "log-1" } });
    await fetch(`${base}/health/live`);
    const logs = transport.entries.filter((e) => e.msg === "request completed");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      level: "info",
      requestId: "log-1",
      correlationId: "log-1",
      req: { method: "GET", path: "/ctx", query: { token: "[REDACTED]", page: "2" } },
      res: { statusCode: 200 },
    });
    expect(typeof logs[0]?.durationMs).toBe("number");
  });

  it("sets secure headers and removes x-powered-by", async () => {
    const res = await fetch(`${base}/ctx`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("strict-transport-security")).toBeNull();
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("serves health endpoints with correct status codes", async () => {
    let res = await fetch(`${base}/health/ready`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "ok", checks: { db: { status: "ok" } } });
    healthy = false;
    res = await fetch(`${base}/health/ready`);
    expect(res.status).toBe(503);
    healthy = true;
    res = await fetch(`${base}/health/live`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", probe: "liveness" });
  });

  it("validates requests with standard schemas and formats 422 errors", async () => {
    const okRes = await fetch(`${base}/users?dry=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ana", age: "30" }),
    });
    expect(okRes.status).toBe(201);
    expect(await okRes.json()).toEqual({ success: true, data: { name: "Ana", age: 30, dry: "1" } });

    const badRes = await fetch(`${base}/users?dry=maybe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "A", age: "x" }),
    });
    expect(badRes.status).toBe(422);
    const body = (await badRes.json()) as {
      success: false;
      error: { code: string; details: { issues: { path: string }[] } };
      requestId: string;
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.issues.map((i) => i.path).sort()).toEqual([
      "body.age",
      "body.name",
      "query.dry",
    ]);
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(transport.entries.find((e) => e.level === "warn")?.status).toBe(422);
  });

  it("rejects oversized payloads early and from the body parser", async () => {
    const big = JSON.stringify({ name: "x".repeat(500) });
    const res = await fetch(`${base}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: big,
    });
    expect(res.status).toBe(413);
    expect((await res.json()) as object).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });

    // Malformed JSON → body-parser 400 is normalized
    const malformed = await fetch(`${base}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad",
    });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()) as object).toMatchObject({
      error: { code: "BAD_REQUEST", status: 400 },
    });
  });

  it("rate limits with headers and 429 bodies", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    const first = await fetch(`${base}/limited`, { headers });
    expect(first.status).toBe(200);
    expect(first.headers.get("ratelimit-limit")).toBe("2");
    expect(first.headers.get("ratelimit-remaining")).toBe("1");
    await fetch(`${base}/limited`, { headers });
    const third = await fetch(`${base}/limited`, { headers });
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await third.json()) as object).toMatchObject({
      error: { code: "RATE_LIMITED", status: 429 },
    });
    const other = await fetch(`${base}/limited`, {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    expect(other.status).toBe(200);
  });

  it("hides internal error details, logs them with redaction, and includes requestId", async () => {
    const res = await fetch(`${base}/boom`, { headers: { "x-request-id": "err-1" } });
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error: { message: string; code: string };
      requestId: string;
    };
    expect(body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "Internal Server Error",
      status: 500,
    });
    expect(body.requestId).toBe("err-1");
    expect(JSON.stringify(body)).not.toContain("hunter2");

    const logged = transport.entries.find((e) => e.level === "error" && e.status === 500);
    expect(logged?.requestId).toBe("err-1");
    expect((logged?.err as { internalMessage: string }).internalMessage).toContain("hunter2");

    const asyncRes = await fetch(`${base}/async-boom`);
    expect(asyncRes.status).toBe(500);
  });

  it("exposes operational errors and 404s for unknown routes", async () => {
    const res = await fetch(`${base}/missing`);
    expect(res.status).toBe(404);
    expect((await res.json()) as object).toMatchObject({
      error: { code: "NOT_FOUND", message: "Widget not found" },
    });

    const unknown = await fetch(`${base}/nope`);
    expect(unknown.status).toBe(404);
    expect((await unknown.json()) as object).toMatchObject({
      error: { code: "NOT_FOUND", details: { method: "GET", path: "/nope" } },
    });
  });
});
