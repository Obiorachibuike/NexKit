import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  TimeoutError,
  createRequestContext,
  formatByteSize,
  formatIssuePath,
  generateRequestId,
  getCorrelationId,
  getRequestContext,
  getRequestId,
  isStandardSchema,
  isTimeoutError,
  isValidRequestId,
  parseByteSize,
  parseWith,
  parseWithSync,
  resolveRequestId,
  runWithRequestContext,
  secureHeaders,
  serializeContentSecurityPolicy,
  setRequestContextValue,
  withTimeout,
} from "../src/index.js";

describe("request context", () => {
  it("propagates through async calls and is isolated between runs", async () => {
    expect(getRequestContext()).toBeUndefined();
    const ctx = createRequestContext({ requestId: "req-1" });
    expect(ctx.correlationId).toBe("req-1");

    const results = await Promise.all([
      runWithRequestContext(
        createRequestContext({ requestId: "a", correlationId: "corr-a" }),
        async () => {
          await new Promise((r) => setTimeout(r, 5));
          return [getRequestId(), getCorrelationId()];
        },
      ),
      runWithRequestContext(createRequestContext({ requestId: "b" }), async () => {
        await new Promise((r) => setTimeout(r, 1));
        setRequestContextValue("userId", 42);
        return [getRequestId(), getRequestContext()?.userId];
      }),
    ]);
    expect(results).toEqual([
      ["a", "corr-a"],
      ["b", 42],
    ]);
    expect(getRequestId()).toBeUndefined();
  });

  it("rejects overwriting reserved context keys", () => {
    runWithRequestContext(createRequestContext({ requestId: "x" }), () => {
      expect(() => setRequestContextValue("requestId", "y")).toThrow(TypeError);
    });
    expect(setRequestContextValue("foo", 1)).toBe(false);
  });
});

describe("request ids", () => {
  it("generates uuids and validates incoming ids conservatively", () => {
    expect(generateRequestId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(isValidRequestId("abc-123_X.y:z")).toBe(true);
    expect(isValidRequestId("has space")).toBe(false);
    expect(isValidRequestId("new\nline")).toBe(false);
    expect(isValidRequestId("")).toBe(false);
    expect(isValidRequestId("x".repeat(129))).toBe(false);
    expect(isValidRequestId(123)).toBe(false);
  });

  it("resolves trusted ids and falls back to generated ones", () => {
    expect(resolveRequestId("client-id")).toBe("client-id");
    expect(resolveRequestId(["first", "second"])).toBe("first");
    expect(resolveRequestId("bad id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId("client-id", { trustIncoming: false })).not.toBe("client-id");
  });
});

describe("withTimeout", () => {
  it("resolves when the operation finishes in time", async () => {
    await expect(withTimeout(Promise.resolve(1), 50)).resolves.toBe(1);
  });

  it("rejects with TimeoutError and aborts the signal", async () => {
    let aborted = false;
    const p = withTimeout(
      (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
        }),
      10,
    );
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    expect(aborted).toBe(true);
    await expect(p).rejects.toSatisfy((e) => isTimeoutError(e));
  });

  it("propagates failures and validates arguments", async () => {
    await expect(withTimeout(Promise.reject(new Error("nope")), 50)).rejects.toThrow("nope");
    expect(() => withTimeout(Promise.resolve(), -1)).toThrow(RangeError);
  });

  it("honours an external abort signal", async () => {
    const controller = new AbortController();
    const p = withTimeout(new Promise(() => {}), 1000, { signal: controller.signal });
    controller.abort(new Error("cancelled"));
    await expect(p).rejects.toThrow("cancelled");
  });
});

describe("byte sizes", () => {
  it("parses and formats", () => {
    expect(parseByteSize("1mb")).toBe(1024 * 1024);
    expect(parseByteSize("512KB")).toBe(512 * 1024);
    expect(parseByteSize("100")).toBe(100);
    expect(parseByteSize(2048)).toBe(2048);
    expect(parseByteSize("1.5kb")).toBe(1536);
    expect(() => parseByteSize("lots")).toThrow(RangeError);
    expect(() => parseByteSize("1pb")).toThrow(RangeError);
    expect(formatByteSize(1536)).toBe("1.5 KB");
    expect(formatByteSize(10)).toBe("10 B");
  });
});

describe("standard schema interop", () => {
  const schema = z.object({ name: z.string().min(2), tags: z.array(z.object({ id: z.number() })) });

  it("detects standard schemas", () => {
    expect(isStandardSchema(schema)).toBe(true);
    expect(isStandardSchema({})).toBe(false);
  });

  it("parses successfully (sync and async)", async () => {
    const input = { name: "ok", tags: [{ id: 1 }] };
    expect(parseWithSync(schema, input)).toEqual({ success: true, data: input });
    await expect(parseWith(schema, input)).resolves.toEqual({ success: true, data: input });
  });

  it("normalizes issues with dot/bracket paths", () => {
    const result = parseWithSync(schema, { name: "x", tags: [{ id: "no" }] });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(result.issues.map((i) => i.path).sort()).toEqual(["name", "tags[0].id"]);
    expect(result.issues[0]?.message).toBeTypeOf("string");
  });

  it("throws for async schemas in sync mode", () => {
    const asyncSchema = z.string().refine(async () => true);
    expect(() => parseWithSync(asyncSchema, "x")).toThrow(TypeError);
  });

  it("formats odd path segments safely", () => {
    expect(formatIssuePath(["a", 0, "weird key", "b"])).toBe('a[0]["weird key"].b');
  });
});

describe("secure headers", () => {
  it("produces strict API defaults", () => {
    const h = secureHeaders();
    expect(h["content-security-policy"]).toContain("default-src 'none'");
    expect(h["strict-transport-security"]).toMatch(/^max-age=\d+; includeSubDomains$/);
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["permissions-policy"]).toContain("camera=()");
  });

  it("allows disabling and overriding", () => {
    const h = secureHeaders({
      strictTransportSecurity: false,
      frameOptions: "SAMEORIGIN",
      contentSecurityPolicy: {
        directives: { "default-src": ["'self'"], "upgrade-insecure-requests": true },
        reportOnly: true,
      },
      extra: { "X-Custom": "1" },
    });
    expect(h["strict-transport-security"]).toBeUndefined();
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
    expect(h["content-security-policy"]).toBeUndefined();
    expect(h["content-security-policy-report-only"]).toBe(
      "default-src 'self'; upgrade-insecure-requests",
    );
    expect(h["x-custom"]).toBe("1");
    expect(serializeContentSecurityPolicy({ "img-src": "data:" })).toBe("img-src data:");
  });
});
