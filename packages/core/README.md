# @nexkitjs/core

Framework-agnostic primitives shared by every NexKit module. Zero dependencies.

```bash
npm install @nexkitjs/core
```

## What's inside

| Area               | Exports                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redaction          | `redact`, `createRedactor`, `isSensitiveKey`, `DEFAULT_REDACT_PATTERNS`                                                                                                            |
| Request context    | `runWithRequestContext`, `getRequestContext`, `getRequestId`, `getCorrelationId`, `setRequestContextValue`, `createRequestContext`, `enterRequestContext`, `requestContextStorage` |
| Request ids        | `generateRequestId`, `isValidRequestId`, `resolveRequestId`                                                                                                                        |
| Timeouts           | `withTimeout`, `TimeoutError`, `isTimeoutError`, `startTimer`, `roundDuration`                                                                                                     |
| Sizes              | `parseByteSize`, `formatByteSize`                                                                                                                                                  |
| Validation interop | `parseWith`, `parseWithSync`, `isStandardSchema`, `normalizeIssues`, `formatIssuePath` (Standard Schema v1)                                                                        |
| Secure headers     | `secureHeaders`, `serializeContentSecurityPolicy`, `serializePermissionsPolicy`, `HEADERS_TO_REMOVE`                                                                               |
| Utilities          | `isObject`, `isPlainObject`, `deepFreeze` and JSON types                                                                                                                           |

## Examples

```ts
import { redact, withTimeout, secureHeaders, parseWith } from "@nexkitjs/core";

redact({ user: "ana", password: "hunter2", headers: { authorization: "Bearer x" } });
// → { user: "ana", password: "[REDACTED]", headers: { authorization: "[REDACTED]" } }

const rows = await withTimeout((signal) => db.query(sql, { signal }), 2000);

secureHeaders({ strictTransportSecurity: false }); // header map for local HTTP dev

const result = await parseWith(zodSchema, input); // { success, data } | { success: false, issues }
```

### Request context

```ts
import { runWithRequestContext, createRequestContext, getRequestId } from "@nexkitjs/core";

runWithRequestContext(createRequestContext({ requestId: "abc" }), async () => {
  await doWork();
  getRequestId(); // "abc" — anywhere down the async call chain
});
```

The Express and Fastify adapters populate this automatically; `@nexkitjs/logger` reads it to
stamp `requestId`/`correlationId` on every log line.

## Documentation

Full docs and API reference: see the NexKit documentation site in the repository (`apps/docs`).

## License

MIT
