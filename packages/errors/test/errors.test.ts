import { TimeoutError } from "@nexkitjs/core";
import { describe, expect, it } from "vitest";
import {
  AppError,
  BadRequestError,
  ErrorCodes,
  InternalError,
  NotFoundError,
  TooManyRequestsError,
  ValidationError,
  assert,
  codeToStatus,
  httpStatusText,
  isAppError,
  normalizeError,
  serializeError,
  statusToCode,
} from "../src/index.js";

describe("AppError", () => {
  it("derives status from code and code from status", () => {
    expect(new AppError("x", { code: "NOT_FOUND" }).status).toBe(404);
    expect(new AppError("x", { status: 409 }).code).toBe("CONFLICT");
    expect(new AppError("x").status).toBe(500);
    expect(new AppError("x", { code: "MY_CUSTOM" }).status).toBe(500);
    expect(new AppError("x", { code: "PLAN_LIMIT", status: 402 }).toPublicJSON()).toEqual({
      code: "PLAN_LIMIT",
      message: "x",
      status: 402,
    });
  });

  it("hides internal messages for 5xx by default but exposes 4xx", () => {
    const internal = new AppError("db connection string postgres://u:p@h failed", { status: 500 });
    expect(internal.expose).toBe(false);
    expect(internal.publicMessage).toBe("Internal Server Error");
    expect(JSON.parse(JSON.stringify(internal))).toEqual({
      code: "INTERNAL_ERROR",
      message: "Internal Server Error",
      status: 500,
    });

    const bad = new BadRequestError("Missing id");
    expect(bad.publicMessage).toBe("Missing id");
    expect(new InternalError("secret", { publicMessage: "Try later" }).publicMessage).toBe(
      "Try later",
    );
    expect(new InternalError("shown", { expose: true }).publicMessage).toBe("shown");
  });

  it("keeps meta and cause out of public output but in internal output (redacted)", () => {
    const cause = new Error("root cause");
    const err = new NotFoundError("User not found", {
      meta: { userId: 1, password: "p" },
      cause,
      details: { resource: "user" },
    });
    expect(err.toPublicJSON()).toEqual({
      code: "NOT_FOUND",
      message: "User not found",
      status: 404,
      details: { resource: "user" },
    });
    const internal = err.toInternalJSON();
    expect(internal.meta).toEqual({ userId: 1, password: "[REDACTED]" });
    expect((internal.cause as { message: string }).message).toBe("root cause");
    expect(internal.stack).toContain("NotFoundError");
    expect(internal.name).toBe("NotFoundError");
    expect(err.toInternalJSON({ includeStack: false }).stack).toBeUndefined();
  });

  it("supports withMeta and type guards across realms", () => {
    const err = new BadRequestError("x", { meta: { a: 1 } });
    const next = err.withMeta({ b: 2 });
    expect(next).toBeInstanceOf(BadRequestError);
    expect(next.meta).toEqual({ a: 1, b: 2 });
    expect(next.stack).toBe(err.stack);
    expect(isAppError(err)).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
    const fake = { [Symbol.for("nexkit.AppError")]: true };
    expect(AppError.is(fake)).toBe(true);
  });

  it("names subclasses and sets isOperational", () => {
    expect(new NotFoundError().name).toBe("NotFoundError");
    expect(new NotFoundError().message).toBe("Not Found");
    expect(new NotFoundError().isOperational).toBe(true);
    expect(new NotFoundError()).toBeInstanceOf(Error);
  });
});

describe("ValidationError & TooManyRequestsError", () => {
  it("exposes issues as details", () => {
    const err = new ValidationError([
      { path: "email", message: "Invalid email", segments: ["email"] },
    ]);
    expect(err.status).toBe(422);
    expect(err.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(err.toPublicJSON().details).toEqual({
      issues: [{ path: "email", message: "Invalid email" }],
    });
    expect(ValidationError.forField("a", "b").issues).toEqual([{ path: "a", message: "b" }]);
  });

  it("emits retry-after header", () => {
    const err = new TooManyRequestsError("slow down", { retryAfterSeconds: 2.2, limit: 10 });
    expect(err.status).toBe(429);
    expect(err.headers).toEqual({ "retry-after": "3" });
    expect(err.limit).toBe(10);
  });
});

describe("code/status mapping", () => {
  it("maps both directions with sane fallbacks", () => {
    expect(codeToStatus("RATE_LIMITED")).toBe(429);
    expect(codeToStatus("UNKNOWN_THING")).toBe(500);
    expect(statusToCode(418)).toBe("BAD_REQUEST");
    expect(statusToCode(599)).toBe("INTERNAL_ERROR");
    expect(httpStatusText(404)).toBe("Not Found");
    expect(httpStatusText(499)).toBe("Error");
  });
});

describe("normalizeError", () => {
  it("passes AppErrors through", () => {
    const e = new NotFoundError();
    expect(normalizeError(e)).toBe(e);
  });

  it("wraps unknown errors as non-exposed InternalError with cause", () => {
    const e = normalizeError(new Error("ECONNREFUSED 10.0.0.1"));
    expect(e).toBeInstanceOf(InternalError);
    expect(e.publicMessage).toBe("Internal Server Error");
    expect(e.message).toBe("ECONNREFUSED 10.0.0.1");
    expect((e.cause as Error).message).toBe("ECONNREFUSED 10.0.0.1");
  });

  it("wraps thrown non-errors", () => {
    const e = normalizeError("oops");
    expect(e.status).toBe(500);
    expect(e.meta).toEqual({ thrownValue: "oops" });
    expect(normalizeError({ a: 1 }).meta).toEqual({ thrownValue: '{"a":1}' });
  });

  it("recognizes foreign status codes (http-errors / body-parser style)", () => {
    const foreign = Object.assign(new Error("Unexpected token"), {
      status: 400,
      type: "entity.parse.failed",
    });
    const e = normalizeError(foreign);
    expect(e.status).toBe(400);
    expect(e.code).toBe("BAD_REQUEST");
    expect(e.publicMessage).toBe("Unexpected token");

    const tooLarge = Object.assign(new Error("request entity too large"), {
      status: 413,
      type: "entity.too.large",
    });
    expect(normalizeError(tooLarge).code).toBe("PAYLOAD_TOO_LARGE");

    const fastifyTooLarge = Object.assign(new Error("big"), {
      statusCode: 413,
      code: "FST_ERR_CTP_BODY_TOO_LARGE",
    });
    expect(normalizeError(fastifyTooLarge).status).toBe(413);

    const custom = Object.assign(new Error("nope"), { statusCode: 403, code: "TENANT_SUSPENDED" });
    expect(normalizeError(custom).code).toBe("TENANT_SUSPENDED");

    const foreign5xx = Object.assign(new Error("db down at 10.0.0.1"), { status: 503 });
    expect(normalizeError(foreign5xx).publicMessage).toBe("Service Unavailable");

    expect(normalizeError(foreign, { trustForeignStatus: false }).status).toBe(500);
  });

  it("maps Fastify validation errors and timeouts", () => {
    const fastifyValidation = Object.assign(new Error("body/email must match format"), {
      statusCode: 400,
      validation: [{ instancePath: "/email", message: "must match format" }],
    });
    const e = normalizeError(fastifyValidation);
    expect(e).toBeInstanceOf(ValidationError);
    expect((e as ValidationError).issues).toEqual([
      { path: "email", message: "must match format" },
    ]);
    expect(normalizeError(new TimeoutError(100)).status).toBe(504);
  });
});

describe("serializeError & assert", () => {
  it("serializes plain errors with cause chains and redaction", () => {
    const root = Object.assign(new Error("root"), { token: "t" });
    const wrapped = new Error("wrap", { cause: root });
    const out = serializeError(wrapped) as Record<string, unknown>;
    expect(out.message).toBe("wrap");
    expect((out.cause as Record<string, unknown>).token).toBe("[REDACTED]");
    expect(serializeError("str")).toMatchObject({ name: "NonError", message: "str" });
  });

  it("limits cause depth", () => {
    let err: Error = new Error("0");
    for (let i = 1; i < 10; i++) err = new Error(String(i), { cause: err });
    const out = serializeError(err, { maxCauseDepth: 2 }) as {
      cause: { cause: { cause: unknown } };
    };
    expect(out.cause.cause.cause).toBe("[MaxCauseDepth]");
  });

  it("assert throws the provided error", () => {
    expect(() => assert(false, "bad")).toThrow(AppError);
    expect(() => assert(false, new NotFoundError())).toThrow(NotFoundError);
    expect(() => assert(false, () => new NotFoundError("lazy"))).toThrow("lazy");
    expect(() => assert(true, "ok")).not.toThrow();
  });
});
