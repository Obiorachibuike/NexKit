# @nexkitjs/errors

Standardized application errors with stable codes, HTTP status mapping, safe public messages,
internal diagnostics and serialization helpers.

```bash
npm install @nexkitjs/errors
```

```ts
import { NotFoundError, AppError, normalizeError, ValidationError } from "@nexkitjs/errors";

throw new NotFoundError("User 42 not found", { meta: { userId: 42 } });
throw new AppError("Plan limit reached", {
  code: "PLAN_LIMIT",
  status: 402,
  details: { limit: 5 },
});

const err = normalizeError(anything); // always an AppError
err.status; // 500 for unknown errors
err.toPublicJSON(); // { code, message, status, details? } — safe for clients
err.toInternalJSON(); // + name, internalMessage, stack, meta (redacted), cause
```

## Public vs internal

- `message` is internal. For status ≥ 500 it is **hidden** from clients (generic status text
  instead) unless you pass `expose: true` or a `publicMessage`.
- `details` is public and must be JSON-serializable (e.g. validation issues).
- `meta` and `cause` are internal only; `serializeError` redacts them.
- `headers` lets an error carry response headers (`TooManyRequestsError` sets `Retry-After`).

## Classes

`BadRequestError` 400 · `UnauthorizedError` 401 · `ForbiddenError` 403 · `NotFoundError` 404 ·
`MethodNotAllowedError` 405 · `ConflictError` 409 · `GoneError` 410 · `PayloadTooLargeError` 413 ·
`UnsupportedMediaTypeError` 415 · `UnprocessableEntityError` 422 · `ValidationError` 422 (with
`issues`) · `TooManyRequestsError`/`RateLimitError` 429 · `InternalError` 500 ·
`NotImplementedError` 501 · `BadGatewayError` 502 · `ServiceUnavailableError` 503 ·
`GatewayTimeoutError` 504.

## `normalizeError`

Recognizes errors from body parsers and frameworks (`status`/`statusCode`, body-parser
`entity.too.large`, Fastify `FST_ERR_CTP_BODY_TOO_LARGE` and schema `validation` arrays,
`TimeoutError` from `@nexkitjs/core`) and wraps everything else as a non-exposed
`InternalError` with the original as `cause`.

Also: `ErrorCodes`, `codeToStatus`, `statusToCode`, `httpStatusText`, `isAppError`, `assert`.

## License

MIT
