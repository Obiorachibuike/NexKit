/**
 * Validation interop built on the Standard Schema specification
 * (https://standardschema.dev). Any library implementing it — Zod ≥ 3.24,
 * Valibot, ArkType, and others — works with NexKit without an adapter and
 * without NexKit depending on any of them.
 */

/** Minimal copy of the Standard Schema v1 interface (kept dependency-free). */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace StandardSchemaV1 {
  interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }
  type Result<Output> = SuccessResult<Output> | FailureResult;
  interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }
  interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }
  interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  interface PathSegment {
    readonly key: PropertyKey;
  }
  interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
  type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["input"];
  type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}

/** A normalized validation issue. `path` is dot/bracket notation (`"items[2].price"`). */
export interface ValidationIssue {
  path: string;
  message: string;
  /** Raw path segments as reported by the schema library. */
  segments: ReadonlyArray<string | number>;
}

export type ParseResult<T> =
  | { success: true; data: T; issues?: undefined }
  | { success: false; data?: undefined; issues: ValidationIssue[] };

/** Returns true when `value` looks like a Standard Schema. */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (typeof value !== "object" && typeof value !== "function") return false;
  if (value === null) return false;
  const std = (value as { "~standard"?: unknown })["~standard"];
  return (
    typeof std === "object" &&
    std !== null &&
    (std as { version?: unknown }).version === 1 &&
    typeof (std as { validate?: unknown }).validate === "function"
  );
}

function segmentKey(segment: PropertyKey | StandardSchemaV1.PathSegment): string | number {
  const key = typeof segment === "object" && segment !== null ? segment.key : segment;
  if (typeof key === "number") return key;
  return String(key);
}

/** Formats raw path segments into dot/bracket notation. */
export function formatIssuePath(segments: ReadonlyArray<string | number>): string {
  let out = "";
  for (const segment of segments) {
    if (typeof segment === "number") {
      out += `[${segment}]`;
    } else if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
      out += out ? `.${segment}` : segment;
    } else {
      out += `[${JSON.stringify(segment)}]`;
    }
  }
  return out;
}

/** Normalizes Standard Schema issues into {@link ValidationIssue}s. */
export function normalizeIssues(issues: ReadonlyArray<StandardSchemaV1.Issue>): ValidationIssue[] {
  return issues.map((issue) => {
    const segments = (issue.path ?? []).map(segmentKey);
    return { path: formatIssuePath(segments), message: issue.message, segments };
  });
}

/**
 * Validates `input` against a Standard Schema, returning a discriminated result.
 * Supports schemas whose `validate` is async.
 */
export async function parseWith<S extends StandardSchemaV1>(
  schema: S,
  input: unknown,
): Promise<ParseResult<StandardSchemaV1.InferOutput<S>>> {
  const result = await schema["~standard"].validate(input);
  if (result.issues) {
    return { success: false, issues: normalizeIssues(result.issues) };
  }
  return { success: true, data: result.value as StandardSchemaV1.InferOutput<S> };
}

/**
 * Synchronous variant of {@link parseWith}. Throws a `TypeError` if the schema
 * performs asynchronous validation.
 */
export function parseWithSync<S extends StandardSchemaV1>(
  schema: S,
  input: unknown,
): ParseResult<StandardSchemaV1.InferOutput<S>> {
  const result = schema["~standard"].validate(input);
  if (result instanceof Promise) {
    throw new TypeError(
      "Schema validation is asynchronous; use parseWith() instead of parseWithSync().",
    );
  }
  if (result.issues) {
    return { success: false, issues: normalizeIssues(result.issues) };
  }
  return { success: true, data: result.value as StandardSchemaV1.InferOutput<S> };
}
