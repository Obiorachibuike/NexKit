# @nexkitjs/response

Consistent API response envelopes, pagination metadata and validation-error formatting.

```bash
npm install @nexkitjs/response
```

```ts
import { ok, paginated, errorBody, parsePagination } from "@nexkitjs/response";

ok({ id: 1 }); // { success: true, data: { id: 1 } }
ok(user, { requestId: req.id }); // adds requestId
paginated(items, { page: 2, pageSize: 20, total: 95 });
// { success: true, data: [...], meta: { page: 2, pageSize: 20, total: 95, totalPages: 5, hasNext: true, hasPrev: true } }

errorBody(new Error("db down")); // { success: false, error: { code: "INTERNAL_ERROR", message: "Internal Server Error", status: 500 } }

const { page, pageSize, offset, limit } = parsePagination(req.query, { maxPageSize: 50 }); // throws ValidationError (422) if invalid
```

Also: `created`, `cursorPaginated`, `buildPaginationMeta`, `formatValidationIssues`,
`isApiSuccess`, and the `ApiSuccess` / `ApiFailure` / `ApiResponse` / `PaginationMeta` types.

## License

MIT
