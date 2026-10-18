<p align="center">
  <strong>NexKit</strong><br/>
  <em>Build Better Backends With Less Boilerplate.</em>
</p>

<p align="center">
  <a href="https://github.com/Obiorachibuike/NexKit/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Obiorachibuike/NexKit/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Node >= 20" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen">
  <img alt="ESM" src="https://img.shields.io/badge/module-ESM-blue">
  <img alt="MIT" src="https://img.shields.io/badge/license-MIT-black">
</p>

NexKit is a **modular backend toolkit for Node.js and TypeScript**. It packages the
infrastructure every service ends up re-implementing — configuration validation, standardized
errors, structured logging, request correlation, health checks, secure headers, response
envelopes and rate-limit integration — as small, typed, framework-agnostic modules with
first-class adapters for **Express** and **Fastify**.

It does not replace your web framework. Install only the pieces you need.

```ts
import { validateEnv } from "@nexkitjs/config";

const env = validateEnv({
  PORT: { type: "port", default: 3000 },
  DATABASE_URL: { type: "url", protocols: ["postgres", "postgresql"] },
  NODE_ENV: { type: "enum", values: ["development", "test", "production"], default: "development" },
});

env.PORT; // number — typed, frozen, validated at startup
```

## Packages

| Package                                     | Purpose                                                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`@nexkitjs/core`](packages/core)           | Redaction, request context (AsyncLocalStorage), request ids, timeouts, secure header presets, Standard Schema interop |
| [`@nexkitjs/config`](packages/config)       | `validateEnv` — typed environment validation with defaults and secret-safe errors                                     |
| [`@nexkitjs/errors`](packages/errors)       | `AppError`, HTTP error classes, error codes ↔ status mapping, `normalizeError`, safe serialization                    |
| [`@nexkitjs/logger`](packages/logger)       | Structured JSON logger: levels, child loggers, redaction, request correlation, transports                             |
| [`@nexkitjs/health`](packages/health)       | Liveness/readiness registry with per-check timeouts and sanitized reports                                             |
| [`@nexkitjs/response`](packages/response)   | `ok`/`paginated`/`errorBody` envelopes, pagination parsing, validation formatting                                     |
| [`@nexkitjs/ratelimit`](packages/ratelimit) | `RateLimiter` contract, Redis store, `rate-limiter-flexible` adapter, headers                                         |
| [`@nexkitjs/express`](packages/express)     | Express middleware: request context, secure headers, validation, health routes, rate limit, error handler             |
| [`@nexkitjs/fastify`](packages/fastify)     | Fastify plugin with the same feature set                                                                              |
| [`@nexkitjs/testing`](packages/testing)     | Log capture, env fixtures, `expectAppError`, manual clock, test rate limiter                                          |
| [`@nexkitjs/cli`](packages/cli)             | `nexkit init`, `nexkit doctor`, `nexkit generate config                                                               | middleware` |

All packages are **ESM**, ship **TypeScript declarations**, have **zero runtime dependencies**
outside the `@nexkitjs` scope, and support **Node.js ≥ 20**.

> **Naming note:** the npm scope `@nexkit` and the bare `nexkit` name were already taken by
> unrelated projects, so NexKit publishes under **`@nexkitjs/*`**.

## Quick start

```bash
npm install @nexkitjs/config @nexkitjs/logger @nexkitjs/express @nexkitjs/health @nexkitjs/ratelimit
npx @nexkitjs/cli init --framework express   # scaffolds src/config/env.ts, src/nexkit.ts, .env.example
```

```ts
import express from "express";
import { env } from "./config/env.js";
import { createNexkit } from "./nexkit.js";

const kit = createNexkit(); // logger, health registry, request context, secure headers, rate limit
const app = express();

kit.before(app); // mount NexKit middleware
app.use(express.json());
app.get("/hello", (_req, res) => res.json({ success: true, data: "world" }));
kit.after(app); // 404 + error handler

app.listen(env.PORT, () => kit.logger.info({ port: env.PORT }, "listening"));
```

Every response now carries `X-Request-Id`, every log line carries `requestId`, unexpected
errors return a safe `{ success: false, error: { code, message, status } }` body while the full
diagnostic is logged (redacted), `/health/live` and `/health/ready` are live, and secure headers
are set.

Fastify is equally supported — see [`examples/fastify-app`](examples/fastify-app).

## Documentation

The full documentation site lives in [`apps/docs`](apps/docs) (Next.js + Tailwind) and covers
installation, every module, Express/Fastify/TypeScript examples, configuration, security,
migration, FAQ, roadmap and the API reference. Run it locally:

```bash
npm install && npm run build
npm run dev --workspace apps/docs   # http://localhost:3000
```

Additional guides: [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) ·
[docs/PUBLISHING.md](docs/PUBLISHING.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) ·
[CHANGELOG.md](CHANGELOG.md)

## Design principles

- **Framework-agnostic core.** `@nexkitjs/core` and every non-adapter package never import
  Express or Fastify. Adapters are thin.
- **Safe by default, explicit to loosen.** 5xx messages are hidden, secrets are redacted,
  client request ids are validated, HSTS is on — each is a one-line opt-out.
- **Integrate, don't reinvent.** Rate limiting is an adapter contract over established stores
  and libraries; validation accepts any [Standard Schema](https://standardschema.dev) library
  (Zod, Valibot, ArkType…); logs are plain NDJSON.
- **Honest about limits.** The in-memory rate-limit store says "single process" in its name
  and docs. Redaction is key-based and documented as best-effort.

## Status and known limitations

NexKit is at **0.1.0**. The API is usable and well-tested, but may change in minor releases
until 1.0 (see the roadmap in the docs). Known limitations:

- ESM only — CommonJS consumers need Node ≥ 20.19/22.12 (`require(esm)`) or dynamic `import()`.
- No built-in distributed rate limiter; bring Redis or an established library via the adapters.
- Redaction matches keys (and optional value patterns), not arbitrary secrets inside strings.
- `validateRequest` for Fastify is a `preHandler`; it does not integrate with Fastify's
  schema-based serialization or OpenAPI generation.
- The logger has no built-in file rotation or async batching; it writes NDJSON to any
  writable stream and leaves shipping to your platform.

## Development

```bash
npm install
npm run build          # tsc -b across all packages
npm test               # vitest (packages + example apps)
npm run verify:exports # published entry points & declared API
npm run verify:pack    # npm pack + install into a fresh project + smoke app
npm run check          # lint + build + test + verify:exports
```

## License

[MIT](LICENSE)
