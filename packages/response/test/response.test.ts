import { NotFoundError, ValidationError } from "@nexkitjs/errors";
import { describe, expect, it } from "vitest";
import {
  buildPaginationMeta,
  created,
  cursorPaginated,
  errorBody,
  formatValidationIssues,
  isApiSuccess,
  ok,
  paginated,
  parsePagination,
} from "../src/index.js";

describe("envelopes", () => {
  it("builds success envelopes with optional meta and requestId", () => {
    expect(ok({ id: 1 })).toEqual({ success: true, data: { id: 1 } });
    expect(ok({ id: 1 }, { requestId: "r" })).toEqual({
      success: true,
      data: { id: 1 },
      requestId: "r",
    });
    expect(ok([1], { count: 1 })).toEqual({ success: true, data: [1], meta: { count: 1 } });
    expect(ok([1], { count: 1 }, { requestId: "r" })).toEqual({
      success: true,
      data: [1],
      meta: { count: 1 },
      requestId: "r",
    });
    expect(created("x")).toEqual({ success: true, data: "x" });
    expect(isApiSuccess(ok(1))).toBe(true);
  });

  it("builds safe error envelopes from any thrown value", () => {
    expect(errorBody(new NotFoundError("No user"), { requestId: "r" })).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "No user", status: 404 },
      requestId: "r",
    });
    expect(errorBody(new Error("ECONNREFUSED"))).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Internal Server Error", status: 500 },
    });
    expect(isApiSuccess(errorBody("x"))).toBe(false);
  });

  it("formats validation issues", () => {
    expect(
      formatValidationIssues([
        { path: "email", message: "bad" },
        { path: "", message: "root" },
      ]),
    ).toEqual([
      { field: "email", message: "bad" },
      { field: "(root)", message: "root" },
    ]);
  });
});

describe("pagination", () => {
  it("computes metadata", () => {
    expect(buildPaginationMeta({ page: 2, pageSize: 10, total: 25 })).toEqual({
      page: 2,
      pageSize: 10,
      total: 25,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
    expect(buildPaginationMeta({ page: 1, pageSize: 10, total: 0 })).toEqual({
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
    expect(buildPaginationMeta({ page: 0, pageSize: 0, total: -5 })).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 0,
    });
  });

  it("wraps offset and cursor pages", () => {
    const page = paginated([1, 2], { page: 1, pageSize: 2, total: 3 });
    expect(page.meta).toMatchObject({ hasNext: true, totalPages: 2 });
    expect(page.data).toEqual([1, 2]);
    expect(cursorPaginated(["a"], { pageSize: 1, nextCursor: "abc" }).meta).toEqual({
      pageSize: 1,
      nextCursor: "abc",
      hasMore: true,
    });
    expect(cursorPaginated([], { pageSize: 1, nextCursor: null }).meta.hasMore).toBe(false);
  });

  it("parses query parameters with defaults and limits", () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20, offset: 0, limit: 20 });
    expect(parsePagination({ page: "3", pageSize: "10" })).toEqual({
      page: 3,
      pageSize: 10,
      offset: 20,
      limit: 10,
    });
    expect(parsePagination({ page: ["2"], limit: "5" })).toEqual({
      page: 2,
      pageSize: 5,
      offset: 5,
      limit: 5,
    });
    expect(parsePagination({ pageSize: "500" }, { clamp: true }).pageSize).toBe(100);
    expect(parsePagination({ p: "2" }, { pageParam: "p" }).page).toBe(2);
  });

  it("rejects invalid pagination with a ValidationError", () => {
    try {
      parsePagination({ page: "0", pageSize: "abc" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).issues).toEqual([
        { path: "page", message: "must be a positive integer" },
        { path: "pageSize", message: "must be a positive integer" },
      ]);
    }
    try {
      parsePagination({ pageSize: "101" });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as ValidationError).issues[0]?.message).toBe("must be <= 100");
    }
  });
});
