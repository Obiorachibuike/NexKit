/**
 * @nexkitjs/response — consistent API response envelopes and pagination.
 *
 * @packageDocumentation
 */
import type { JsonValue, ValidationIssue } from "@nexkitjs/core";
import {
  ValidationError,
  normalizeError,
  type AppError,
  type ErrorDetails,
  type NormalizeErrorOptions,
} from "@nexkitjs/errors";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

/** Successful response envelope. */
export interface ApiSuccess<T, M = undefined> {
  success: true;
  data: T;
  meta?: M;
  requestId?: string;
}

/** Error payload inside an {@link ApiFailure}. */
export interface ApiErrorObject {
  code: string;
  message: string;
  status: number;
  details?: ErrorDetails;
}

/** Error response envelope. */
export interface ApiFailure {
  success: false;
  error: ApiErrorObject;
  requestId?: string;
}

export type ApiResponse<T, M = undefined> = ApiSuccess<T, M> | ApiFailure;

/** Offset-based pagination metadata. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Cursor-based pagination metadata. */
export interface CursorPaginationMeta {
  pageSize: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export type PaginatedResponse<T> = ApiSuccess<T[], PaginationMeta>;
export type CursorPaginatedResponse<T> = ApiSuccess<T[], CursorPaginationMeta>;

/** Public shape of a single validation issue in responses. */
export interface FormattedValidationIssue {
  field: string;
  message: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Builders                                  */
/* -------------------------------------------------------------------------- */

export interface EnvelopeOptions {
  /** Request id to echo in the envelope. */
  requestId?: string | undefined;
}

/** Wraps data in a success envelope. */
export function ok<T>(data: T, options?: EnvelopeOptions): ApiSuccess<T>;
export function ok<T, M>(data: T, meta: M, options?: EnvelopeOptions): ApiSuccess<T, M>;
export function ok<T, M>(
  data: T,
  metaOrOptions?: M | EnvelopeOptions,
  maybeOptions?: EnvelopeOptions,
): ApiSuccess<T, M | undefined> {
  const hasMeta = maybeOptions !== undefined || !isEnvelopeOptions(metaOrOptions);
  const meta = hasMeta ? (metaOrOptions as M) : undefined;
  const options = hasMeta ? maybeOptions : metaOrOptions;
  const out: ApiSuccess<T, M | undefined> = { success: true, data };
  if (meta !== undefined) out.meta = meta;
  if (options?.requestId) out.requestId = options.requestId;
  return out;
}

function isEnvelopeOptions(value: unknown): value is EnvelopeOptions | undefined {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value);
  return keys.length === 0 || (keys.length === 1 && keys[0] === "requestId");
}

/** Alias of {@link ok} for 201 responses — the body shape is identical; set the status in your framework. */
export const created: typeof ok = ok;

/** Computes offset-pagination metadata. */
export function buildPaginationMeta(input: {
  page: number;
  pageSize: number;
  total: number;
}): PaginationMeta {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.max(1, Math.floor(input.pageSize));
  const total = Math.max(0, Math.floor(input.total));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/** Wraps a page of items with offset-pagination metadata. */
export function paginated<T>(
  items: readonly T[],
  pagination: { page: number; pageSize: number; total: number },
  options?: EnvelopeOptions,
): PaginatedResponse<T> {
  return ok([...items], buildPaginationMeta(pagination), options);
}

/** Wraps a page of items with cursor-pagination metadata. */
export function cursorPaginated<T>(
  items: readonly T[],
  pagination: { pageSize: number; nextCursor: string | null },
  options?: EnvelopeOptions,
): CursorPaginatedResponse<T> {
  return ok(
    [...items],
    {
      pageSize: pagination.pageSize,
      nextCursor: pagination.nextCursor,
      hasMore: pagination.nextCursor !== null,
    },
    options,
  );
}

export interface ErrorBodyOptions extends EnvelopeOptions, NormalizeErrorOptions {}

/**
 * Builds a client-safe error envelope from *any* thrown value.
 * Internal messages of 5xx errors are never exposed.
 */
export function errorBody(error: unknown, options: ErrorBodyOptions = {}): ApiFailure {
  const { requestId, ...normalizeOptions } = options;
  const appError: AppError = normalizeError(error, normalizeOptions);
  const out: ApiFailure = { success: false, error: appError.toPublicJSON() };
  if (requestId) out.requestId = requestId;
  return out;
}

/** Converts validation issues to the `{ field, message }` shape used in docs and UIs. */
export function formatValidationIssues(
  issues: ReadonlyArray<ValidationIssue | { path: string; message: string }>,
): FormattedValidationIssue[] {
  return issues.map((i) => ({ field: i.path || "(root)", message: i.message }));
}

/* -------------------------------------------------------------------------- */
/*                             Pagination parsing                             */
/* -------------------------------------------------------------------------- */

export interface ParsePaginationOptions {
  /** Defaults to 20. */
  defaultPageSize?: number;
  /** Defaults to 100. Larger requests are rejected (not clamped) unless `clamp` is true. */
  maxPageSize?: number;
  /** Clamp oversized `pageSize` instead of rejecting. Defaults to false. */
  clamp?: boolean;
  /** Query parameter names. Defaults to `page` / `pageSize` (also accepts `limit`). */
  pageParam?: string;
  pageSizeParam?: string;
}

export interface ParsedPagination {
  page: number;
  pageSize: number;
  /** Zero-based offset for SQL `OFFSET`. */
  offset: number;
  /** Alias of `pageSize` for SQL `LIMIT`. */
  limit: number;
}

function readParam(query: Record<string, unknown>, name: string): unknown {
  const value = query[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parses and validates `page`/`pageSize` from a query object.
 * Throws a {@link ValidationError} (422) on invalid input.
 */
export function parsePagination(
  query: Record<string, unknown>,
  options: ParsePaginationOptions = {},
): ParsedPagination {
  const defaultPageSize = options.defaultPageSize ?? 20;
  const maxPageSize = options.maxPageSize ?? 100;
  const pageParam = options.pageParam ?? "page";
  const pageSizeParam = options.pageSizeParam ?? "pageSize";
  const issues: { path: string; message: string }[] = [];

  const rawPage = readParam(query, pageParam);
  const rawSize = readParam(query, pageSizeParam) ?? readParam(query, "limit");

  let page = 1;
  if (rawPage !== undefined && rawPage !== "") {
    const n = Number(rawPage);
    if (!Number.isInteger(n) || n < 1)
      issues.push({ path: pageParam, message: "must be a positive integer" });
    else page = n;
  }

  let pageSize = defaultPageSize;
  if (rawSize !== undefined && rawSize !== "") {
    const n = Number(rawSize);
    if (!Number.isInteger(n) || n < 1) {
      issues.push({ path: pageSizeParam, message: "must be a positive integer" });
    } else if (n > maxPageSize) {
      if (options.clamp) pageSize = maxPageSize;
      else issues.push({ path: pageSizeParam, message: `must be <= ${maxPageSize}` });
    } else {
      pageSize = n;
    }
  }

  if (issues.length) throw new ValidationError(issues, "Invalid pagination parameters");
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

/** Type guard for success envelopes. */
export function isApiSuccess<T, M>(value: ApiResponse<T, M>): value is ApiSuccess<T, M> {
  return value.success === true;
}

/** Re-exported for convenience when typing `details`. */
export type { ErrorDetails, JsonValue };
