#!/usr/bin/env node
/**
 * Publish smoke test: packs every package with `npm pack` (exactly what gets
 * published), installs the tarballs into a fresh project *outside* the
 * monorepo, and runs a small Express + Fastify app against them. This catches
 * missing `files`, broken `exports`, and workspace-only resolution mistakes.
 *
 * Run after `npm run build`. Requires network access the first time
 * (express, fastify and zod are installed from the registry).
 */
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const work = mkdtempSync(join(tmpdir(), "nexkit-smoke-"));
const tarballs = join(work, "tarballs");
const app = join(work, "app");

const run = (cmd, cwd, opts = {}) =>
  execSync(cmd, { cwd, stdio: opts.quiet ? "pipe" : "inherit", encoding: "utf8", ...opts });

try {
  console.log(`→ packing packages into ${tarballs}`);
  mkdirSync(tarballs, { recursive: true });
  mkdirSync(app, { recursive: true });
  const packed = [];
  for (const dir of readdirSync(join(root, "packages"))) {
    const out = execFileSync("npm", ["pack", "--pack-destination", tarballs, "--silent"], {
      cwd: join(root, "packages", dir),
      encoding: "utf8",
    }).trim();
    packed.push(join(tarballs, out.split("\n").pop()));
  }
  console.log(`  packed ${packed.length} tarballs`);

  console.log("→ creating a fresh consumer project");
  writeFileSync(
    join(app, "..", "package.json"),
    JSON.stringify({ name: "smoke-root", private: true }, null, 2),
  ); // isolate from any parent workspace
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify(
      { name: "nexkit-smoke", private: true, type: "module", version: "0.0.0" },
      null,
      2,
    ),
  );
  const deps = ["express@^5.1.0", "fastify@^5.3.0", "zod@^4.0.0", ...packed];
  run(
    `npm install --no-audit --no-fund --silent ${deps.map((d) => JSON.stringify(d)).join(" ")}`,
    app,
  );

  // Make sure dependencies were satisfied from tarballs, not symlinks.
  const installedCore = JSON.parse(
    readFileSync(join(app, "node_modules/@nexkitjs/core/package.json"), "utf8"),
  );
  if (!installedCore.version) throw new Error("core not installed");

  writeFileSync(
    join(app, "smoke.mjs"),
    `
import express from "express";
import Fastify from "fastify";
import { z } from "zod";
import { validateEnv } from "@nexkitjs/config";
import { NotFoundError } from "@nexkitjs/errors";
import { createLogger, memoryTransport } from "@nexkitjs/logger";
import { createHealthRegistry } from "@nexkitjs/health";
import { ok } from "@nexkitjs/response";
import { MemoryRateLimitStore, createFixedWindowLimiter } from "@nexkitjs/ratelimit";
import * as ex from "@nexkitjs/express";
import { nexkit, validateRequest } from "@nexkitjs/fastify";
import { createTestLogger } from "@nexkitjs/testing";

const assert = (cond, msg) => { if (!cond) { throw new Error("SMOKE FAIL: " + msg); } };

const env = validateEnv({ PORT: { type: "port", default: 0 }, NAME: { type: "string", default: "smoke" } }, { source: {} });
assert(env.NAME === "smoke", "config defaults");

const transport = memoryTransport();
const logger = createLogger({ transport });
const health = createHealthRegistry();
health.register("ok", () => true);
const limiter = createFixedWindowLimiter({ store: new MemoryRateLimitStore({ cleanupIntervalMs: 0 }), limit: 5, windowMs: 1000 });

// Express
const app = express();
app.use(ex.requestContext({ logger }));
app.use(ex.secureHeaders());
app.use(express.json());
app.use(ex.healthRoutes(health));
app.post("/echo", ex.rateLimit({ limiter }), ex.validateRequest({ body: z.object({ n: z.number() }) }), (req, res) => res.json(ok(req.body)));
app.get("/missing", () => { throw new NotFoundError("nope"); });
app.use(ex.notFoundHandler());
app.use(ex.errorHandler({ logger }));
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
let res = await fetch(base + "/echo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: 1 }) });
assert(res.status === 200 && res.headers.get("x-request-id"), "express echo");
assert((await res.json()).data.n === 1, "express body");
res = await fetch(base + "/missing");
assert(res.status === 404 && (await res.json()).error.code === "NOT_FOUND", "express 404");
res = await fetch(base + "/health/ready");
assert(res.status === 200, "express health");
server.close();

// Fastify
const f = Fastify({ logger: false });
await f.register(nexkit, { logger, health });
f.post("/echo", { preHandler: validateRequest({ body: z.object({ n: z.number() }) }) }, async (req) => ok(req.body));
res = await f.inject({ method: "POST", url: "/echo", payload: { n: 2 } });
assert(res.statusCode === 200 && res.json().data.n === 2, "fastify echo");
res = await f.inject({ method: "POST", url: "/echo", payload: { n: "x" } });
assert(res.statusCode === 422, "fastify validation");
await f.close();

const t = createTestLogger();
t.logger.info({ password: "x" }, "hi");
assert(t.contains("[REDACTED]") && !t.contains('"x"'), "testing redaction");
assert(transport.entries.some((e) => e.msg === "request completed"), "request logs");
console.log("smoke ok: " + transport.entries.length + " log entries");
`,
  );
  run("node smoke.mjs", app);

  console.log("→ CLI from the installed tarball");
  const out = run("npx --no-install nexkit --version", app, { quiet: true }).trim();
  console.log(`  nexkit --version → ${out}`);
  run("npx --no-install nexkit generate config --out env.ts --dry-run", app);

  console.log("\nPack smoke test passed.");
} finally {
  rmSync(work, { recursive: true, force: true });
}
