import { randomUUID } from "node:crypto";

/** Generates a new request id (a v4 UUID). */
export function generateRequestId(): string {
  return randomUUID();
}

export interface RequestIdValidationOptions {
  /** Maximum accepted length. Defaults to 128. */
  maxLength?: number;
  /** Allowed character set. Defaults to `[A-Za-z0-9._:-]`. */
  pattern?: RegExp;
}

const DEFAULT_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

/**
 * Validates an id received from an untrusted source (e.g. an `X-Request-Id` header).
 * Ids are echoed into logs and response headers, so we only accept a conservative
 * character set and length to prevent log injection and header abuse.
 */
export function isValidRequestId(
  value: unknown,
  options: RequestIdValidationOptions = {},
): value is string {
  if (typeof value !== "string") return false;
  const maxLength = options.maxLength ?? 128;
  if (value.length === 0 || value.length > maxLength) return false;
  const pattern = options.pattern ?? DEFAULT_ID_PATTERN;
  pattern.lastIndex = 0;
  return pattern.test(value);
}

/**
 * Returns `candidate` if it's a valid incoming id, otherwise a freshly generated one.
 * Accepts arrays (as produced by some header parsers) and uses the first value.
 */
export function resolveRequestId(
  candidate: unknown,
  options: RequestIdValidationOptions & { trustIncoming?: boolean } = {},
): string {
  const trust = options.trustIncoming ?? true;
  const first = Array.isArray(candidate) ? (candidate[0] as unknown) : candidate;
  if (trust && isValidRequestId(first, options)) return first;
  return generateRequestId();
}
