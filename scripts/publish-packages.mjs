#!/usr/bin/env node
/**
 * Publishes every public package under packages/ in dependency order.
 *
 * - Uses whatever credentials npm already has: in GitHub Actions this is the
 *   OIDC trusted-publishing exchange (no token), locally it is your `npm login`.
 * - A version that already exists on the registry is SKIPPED (not an error),
 *   so re-running a release is safe but is not a new publication.
 * - Set DRY_RUN=true to run `npm publish --dry-run`.
 *
 * Writes publish-summary.md for the Actions step summary.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = path.join(root, "packages");
const dryRun = process.env.DRY_RUN === "true";

const pkgs = readdirSync(packagesDir)
  .map((dir) => ({
    dir: path.join(packagesDir, dir),
    json: JSON.parse(readFileSync(path.join(packagesDir, dir, "package.json"), "utf8")),
  }))
  .filter((p) => !p.json.private);

// Topological order so that dependencies are on the registry before dependents.
const byName = new Map(pkgs.map((p) => [p.json.name, p]));
const ordered = [];
const seen = new Set();
function visit(p) {
  if (seen.has(p.json.name)) return;
  seen.add(p.json.name);
  for (const dep of Object.keys(p.json.dependencies ?? {}))
    if (byName.has(dep)) visit(byName.get(dep));
  ordered.push(p);
}
pkgs.forEach(visit);

function alreadyPublished(name, version) {
  const r = spawnSync("npm", ["view", `${name}@${version}`, "version", "--json"], {
    encoding: "utf8",
  });
  if (r.status !== 0) return false; // E404 → not published
  const out = r.stdout.trim();
  return out.length > 0 && out !== "[]";
}

// Refuse to publish an unbuilt tree: `files` would silently ship without dist/.
for (const p of ordered) {
  const entry = path.join(p.dir, p.json.main ?? "dist/index.js");
  if (!existsSync(entry)) {
    console.error(
      `::error::${p.json.name}: ${path.relative(root, entry)} is missing — run \`npm run build\` first`,
    );
    process.exit(1);
  }
}

const rows = [];
let failed = false;
for (const p of ordered) {
  const { name, version } = p.json;
  if (alreadyPublished(name, version)) {
    console.log(`::notice::${name}@${version} already exists on npm — skipped (no-op)`);
    rows.push(`| ${name} | ${version} | skipped (already published) |`);
    continue;
  }
  const args = ["publish", "--access", "public", "--provenance"];
  if (dryRun) args.push("--dry-run");
  console.log(`\n→ npm ${args.join(" ")}  (${name}@${version})`);
  try {
    execFileSync("npm", args, { cwd: p.dir, stdio: "inherit" });
    rows.push(`| ${name} | ${version} | ${dryRun ? "dry-run ok" : "published"} |`);
  } catch {
    failed = true;
    rows.push(`| ${name} | ${version} | **FAILED** |`);
    console.error(`::error::publish failed for ${name}@${version}`);
    break; // keep the remaining packages unpublished so a partial release is easy to resume
  }
}

writeFileSync(
  path.join(root, "publish-summary.md"),
  `### npm publish ${dryRun ? "(dry run)" : ""}\n\n| Package | Version | Result |\n| --- | --- | --- |\n${rows.join("\n")}\n`,
);
process.exit(failed ? 1 : 0);
