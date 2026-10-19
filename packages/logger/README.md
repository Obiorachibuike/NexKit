# @nexkitjs/logger

Structured JSON logging with levels, child loggers, error serialization, secret redaction and
automatic request correlation.

```bash
npm install @nexkitjs/logger
```

```ts
import { createLogger } from "@nexkitjs/logger";

const logger = createLogger({ name: "api", base: { service: "billing" } });

logger.info("server started");
logger.info({ userId: 42, password: "x" }, "user signed in"); // password → "[REDACTED]"
logger.error(err, "payment failed"); // err serialized with stack + cause

const reqLogger = logger.child({ tenant: "acme" });
```

Output (NDJSON, pino-compatible `levelValue`):

```json
{
  "level": "info",
  "levelValue": 30,
  "time": "2026-01-01T00:00:00.000Z",
  "msg": "user signed in",
  "name": "api",
  "service": "billing",
  "userId": 42,
  "password": "[REDACTED]",
  "requestId": "…"
}
```

## Options

| Option           | Default                   | Notes                                                          |
| ---------------- | ------------------------- | -------------------------------------------------------------- |
| `level`          | `LOG_LEVEL` env or `info` | `trace` `debug` `info` `warn` `error` `fatal` `silent`         |
| `transport`      | `jsonTransport(stdout)`   | `"json"`, `"pretty"`, a `LogTransport`, or an array            |
| `redact`         | core defaults             | `{ keys, replacement, valuePatterns }` or `false`              |
| `includeContext` | `true`                    | adds `requestId`/`correlationId` from `@nexkitjs/core` context |
| `errorKey`       | `"err"`                   | field under which errors are serialized                        |
| `includeStack`   | `true`                    |                                                                |

Transports: `jsonTransport(stream)`, `prettyTransport({ stream, colors })`, `memoryTransport()`,
`multiTransport([...])`, `callbackTransport(fn)`. Implement `LogTransport` to ship anywhere.

## License

MIT
