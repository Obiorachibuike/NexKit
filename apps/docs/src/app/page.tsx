import Link from "next/link";

import { CodeBlock, CopyButton } from "@/components/CodeBlock";
import { Tab, Tabs } from "@/components/Tabs";
import { site } from "@/lib/site";

const features = [
  {
    title: "Configuration validation",
    pkg: "config",
    body: "Declare env vars once with types, defaults and constraints. Fail fast at startup with every problem listed — and never a secret value in the message.",
  },
  {
    title: "Standardized errors",
    pkg: "errors",
    body: "AppError with stable codes, HTTP status mapping and a hard line between what clients see and what you log.",
  },
  {
    title: "Structured logging",
    pkg: "logger",
    body: "NDJSON logs with levels, child loggers, error serialization, pluggable transports and automatic secret redaction.",
  },
  {
    title: "Request utilities",
    pkg: "express · fastify",
    body: "Request and correlation ids, timing, and one structured log line per request — propagated through AsyncLocalStorage.",
  },
  {
    title: "Security helpers",
    pkg: "core",
    body: "Secure header presets, request size limits, Standard Schema input validation and sensitive-field redaction. No home-grown crypto.",
  },
  {
    title: "Health checks",
    pkg: "health",
    body: "Liveness and readiness registries with per-check timeouts, criticality and sanitized reports that orchestrators understand.",
  },
  {
    title: "API responses",
    pkg: "response",
    body: "Typed success/error envelopes, offset and cursor pagination metadata, and validation-error formatting.",
  },
  {
    title: "Rate-limit adapters",
    pkg: "ratelimit",
    body: "A small RateLimiter contract with Redis stores and an adapter for rate-limiter-flexible. Honest about what memory stores can do.",
  },
];

const packages = [
  ["core", "Primitives: redaction, request context, ids, timeouts, headers"],
  ["config", "validateEnv and friends"],
  ["errors", "AppError, HTTP errors, normalizeError"],
  ["logger", "Structured logger and transports"],
  ["health", "Health registry and built-in checks"],
  ["response", "Envelopes and pagination"],
  ["ratelimit", "RateLimiter contract, stores, adapters"],
  ["express", "Express middleware"],
  ["fastify", "Fastify plugin"],
  ["testing", "Test helpers"],
  ["cli", "nexkit init · doctor · generate"],
];

const envExample = `import { validateEnv } from "@nexkitjs/config";

export const env = validateEnv({
  NODE_ENV: { type: "enum", values: ["development", "test", "production"], default: "development" },
  PORT: { type: "number", default: 3000 },
  DATABASE_URL: { type: "url" },
  REDIS_URL: { type: "url", optional: true },
  LOG_LEVEL: { type: "enum", values: ["debug", "info", "warn", "error"], default: "info" },
});

env.PORT;      // number
env.REDIS_URL; // string | undefined`;

const envError = `EnvValidationError: Invalid environment configuration (2 issues):
  - DATABASE_URL: required but not set (expected a URL)
  - PORT: expected a number`;

const expressExample = `import express from "express";
import { createLogger } from "@nexkitjs/logger";
import { createHealthRegistry } from "@nexkitjs/health";
import { requestContext, secureHeaders, healthRoutes, errorHandler, notFoundHandler } from "@nexkitjs/express";

const logger = createLogger({ name: "api" });
const health = createHealthRegistry();
health.register("postgres", (signal) => db.ping({ signal }));

const app = express();
app.use(requestContext({ logger }));
app.use(secureHeaders());
app.use(express.json({ limit: "1mb" }));
app.use(healthRoutes(health));

app.get("/users/:id", async (req, res) => {
  const user = await users.find(req.params.id);
  if (!user) throw new NotFoundError("User not found");
  res.json(ok(user));
});

app.use(notFoundHandler());
app.use(errorHandler({ logger }));`;

const fastifyExample = `import Fastify from "fastify";
import { createLogger } from "@nexkitjs/logger";
import { createHealthRegistry } from "@nexkitjs/health";
import { nexkit, requestIdGenerator } from "@nexkitjs/fastify";

const logger = createLogger({ name: "api" });
const health = createHealthRegistry();
health.register("postgres", (signal) => db.ping({ signal }));

const app = Fastify({ genReqId: requestIdGenerator(), bodyLimit: 1024 * 1024 });
await app.register(nexkit, { logger, health });

app.get("/users/:id", async (req) => {
  const user = await users.find(req.params.id);
  if (!user) throw new NotFoundError("User not found");
  return ok(user);
});`;

function Code({ code, lang, title }: { code: string; lang: string; title?: string }) {
  return (
    <CodeBlock title={title}>
      <code className={`language-${lang}`}>{code}</code>
    </CodeBlock>
  );
}

export default function Home() {
  const install = "npm install @nexkitjs/config @nexkitjs/logger @nexkitjs/express";
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
          <div className="fade-up mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />v{site.version} · ESM ·
              TypeScript · Node 20+
            </p>
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
              Build Better Backends
              <br />
              <span className="bg-gradient-to-r from-accent-600 to-sky-600 bg-clip-text text-transparent dark:from-accent-300 dark:to-sky-300">
                With Less Boilerplate.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--muted)]">
              NexKit is a modular toolkit for Node.js and TypeScript services: configuration,
              errors, logging, request correlation, health checks, security headers, responses and
              rate-limit integration — framework-agnostic at the core, with first-class Express and
              Fastify adapters.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/docs/quick-start/"
                className="inline-flex h-11 items-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Get started
              </Link>
              <Link
                href="/docs/modules/"
                className="inline-flex h-11 items-center rounded-md border border-[var(--border)] px-5 text-sm font-medium hover:bg-[var(--card)]"
              >
                Browse modules
              </Link>
            </div>
            <div className="mx-auto mt-8 flex max-w-xl items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--code-bg)] py-2.5 pr-2 pl-4 text-left font-mono text-sm text-zinc-200">
              <span className="truncate">
                <span className="text-zinc-500">$ </span>
                {install}
              </span>
              <CopyButton text={install} />
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            [
              "Install only what you need",
              "Eleven small packages, one coherent design. Zero runtime dependencies outside the scope.",
            ],
            [
              "Your framework stays yours",
              "Adapters add middleware and plugins to Express or Fastify. The core never imports either.",
            ],
            [
              "Safe defaults, explicit opt-outs",
              "Hidden 5xx messages, redacted logs, validated request ids, HSTS on. Each is one option away.",
            ],
          ].map(([title, body]) => (
            <div
              key={title}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
            >
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-[var(--muted)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Config example */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-accent-700 dark:text-accent-300">
              @nexkitjs/config
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Configuration that fails loudly, safely and early
            </h2>
            <p className="mt-4 text-[var(--muted)]">
              Describe your environment once. Get a frozen, fully typed object back — or a startup
              error that lists every missing and invalid variable by name. Values never appear in
              messages, so a misconfigured container cannot leak a database password into your logs.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {[
                "string, number, port, boolean, url, enum, list, json and custom fields",
                "defaults, optional fields, min/max, patterns, protocol allow-lists",
                "maskEnv() for safe startup banners, generateEnvExample() for .env.example",
                "zero dependencies; Zod-based schemas are supported via Standard Schema in request validation",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-1 h-4 w-4 shrink-0 rounded-full bg-accent-100 text-center text-[10px] leading-4 text-accent-800 dark:bg-accent-900/50 dark:text-accent-200">
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <Link
              href="/docs/configuration/"
              className="mt-6 inline-block text-sm font-medium text-accent-700 hover:underline dark:text-accent-300"
            >
              Read the configuration guide →
            </Link>
          </div>
          <div>
            <Code code={envExample} lang="ts" title="src/config/env.ts" />
            <Code code={envError} lang="text" title="startup output when misconfigured" />
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="border-y border-[var(--border)] bg-[var(--card)]/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything a service needs on day one
            </h2>
            <p className="mt-3 text-[var(--muted)]">
              Each capability is its own package with a documented API, strong types and tests. They
              share one context model, one error model and one redaction policy — so they compose
              instead of colliding.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5"
              >
                <p className="font-mono text-[11px] text-[var(--muted)]">@nexkitjs/{f.pkg}</p>
                <h3 className="mt-1.5 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Framework tabs */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid items-start gap-10 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="text-sm font-semibold text-accent-700 dark:text-accent-300">Adapters</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Works with the framework you already run
            </h2>
            <p className="mt-4 text-[var(--muted)]">
              The Express middleware and the Fastify plugin expose the same features with the idioms
              of each framework: request context, secure headers, size limits, validation, health
              routes, rate limiting, 404 and error handling. Every response carries{" "}
              <code className="font-mono text-sm">X-Request-Id</code>; every log line carries{" "}
              <code className="font-mono text-sm">requestId</code>.
            </p>
            <p className="mt-4 text-[var(--muted)]">
              Or scaffold it:{" "}
              <code className="font-mono text-sm">npx @nexkitjs/cli init --framework fastify</code>{" "}
              generates the config module, the wiring and a{" "}
              <code className="font-mono text-sm">.env.example</code>.
            </p>
            <div className="mt-6 flex gap-4 text-sm font-medium">
              <Link
                href="/docs/express/"
                className="text-accent-700 hover:underline dark:text-accent-300"
              >
                Express guide →
              </Link>
              <Link
                href="/docs/fastify/"
                className="text-accent-700 hover:underline dark:text-accent-300"
              >
                Fastify guide →
              </Link>
            </div>
          </div>
          <div className="min-w-0 lg:col-span-3">
            <Tabs items={["Express", "Fastify"]} group="framework">
              <Tab>
                <Code code={expressExample} lang="ts" />
              </Tab>
              <Tab>
                <Code code={fastifyExample} lang="ts" />
              </Tab>
            </Tabs>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Eleven packages, one toolkit</h2>
              <p className="mt-3 text-[var(--muted)]">
                All packages are versioned together, ship ESM builds with TypeScript declarations
                and are verified by CI on Node 20, 22 and 24 — including a smoke test that installs
                the packed tarballs into a fresh project.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm">
                <Link
                  href="/docs/installation/"
                  className="rounded-md bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700"
                >
                  Installation
                </Link>
                <Link
                  href="/docs/api-reference/"
                  className="rounded-md border border-[var(--border)] px-4 py-2 font-medium hover:bg-[var(--card)]"
                >
                  API reference
                </Link>
                <Link
                  href="/docs/roadmap/"
                  className="rounded-md border border-[var(--border)] px-4 py-2 font-medium hover:bg-[var(--card)]"
                >
                  Roadmap &amp; limitations
                </Link>
              </div>
            </div>
            <ul className="divide-y divide-[var(--border)] text-sm">
              {packages.map(([name, desc]) => (
                <li key={name} className="flex items-baseline justify-between gap-4 py-2">
                  <code className="font-mono text-[13px]">@nexkitjs/{name}</code>
                  <span className="text-right text-[var(--muted)]">{desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
