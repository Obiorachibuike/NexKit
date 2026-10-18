import { createTestLogger } from "@nexkitjs/testing";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (res: Response): Promise<any> => res.json();

const logs = createTestLogger();
let server: Server;
let base: string;

beforeAll(async () => {
  const { app } = createApp({ logger: logs.logger, isProduction: false });
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("express example app (built packages)", () => {
  it("serves paginated users with request ids and secure headers", async () => {
    const res = await fetch(`${base}/users?pageSize=1`, { headers: { "x-request-id": "ex-1" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("ex-1");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("ratelimit-limit")).toBe("100");
    const body = await json(res);
    expect(body).toMatchObject({
      success: true,
      requestId: "ex-1",
      meta: { page: 1, pageSize: 1, total: 2, hasNext: true },
    });
    expect(body.data).toHaveLength(1);
  });

  it("validates input and creates users", async () => {
    const bad = await fetch(`${base}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x", email: "nope" }),
    });
    expect(bad.status).toBe(422);
    expect((await json(bad)).error.details.issues.map((i: { path: string }) => i.path)).toEqual([
      "body.name",
      "body.email",
    ]);

    const good = await fetch(`${base}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Linus", email: "linus@example.com" }),
    });
    expect(good.status).toBe(201);
    expect((await json(good)).data).toMatchObject({ id: 3, name: "Linus" });
  });

  it("returns 404s and validates params", async () => {
    expect((await fetch(`${base}/users/99`)).status).toBe(404);
    expect((await fetch(`${base}/users/abc`)).status).toBe(422);
    const missing = await fetch(`${base}/does-not-exist`);
    expect(missing.status).toBe(404);
    expect((await json(missing)).error.code).toBe("NOT_FOUND");
  });

  it("never leaks internal error details but logs them", async () => {
    const res = await fetch(`${base}/users/1/crash`);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("s3cret");
    expect(JSON.parse(text).error.message).toBe("Internal Server Error");
    expect(logs.at("error").length).toBeGreaterThan(0);
    expect(logs.contains("10.0.0.5")).toBe(true);
  });

  it("exposes health endpoints and does not log them", async () => {
    logs.clear();
    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({
      status: "ok",
      checks: { memory: { status: "ok" } },
    });
    expect((await fetch(`${base}/health/live`)).status).toBe(200);
    expect(logs.find("request completed")).toBeUndefined();
  });
});
