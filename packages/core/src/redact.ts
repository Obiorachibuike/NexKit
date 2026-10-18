/**
 * Secret redaction utilities.
 *
 * Redaction is key-based: any object key whose name matches a sensitive
 * pattern has its value replaced. This is intentionally conservative — it is
 * far better to over-redact a log line than to leak a credential.
 */

/** Key patterns that are treated as sensitive by default (matched case-insensitively). */
export const DEFAULT_REDACT_PATTERNS: readonly RegExp[] = [
  /pass(word|wd|phrase)?$/i,
  /^pwd$/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /private[-_]?key/i,
  /^authorization$/i,
  /^proxy-authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /session[-_]?id/i,
  /credential/i,
  /^ssn$/i,
  /credit[-_]?card/i,
  /card[-_]?number/i,
  /^cvv$/i,
  /client[-_]?secret/i,
  /access[-_]?key/i,
];

export const DEFAULT_REDACT_REPLACEMENT = "[REDACTED]";

export interface RedactOptions {
  /**
   * Additional keys (exact, case-insensitive) or patterns to treat as sensitive.
   * Merged with {@link DEFAULT_REDACT_PATTERNS} unless `replaceDefaults` is true.
   */
  keys?: ReadonlyArray<string | RegExp>;
  /** When true, only the provided `keys` are used and the defaults are ignored. */
  replaceDefaults?: boolean;
  /** Replacement value. Defaults to `"[REDACTED]"`. */
  replacement?: string;
  /** Maximum traversal depth. Values deeper than this are replaced with `"[MAX_DEPTH]"`. Defaults to 10. */
  maxDepth?: number;
  /**
   * Optional patterns applied to string *values* (not keys). Any match is replaced.
   * Useful for catching bearer tokens embedded in free text. Off by default.
   */
  valuePatterns?: readonly RegExp[];
}

export type Redactor = <T>(value: T) => T;

function toMatcher(entry: string | RegExp): (key: string) => boolean {
  if (entry instanceof RegExp) {
    return (key) => {
      entry.lastIndex = 0;
      return entry.test(key);
    };
  }
  const lowered = entry.toLowerCase();
  return (key) => key.toLowerCase() === lowered;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Creates a reusable redactor function. Prefer this over {@link redact} in hot
 * paths (e.g. loggers) so pattern compilation happens once.
 */
export function createRedactor(options: RedactOptions = {}): Redactor {
  const base = options.replaceDefaults ? [] : [...DEFAULT_REDACT_PATTERNS];
  const matchers = [...base, ...(options.keys ?? [])].map(toMatcher);
  const replacement = options.replacement ?? DEFAULT_REDACT_REPLACEMENT;
  const maxDepth = options.maxDepth ?? 10;
  const valuePatterns = options.valuePatterns ?? [];

  const isSensitive = (key: string): boolean => matchers.some((m) => m(key));

  const redactString = (value: string): string => {
    if (valuePatterns.length === 0) return value;
    let out = value;
    for (const pattern of valuePatterns) {
      out = out.replace(pattern, replacement);
    }
    return out;
  };

  const walk = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return redactString(value);
    if (typeof value !== "object") return value;

    if (depth > maxDepth) return "[MAX_DEPTH]";
    if (seen.has(value)) return "[Circular]";

    if (value instanceof Date) return value;
    if (value instanceof Error) {
      seen.add(value);
      const errorRecord: Record<string, unknown> = {
        name: value.name,
        message: redactString(value.message),
      };
      if (value.stack) errorRecord.stack = value.stack;
      for (const key of Object.keys(value)) {
        errorRecord[key] = isSensitive(key)
          ? replacement
          : walk((value as unknown as Record<string, unknown>)[key], depth + 1, seen);
      }
      return errorRecord;
    }

    if (Array.isArray(value)) {
      seen.add(value);
      return value.map((item) => walk(item, depth + 1, seen));
    }

    if (value instanceof Map) {
      seen.add(value);
      const out: Record<string, unknown> = {};
      for (const [k, v] of value) {
        const key = String(k);
        out[key] = isSensitive(key) ? replacement : walk(v, depth + 1, seen);
      }
      return out;
    }

    if (value instanceof Set) {
      seen.add(value);
      return [...value].map((item) => walk(item, depth + 1, seen));
    }

    if (isPlainObject(value)) {
      seen.add(value);
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        out[key] = isSensitive(key) ? replacement : walk(value[key], depth + 1, seen);
      }
      return out;
    }

    // Class instances: honour toJSON, otherwise copy own enumerable props.
    const maybeJson = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof maybeJson === "function") {
      seen.add(value);
      return walk(maybeJson.call(value), depth + 1, seen);
    }
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[key] = isSensitive(key)
        ? replacement
        : walk((value as Record<string, unknown>)[key], depth + 1, seen);
    }
    return out;
  };

  return <T>(value: T): T => walk(value, 0, new WeakSet()) as T;
}

/**
 * Returns a deep copy of `value` with sensitive fields replaced.
 * Never mutates the input.
 *
 * @example
 * redact({ user: "ana", password: "hunter2" }); // { user: "ana", password: "[REDACTED]" }
 */
export function redact<T>(value: T, options?: RedactOptions): T {
  return createRedactor(options)(value);
}

/** Returns true when the given key name matches a sensitive pattern. */
export function isSensitiveKey(key: string, options: RedactOptions = {}): boolean {
  const base = options.replaceDefaults ? [] : [...DEFAULT_REDACT_PATTERNS];
  return [...base, ...(options.keys ?? [])].map(toMatcher).some((m) => m(key));
}
