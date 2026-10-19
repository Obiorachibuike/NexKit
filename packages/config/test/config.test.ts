import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  defineEnvSchema,
  generateEnvExample,
  isSecretField,
  maskEnv,
  safeValidateEnv,
  validateEnv,
} from "../src/index.js";

const schema = defineEnvSchema({
  PORT: { type: "port", default: 3000 },
  DATABASE_URL: { type: "url", protocols: ["postgres", "postgresql"] },
  NODE_ENV: { type: "enum", values: ["development", "test", "production"], default: "development" },
  DEBUG: { type: "boolean", optional: true },
  WORKERS: { type: "number", integer: true, min: 1, max: 32, default: 2 },
  CORS_ORIGINS: { type: "list", default: [] },
  FEATURES: { type: "json", optional: true },
  API_KEY: { type: "string", minLength: 8 },
  REGION: { type: "custom", parse: (raw) => raw.toUpperCase(), optional: true },
});

describe("validateEnv", () => {
  it("parses, applies defaults and returns a frozen typed object", () => {
    const env = validateEnv(schema, {
      source: {
        DATABASE_URL: "postgres://user:pw@localhost/db",
        API_KEY: "12345678",
        DEBUG: "yes",
        CORS_ORIGINS: "https://a.com, https://b.com,",
        FEATURES: '{"beta":true}',
        REGION: "eu",
      },
    });
    expect(env).toEqual({
      PORT: 3000,
      DATABASE_URL: "postgres://user:pw@localhost/db",
      NODE_ENV: "development",
      DEBUG: true,
      WORKERS: 2,
      CORS_ORIGINS: ["https://a.com", "https://b.com"],
      FEATURES: { beta: true },
      API_KEY: "12345678",
      REGION: "EU",
    });
    expect(Object.isFrozen(env)).toBe(true);
    expect(Object.isFrozen(env.CORS_ORIGINS)).toBe(true);
  });

  it("collects all issues at once and never includes raw values", () => {
    const secretValue = "postgres://admin:SuperSecretPw@db.internal/prod";
    const result = safeValidateEnv(schema, {
      source: {
        PORT: "70000",
        DATABASE_URL: "mysql://" + secretValue,
        NODE_ENV: "staging",
        DEBUG: "maybe",
        WORKERS: "2.5",
        FEATURES: "{not json",
        API_KEY: "short",
      },
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    const byKey = Object.fromEntries(result.issues.map((i) => [i.key, i]));
    expect(byKey.PORT?.message).toMatch(/port number/);
    expect(byKey.DATABASE_URL?.message).toMatch(/protocol/);
    expect(byKey.NODE_ENV?.message).toBe("expected one of: development, test, production");
    expect(byKey.DEBUG?.message).toMatch(/boolean/);
    expect(byKey.WORKERS?.message).toBe("expected an integer");
    expect(byKey.FEATURES?.message).toBe("expected valid JSON");
    expect(byKey.API_KEY?.message).toBe("must be at least 8 characters long");
    expect(byKey.API_KEY?.kind).toBe("invalid");

    const serialized = JSON.stringify(result.issues);
    expect(serialized).not.toContain("SuperSecretPw");
    expect(serialized).not.toContain("short");
    expect(serialized).not.toContain("70000");
  });

  it("throws EnvValidationError with a readable, secret-free message", () => {
    let caught: unknown;
    try {
      validateEnv(schema, { source: { API_KEY: "hunter2hunter2" } });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    const err = caught as EnvValidationError;
    expect(err.code).toBe("CONFIG_INVALID");
    expect(err.status).toBe(500);
    expect(err.publicMessage).toBe("Server configuration error");
    expect(err.message).toContain("Invalid environment configuration (1 issue)");
    expect(err.message).toContain("DATABASE_URL: required but not set (expected a URL)");
    expect(err.message).not.toContain("hunter2");
    expect(err.issues[0]).toEqual({
      key: "DATABASE_URL",
      kind: "missing",
      message: "required but not set (expected a URL)",
    });
  });

  it("treats empty strings as unset by default, supports prefixes and custom parse errors", () => {
    const result = safeValidateEnv(
      {
        NAME: { type: "string", default: "fallback" },
        N: {
          type: "custom",
          parse: () => {
            throw new Error("nope");
          },
        },
      },
      { source: { APP_NAME: "", APP_N: "x" }, prefix: "APP_" },
    );
    expect(result.success).toBe(false);
    expect(result.issues?.[0]).toEqual({ key: "APP_N", kind: "invalid", message: "nope" });

    const kept = validateEnv(
      { NAME: { type: "string" } },
      { source: { NAME: "" }, emptyIsUndefined: false },
    );
    expect(kept.NAME).toBe("");
  });

  it("parses booleans and numbers in all supported spellings", () => {
    for (const [raw, expected] of [
      ["TRUE", true],
      ["0", false],
      ["on", true],
      ["Off", false],
      ["y", true],
    ] as const) {
      expect(validateEnv({ B: { type: "boolean" } }, { source: { B: raw } }).B).toBe(expected);
    }
    expect(validateEnv({ N: { type: "number" } }, { source: { N: " 1e3 " } }).N).toBe(1000);
    expect(
      safeValidateEnv({ N: { type: "number" } }, { source: { N: "Infinity" } }).issues?.[0]
        ?.message,
    ).toBe("expected a finite number");
    expect(
      safeValidateEnv({ S: { type: "string", pattern: /^[a-z]+$/ } }, { source: { S: "ABC" } })
        .issues?.[0]?.message,
    ).toMatch(/pattern/);
  });

  it("validates URLs and lists", () => {
    expect(
      safeValidateEnv({ U: { type: "url" } }, { source: { U: "not a url" } }).issues?.[0]?.message,
    ).toBe("expected a valid URL");
    expect(validateEnv({ U: { type: "url" } }, { source: { U: "https://x.dev/path?q=1" } }).U).toBe(
      "https://x.dev/path?q=1",
    );
    expect(
      safeValidateEnv({ L: { type: "list", minItems: 2 } }, { source: { L: "a" } }).issues?.[0]
        ?.message,
    ).toBe("expected at least 2 items");
    expect(
      validateEnv({ L: { type: "list", separator: ";" } }, { source: { L: "a;b" } }).L,
    ).toEqual(["a", "b"]);
  });

  it("uses json type guards", () => {
    const isNums = (v: unknown): v is number[] =>
      Array.isArray(v) && v.every((n) => typeof n === "number");
    expect(
      validateEnv({ J: { type: "json", validate: isNums } }, { source: { J: "[1,2]" } }).J,
    ).toEqual([1, 2]);
    expect(
      safeValidateEnv({ J: { type: "json", validate: isNums } }, { source: { J: '["a"]' } })
        .issues?.[0]?.message,
    ).toBe("JSON value failed validation");
  });

  it("reads from process.env by default", () => {
    process.env.NEXKIT_TEST_VAR = "42";
    try {
      expect(validateEnv({ NEXKIT_TEST_VAR: { type: "number" } }).NEXKIT_TEST_VAR).toBe(42);
    } finally {
      delete process.env.NEXKIT_TEST_VAR;
    }
  });
});

describe("secret handling", () => {
  it("detects secret fields by flag or key heuristics", () => {
    expect(isSecretField("API_KEY", { type: "string" })).toBe(true);
    expect(isSecretField("DATABASE_URL", { type: "url" })).toBe(true);
    expect(isSecretField("PORT", { type: "port" })).toBe(false);
    expect(isSecretField("PORT", { type: "port", secret: true })).toBe(true);
    expect(isSecretField("JWT_SECRET", { type: "string", secret: false })).toBe(false);
  });

  it("masks secrets for safe printing", () => {
    const env = validateEnv(schema, {
      source: { DATABASE_URL: "postgres://u:p@h/db", API_KEY: "12345678" },
    });
    const masked = maskEnv(env, schema);
    expect(masked.DATABASE_URL).toBe("[REDACTED]");
    expect(masked.API_KEY).toBe("[REDACTED]");
    expect(masked.PORT).toBe(3000);
    expect(masked.DEBUG).toBeUndefined();
  });

  it("generates a .env.example without secret values", () => {
    const example = generateEnvExample({
      PORT: { type: "port", default: 3000, description: "HTTP port" },
      API_KEY: { type: "string" },
      MODE: { type: "enum", values: ["a", "b"], optional: true },
      HOST: { type: "string", example: "0.0.0.0" },
    });
    expect(example).toContain("# HTTP port");
    expect(example).toContain("# PORT=3000");
    expect(example).toContain("API_KEY=<secret>");
    expect(example).toContain("one of: a | b");
    expect(example).toContain("# MODE=");
    expect(example).toContain("HOST=0.0.0.0");
  });
});
