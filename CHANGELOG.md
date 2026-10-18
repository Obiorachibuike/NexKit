# Changelog

All notable changes to NexKit are documented here. Entries are generated from
[Changesets](.changeset/README.md) at release time; the section below describes the initial
release.

## 0.1.0 (unreleased)

Initial public release of the `@nexkitjs/*` packages:

- `@nexkitjs/core` — redaction, request context, request ids, timeouts, byte sizes, Standard Schema interop, secure header presets.
- `@nexkitjs/config` — `validateEnv`/`safeValidateEnv` with typed inference, `maskEnv`, `generateEnvExample`.
- `@nexkitjs/errors` — `AppError` + HTTP error classes, code/status mapping, `normalizeError`, `serializeError`.
- `@nexkitjs/logger` — structured logger with transports, child loggers, redaction and request correlation.
- `@nexkitjs/health` — registry with timeouts, criticality, liveness/readiness probes.
- `@nexkitjs/response` — envelopes, pagination metadata and parsing, validation formatting.
- `@nexkitjs/ratelimit` — `RateLimiter` contract, fixed-window limiter, memory and Redis stores, `rate-limiter-flexible` adapter.
- `@nexkitjs/express`, `@nexkitjs/fastify` — framework adapters.
- `@nexkitjs/testing` — test helpers.
- `@nexkitjs/cli` — `nexkit init | doctor | generate config | generate middleware`.
