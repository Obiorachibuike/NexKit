# Deployment guide

Two things get deployed from this repository: **applications built with NexKit** (yours) and
the **documentation website** (`apps/docs`). This guide covers both.

---

## Part 1 — Deploying applications that use NexKit

NexKit adds no deployment requirements beyond a Node.js ≥ 20 runtime, but the modules are
designed around a few production practices worth setting up deliberately.

### Configuration

- Validate configuration at startup with `validateEnv`. A misconfigured container exits
  immediately with a message listing every missing/invalid variable (names only — never values),
  which is far better than failing on the first request.
- Commit `.env.example` (generate it with `nexkit generate config --example`), never `.env`.
  `nexkit doctor` checks that `.env` is git-ignored.
- In Docker/Kubernetes, pass secrets as environment variables or mounted files; `validateEnv`
  reads `process.env` by default and accepts any `source` object if you load from files.

### Logging

- Use the default JSON transport in production. Log collectors (CloudWatch, Datadog, Loki,
  Stackdriver) ingest newline-delimited JSON natively; the `levelValue` field is pino-compatible.
- Set `LOG_LEVEL` per environment (`info` in production, `debug` when investigating).
- Redaction is on by default. Add your own sensitive keys via `redact.keys` if your domain has
  fields such as `nationalId` or `iban`.
- Call `await logger.flush()` in your shutdown handler so buffered output is written.

### Health checks

Expose the two probes and point your orchestrator at them:

| Probe     | Path            | Kubernetes       | Meaning                                    |
| --------- | --------------- | ---------------- | ------------------------------------------ |
| Liveness  | `/health/live`  | `livenessProbe`  | Process is up; restart if failing          |
| Readiness | `/health/ready` | `readinessProbe` | Dependencies OK; remove from LB if failing |

```yaml
livenessProbe:
  httpGet: { path: /health/live, port: 3000 }
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /health/ready, port: 3000 }
  periodSeconds: 5
  failureThreshold: 3
```

Keep readiness checks cheap and bounded: every check has a timeout (default 5 s) and the
registry returns `503` only when a _critical_ check fails. Mark optional dependencies with
`critical: false` so a degraded cache does not take the service out of rotation.

### Reverse proxies and client IPs

Request logging and rate limiting use the client IP. Behind a load balancer, configure the
framework to trust the proxy — otherwise every request appears to come from the LB:

```ts
app.set("trust proxy", 1); // Express: number of hops
const app = Fastify({ trustProxy: true }); // Fastify
```

### Rate limiting across instances

The `MemoryRateLimitStore` is per-process. With more than one replica, use
`createRedisStore(redisClient)` or wrap an established library with
`adaptRateLimiterFlexible(...)`. Both are documented in `@nexkitjs/ratelimit`.

### Security headers and TLS

`secureHeaders()` sends `Strict-Transport-Security` by default. Only enable it when the
service is actually reached over HTTPS (typically terminated at the edge); otherwise pass
`strictTransportSecurity: false` for local HTTP development as the generated middleware does.

### Graceful shutdown

Handle `SIGTERM` (sent by Docker, Kubernetes, Heroku, Fly.io…): stop accepting connections,
let in-flight requests finish, flush logs, then exit. The example apps in `examples/` show a
minimal pattern.

### Minimal Dockerfile

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1
CMD ["node", "dist/server.js"]
```

---

## Part 2 — Deploying the documentation website

`apps/docs` is a Next.js 15 app configured for **static export** (`output: "export"`), so the
build produces plain HTML/CSS/JS in `apps/docs/out` that any static host can serve.

### Build locally

```bash
npm ci
npm run build        # packages first (the docs import nothing from them, but CI does this anyway)
npm run build:docs   # → apps/docs/out
npx serve apps/docs/out
```

The `prebuild` step regenerates the client-side search index (`public/search-index.json`) from
the MDX content.

### GitHub Pages (included)

`.github/workflows/deploy-docs.yml` builds the site and publishes it with
`actions/deploy-pages`. Enable it once under **Settings → Pages → Source: GitHub Actions**.
The workflow passes `NEXT_PUBLIC_BASE_PATH` (e.g. `/NexKit`) so links and assets work under a
project sub-path.

### Vercel

1. Import the repository.
2. Set **Root Directory** to `apps/docs`.
3. Build command `npm run build` (run from the repo root is fine too: `npm run build:docs`),
   output directory `out`.
4. No environment variables are required. Leave `NEXT_PUBLIC_BASE_PATH` unset for a root domain.

### Netlify / Cloudflare Pages / S3

Any static host works: build with `npm run build:docs` and upload `apps/docs/out`. Configure
the host to serve `404.html` for unknown paths.

### Custom domain

Set `NEXT_PUBLIC_SITE_URL` (used for canonical URLs and the sitemap) to your domain at build
time, e.g. `NEXT_PUBLIC_SITE_URL=https://nexkit.dev npm run build:docs`.
