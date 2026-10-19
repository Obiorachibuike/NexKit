import { deepFreeze } from "@nexkitjs/core";
import { AppError } from "@nexkitjs/errors";
import { isSecretField, type EnvField, type EnvSchema, type InferEnv } from "./schema.js";

/** One problem with one environment variable. Never contains the raw value. */
export interface EnvIssue {
  key: string;
  message: string;
  /** `missing` for unset required vars; `invalid` for present-but-wrong values. */
  kind: "missing" | "invalid";
}

export interface ValidateEnvOptions {
  /** Source of raw values. Defaults to `process.env`. */
  source?: Record<string, string | undefined>;
  /** Prefix prepended to every key when reading from `source` (e.g. `"APP_"`). */
  prefix?: string;
  /** Treat empty strings as unset. Defaults to true. */
  emptyIsUndefined?: boolean;
  /** Freeze the returned object. Defaults to true. */
  freeze?: boolean;
}

/**
 * Thrown by {@link validateEnv} when configuration is invalid. Maps to HTTP 500
 * with code `CONFIG_INVALID`; the message lists variable names and reasons only.
 */
export class EnvValidationError extends AppError {
  readonly issues: readonly EnvIssue[];

  constructor(issues: readonly EnvIssue[]) {
    super(formatIssues(issues), {
      code: "CONFIG_INVALID",
      status: 500,
      expose: false,
      publicMessage: "Server configuration error",
      meta: { issues },
    });
    this.issues = issues;
  }
}

function formatIssues(issues: readonly EnvIssue[]): string {
  const lines = issues.map((i) => `  - ${i.key}: ${i.message}`);
  const n = issues.length;
  return `Invalid environment configuration (${n} issue${n === 1 ? "" : "s"}):\n${lines.join("\n")}`;
}

export type SafeValidateResult<S extends EnvSchema> =
  | { success: true; env: InferEnv<S>; issues?: undefined }
  | { success: false; env?: undefined; issues: EnvIssue[] };

const TRUE_VALUES = new Set(["true", "1", "yes", "on", "y"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off", "n"]);

class FieldError extends Error {}

function fail(message: string): never {
  throw new FieldError(message);
}

function parseField(key: string, field: EnvField, raw: string): unknown {
  switch (field.type) {
    case "string": {
      if (field.minLength !== undefined && raw.length < field.minLength) {
        fail(`must be at least ${field.minLength} characters long`);
      }
      if (field.maxLength !== undefined && raw.length > field.maxLength) {
        fail(`must be at most ${field.maxLength} characters long`);
      }
      if (field.pattern) {
        field.pattern.lastIndex = 0;
        if (!field.pattern.test(raw)) fail(`does not match the required pattern ${field.pattern}`);
      }
      return raw;
    }
    case "number": {
      const value = Number(raw.trim());
      if (raw.trim() === "" || Number.isNaN(value)) fail("expected a number");
      if (!Number.isFinite(value)) fail("expected a finite number");
      if (field.integer && !Number.isInteger(value)) fail("expected an integer");
      if (field.min !== undefined && value < field.min) fail(`must be >= ${field.min}`);
      if (field.max !== undefined && value > field.max) fail(`must be <= ${field.max}`);
      return value;
    }
    case "port": {
      const value = Number(raw.trim());
      if (raw.trim() === "" || !Number.isInteger(value) || value < 0 || value > 65535) {
        fail("expected a port number between 0 and 65535");
      }
      return value;
    }
    case "boolean": {
      const normalized = raw.trim().toLowerCase();
      if (TRUE_VALUES.has(normalized)) return true;
      if (FALSE_VALUES.has(normalized)) return false;
      return fail("expected a boolean (true/false, 1/0, yes/no, on/off)");
    }
    case "url": {
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        return fail("expected a valid URL");
      }
      if (field.protocols && field.protocols.length > 0) {
        const protocol = url.protocol.replace(/:$/, "");
        if (!field.protocols.includes(protocol)) {
          fail(`expected URL protocol to be one of: ${field.protocols.join(", ")}`);
        }
      }
      return raw;
    }
    case "enum": {
      if (!field.values.includes(raw)) {
        fail(`expected one of: ${field.values.join(", ")}`);
      }
      return raw;
    }
    case "list": {
      const separator = field.separator ?? ",";
      const items = raw
        .split(separator)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (field.minItems !== undefined && items.length < field.minItems) {
        fail(`expected at least ${field.minItems} item${field.minItems === 1 ? "" : "s"}`);
      }
      return items;
    }
    case "json": {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return fail("expected valid JSON");
      }
      const guard = field.validate;
      if (guard && !guard(parsed)) fail("JSON value failed validation");
      return parsed;
    }
    case "custom": {
      try {
        return field.parse(raw, key);
      } catch (err) {
        const message = err instanceof Error ? err.message : "failed custom validation";
        return fail(message);
      }
    }
    default: {
      const exhaustive: never = field;
      return fail(`unknown field type ${(exhaustive as { type?: string }).type ?? ""}`);
    }
  }
}

/**
 * Validates environment variables against a schema **without throwing**.
 * Returns either the typed env or a list of issues.
 */
export function safeValidateEnv<const S extends EnvSchema>(
  schema: S,
  options: ValidateEnvOptions = {},
): SafeValidateResult<S> {
  const source = options.source ?? process.env;
  const prefix = options.prefix ?? "";
  const emptyIsUndefined = options.emptyIsUndefined ?? true;
  const issues: EnvIssue[] = [];
  const output: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(schema)) {
    const sourceKey = `${prefix}${key}`;
    let raw = source[sourceKey];
    if (emptyIsUndefined && raw !== undefined && raw.trim() === "") raw = undefined;

    if (raw === undefined) {
      if (field.default !== undefined) {
        output[key] = field.default;
      } else if (field.optional) {
        output[key] = undefined;
      } else {
        issues.push({
          key: sourceKey,
          kind: "missing",
          message: `required but not set${describe(field)}`,
        });
      }
      continue;
    }

    try {
      output[key] = parseField(key, field, raw);
    } catch (err) {
      const message = err instanceof FieldError ? err.message : "failed validation";
      issues.push({ key: sourceKey, kind: "invalid", message });
    }
  }

  if (issues.length > 0) return { success: false, issues };
  const env = output as InferEnv<S>;
  if (options.freeze !== false) deepFreeze(env);
  return { success: true, env };
}

function describe(field: EnvField): string {
  switch (field.type) {
    case "enum":
      return ` (expected one of: ${field.values.join(", ")})`;
    case "url":
      return " (expected a URL)";
    case "port":
      return " (expected a port number)";
    case "number":
      return " (expected a number)";
    case "boolean":
      return " (expected a boolean)";
    default:
      return "";
  }
}

/**
 * Validates environment variables against a schema and returns a typed,
 * frozen object. Throws {@link EnvValidationError} listing **all** problems
 * at once. Raw values are never included in errors.
 *
 * @example
 * const env = validateEnv({
 *   PORT: { type: "port", default: 3000 },
 *   DATABASE_URL: { type: "url", protocols: ["postgres", "postgresql"] },
 *   NODE_ENV: { type: "enum", values: ["development", "test", "production"], default: "development" },
 * });
 * env.PORT; // number
 */
export function validateEnv<const S extends EnvSchema>(
  schema: S,
  options: ValidateEnvOptions = {},
): InferEnv<S> {
  const result = safeValidateEnv(schema, options);
  if (!result.success) throw new EnvValidationError(result.issues);
  return result.env;
}

/**
 * Returns a copy of a validated env with secret fields replaced by `"[REDACTED]"`,
 * suitable for printing at startup.
 */
export function maskEnv<S extends EnvSchema>(
  env: InferEnv<S>,
  schema: S,
  replacement = "[REDACTED]",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) {
    const field = schema[key] as EnvField;
    const value = (env as Record<string, unknown>)[key];
    out[key] = value !== undefined && isSecretField(key, field) ? replacement : value;
  }
  return out;
}

/**
 * Generates `.env.example` content from a schema. Secret fields get a
 * placeholder; defaults and descriptions are included as comments.
 */
export function generateEnvExample(schema: EnvSchema, options: { prefix?: string } = {}): string {
  const prefix = options.prefix ?? "";
  const lines: string[] = ["# Generated by NexKit. Copy to .env and fill in the values.", ""];
  for (const [key, field] of Object.entries(schema)) {
    if (field.description) lines.push(`# ${field.description}`);
    const parts: string[] = [`# type: ${field.type}`];
    if (field.type === "enum") parts.push(`one of: ${field.values.join(" | ")}`);
    if (field.default !== undefined) parts.push(`default: ${JSON.stringify(field.default)}`);
    if (field.optional) parts.push("optional");
    lines.push(parts.join(" · "));
    const secret = isSecretField(key, field);
    const value =
      field.example ??
      (secret ? "<secret>" : field.default !== undefined ? defaultToString(field.default) : "");
    const assignment = `${prefix}${key}=${value}`;
    lines.push(field.optional || field.default !== undefined ? `# ${assignment}` : assignment);
    lines.push("");
  }
  return lines.join("\n");
}

function defaultToString(value: unknown): string {
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}
