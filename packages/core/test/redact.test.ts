import { describe, expect, it } from "vitest";
import { createRedactor, isSensitiveKey, redact } from "../src/index.js";

describe("redact", () => {
  it("redacts default sensitive keys case-insensitively", () => {
    const input = {
      username: "ana",
      password: "hunter2",
      Authorization: "Bearer abc",
      apiKey: "k",
      api_key: "k2",
      refreshToken: "t",
      clientSecret: "s",
      cookie: "a=b",
      nested: { creditCardNumber: "4111", safe: 1 },
    };
    const out = redact(input);
    expect(out).toEqual({
      username: "ana",
      password: "[REDACTED]",
      Authorization: "[REDACTED]",
      apiKey: "[REDACTED]",
      api_key: "[REDACTED]",
      refreshToken: "[REDACTED]",
      clientSecret: "[REDACTED]",
      cookie: "[REDACTED]",
      nested: { creditCardNumber: "[REDACTED]", safe: 1 },
    });
  });

  it("never mutates the input", () => {
    const input = { password: "x", list: [{ token: "y" }] };
    const copy = structuredClone(input);
    redact(input);
    expect(input).toEqual(copy);
  });

  it("handles arrays, maps, sets, dates and circular references", () => {
    const circular: Record<string, unknown> = { name: "c" };
    circular.self = circular;
    const date = new Date("2024-01-01T00:00:00Z");
    const out = redact({
      arr: [{ secret: "a" }, "plain"],
      map: new Map([
        ["password", "p"],
        ["ok", "v"],
      ]),
      set: new Set([{ token: "t" }]),
      date,
      circular,
    });
    expect(out.arr).toEqual([{ secret: "[REDACTED]" }, "plain"]);
    expect(out.map).toEqual({ password: "[REDACTED]", ok: "v" });
    expect(out.set).toEqual([{ token: "[REDACTED]" }]);
    expect(out.date).toBe(date);
    expect(out.circular.self).toBe("[Circular]");
  });

  it("supports custom keys, replacement, and replacing defaults", () => {
    const out = redact(
      { password: "p", ssnNumber: "1", internalId: 7 },
      { keys: ["internalId", /^ssn/i], replacement: "***" },
    );
    expect(out).toEqual({ password: "***", ssnNumber: "***", internalId: "***" });

    const onlyCustom = redact(
      { password: "p", custom: "c" },
      { keys: ["custom"], replaceDefaults: true },
    );
    expect(onlyCustom).toEqual({ password: "p", custom: "[REDACTED]" });
  });

  it("limits depth", () => {
    const deep = { a: { b: { c: { d: "leaf" } } } };
    const out = redact(deep, { maxDepth: 2 });
    expect(out).toEqual({ a: { b: { c: "[MAX_DEPTH]" } } });
  });

  it("redacts value patterns in strings", () => {
    const out = redact(
      { note: "token Bearer abc.def.ghi here" },
      { valuePatterns: [/Bearer [A-Za-z0-9._-]+/g] },
    );
    expect(out.note).toBe("token [REDACTED] here");
  });

  it("serializes errors and redacts their sensitive props", () => {
    const err = Object.assign(new Error("boom"), { password: "p", code: "E" });
    const out = redact({ err }) as { err: Record<string, unknown> };
    expect(out.err.name).toBe("Error");
    expect(out.err.message).toBe("boom");
    expect(out.err.password).toBe("[REDACTED]");
    expect(out.err.code).toBe("E");
    expect(typeof out.err.stack).toBe("string");
  });

  it("exposes isSensitiveKey and a reusable redactor", () => {
    expect(isSensitiveKey("PASSWORD")).toBe(true);
    expect(isSensitiveKey("displayName")).toBe(false);
    const r = createRedactor({ keys: ["pin"] });
    expect(r({ pin: 1 })).toEqual({ pin: "[REDACTED]" });
  });
});
