# @nexkitjs/config

Type-safe environment variable validation with defaults, helpful aggregated errors and
secret-safe reporting.

```bash
npm install @nexkitjs/config
```

```ts
import { validateEnv } from "@nexkitjs/config";

export const env = validateEnv({
  NODE_ENV: { type: "enum", values: ["development", "test", "production"], default: "development" },
  PORT: { type: "port", default: 3000 },
  DATABASE_URL: { type: "url", protocols: ["postgres", "postgresql"] },
  REDIS_URL: { type: "url", optional: true },
  WORKERS: { type: "number", integer: true, min: 1, default: 2 },
  FEATURE_FLAGS: { type: "list", default: [] },
  DEBUG: { type: "boolean", default: false },
});

env.PORT; // number
env.REDIS_URL; // string | undefined
env.NODE_ENV; // "development" | "test" | "production"
```

Field types: `string` (min/max length, pattern), `number` (min/max/integer), `port`,
`boolean` (`true/false/1/0/yes/no/on/off`), `url` (optional protocol allow-list), `enum`,
`list` (delimited), `json` (with type guard) and `custom` (your own parser).

## Errors

All problems are reported at once, and **raw values never appear** in messages:

```
EnvValidationError: Invalid environment configuration (2 issues):
  - DATABASE_URL: required but not set (expected a URL)
  - PORT: expected a port number between 0 and 65535
```

`EnvValidationError` extends `AppError` (`code: "CONFIG_INVALID"`, status 500, public message
"Server configuration error"). Use `safeValidateEnv` for a non-throwing result.

## Helpers

- `defineEnvSchema(schema)` — preserves literal types for reuse.
- `maskEnv(env, schema)` — copy with secret fields replaced, safe to print at startup.
- `generateEnvExample(schema)` — `.env.example` content (secrets rendered as `<secret>`).
- `isSecretField(key, field)` — explicit `secret` flag or key heuristics (`PASSWORD`, `TOKEN`, `DATABASE_URL`…).

Options: `source` (defaults to `process.env`), `prefix`, `emptyIsUndefined` (default true),
`freeze` (default true).

## License

MIT
