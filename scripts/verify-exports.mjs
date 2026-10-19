#!/usr/bin/env node
/**
 * Verifies that every built package:
 *  - resolves through its `exports` map (ESM import + Node's resolution rules)
 *  - ships TypeScript declarations next to the JS entry
 *  - exposes the public API documented in `scripts/expected-exports.json`
 *  - (cli) has an executable bin that runs
 *
 * Run after `npm run build`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const expected = JSON.parse(readFileSync(join(root, "scripts/expected-exports.json"), "utf8"));
const require = createRequire(import.meta.url);

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`  ✖ ${msg}`);
};
const pass = (msg) => console.log(`  ✔ ${msg}`);

for (const dir of readdirSync(join(root, "packages"))) {
  const pkgDir = join(root, "packages", dir);
  const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  console.log(`\n${manifest.name}@${manifest.version}`);

  // 1. Files referenced by package.json exist
  for (const [label, rel] of [
    ["main", manifest.main],
    ["types", manifest.types],
    ["exports['.'].import", manifest.exports?.["."]?.import],
    ["exports['.'].types", manifest.exports?.["."]?.types],
  ]) {
    if (!rel) fail(`${label} missing from package.json`);
    else if (!existsSync(join(pkgDir, rel)))
      fail(`${label} → ${rel} does not exist (did you build?)`);
    else pass(`${label} → ${rel}`);
  }
  if (!manifest.files?.includes("dist")) fail(`"files" must include "dist"`);
  if (manifest.type !== "module") fail(`"type" must be "module"`);
  if (!manifest.publishConfig?.access)
    fail(`publishConfig.access missing (scoped packages default to private)`);

  // 2. Resolution via the exports map (as consumers would import it)
  let resolved;
  try {
    resolved = require.resolve(manifest.name);
    pass(`resolves via exports map → ${resolved.replace(root + "/", "")}`);
  } catch (err) {
    fail(`cannot resolve ${manifest.name}: ${err.message}`);
    continue;
  }

  // 3. Named exports match the documented public API
  const mod = await import(pathToFileURL(resolved).href);
  const actual = Object.keys(mod).sort();
  const want = (expected[manifest.name] ?? []).slice().sort();
  const missing = want.filter((k) => !actual.includes(k));
  const extra = actual.filter((k) => !want.includes(k));
  if (missing.length) fail(`missing exports: ${missing.join(", ")}`);
  if (extra.length)
    fail(`undocumented exports (add to scripts/expected-exports.json): ${extra.join(", ")}`);
  if (!missing.length && !extra.length)
    pass(`${actual.length} runtime exports match expected-exports.json`);

  // 4. Declarations mention the same names (types-only exports are checked by tsc at build time)
  const dts = readFileSync(join(pkgDir, manifest.types), "utf8");
  const undeclared = actual.filter((k) => k !== "default" && !dts.includes(k));
  if (undeclared.length) fail(`exports not found in ${manifest.types}: ${undeclared.join(", ")}`);
  else pass(`declarations cover runtime exports`);

  // 5. Bin
  if (manifest.bin) {
    for (const [name, rel] of Object.entries(manifest.bin)) {
      const binPath = join(pkgDir, rel);
      if (!existsSync(binPath)) {
        fail(`bin ${name} → ${rel} missing`);
        continue;
      }
      const first = readFileSync(binPath, "utf8").split("\n")[0];
      if (!first.startsWith("#!/usr/bin/env node")) fail(`bin ${name} lacks a node shebang`);
      const out = execFileSync(process.execPath, [binPath, "--version"], {
        encoding: "utf8",
      }).trim();
      if (out === manifest.version) pass(`bin ${name} --version → ${out}`);
      else fail(`bin ${name} --version printed "${out}", expected ${manifest.version}`);
    }
  }
}

console.log("");
if (failures) {
  console.error(`${failures} export verification failure(s)`);
  process.exit(1);
}
console.log("All package exports verified.");
