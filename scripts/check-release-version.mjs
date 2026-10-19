#!/usr/bin/env node
/**
 * Fails unless every publishable package has exactly the version given as the
 * first argument (the version derived from the release tag v<version>).
 *
 *   node scripts/check-release-version.mjs 0.1.1
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const expected = process.argv[2];
if (!expected) {
  console.error("usage: check-release-version.mjs <version>");
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = path.join(root, "packages");
const mismatches = [];

for (const dir of readdirSync(packagesDir).sort()) {
  const file = path.join(packagesDir, dir, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (pkg.private) continue;
  if (pkg.version !== expected) mismatches.push(`${pkg.name}: ${pkg.version}`);
  for (const section of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [name, range] of Object.entries(pkg[section] ?? {})) {
      if (
        name.startsWith("@nexkitjs/") &&
        range !== expected &&
        range !== `^${expected}` &&
        range !== `~${expected}`
      ) {
        mismatches.push(`${pkg.name} ${section} ${name}: ${range}`);
      }
    }
  }
}

if (mismatches.length > 0) {
  console.error(`Release tag v${expected} does not match the repository:`);
  for (const m of mismatches) console.error(`  - ${m}`);
  console.error(
    "\nMerge the 'chore: version packages' PR for this version first, then tag that commit.",
  );
  process.exit(1);
}
console.log(`All packages are at ${expected}.`);
