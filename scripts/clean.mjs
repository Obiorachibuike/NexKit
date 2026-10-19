#!/usr/bin/env node
// Removes build artifacts. Usage: node scripts/clean.mjs [dir]
import { rmSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const target = resolve(process.argv[2] ?? ".");
const dirs = process.argv[2]
  ? [target]
  : [
      ...readdirSync(resolve("packages")).map((d) => resolve("packages", d)),
      resolve("examples/express-app"),
      resolve("examples/fastify-app"),
      resolve("apps/docs"),
    ];

for (const dir of dirs) {
  for (const artifact of ["dist", ".next", "out", "coverage"]) {
    const p = join(dir, artifact);
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
      console.log(`removed ${p}`);
    }
  }
}
