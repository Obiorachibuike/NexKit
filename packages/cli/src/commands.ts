import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  bold,
  cyan,
  detectPackageManager,
  dim,
  green,
  installCommand,
  readPackageJson,
  readText,
  red,
  writeGenerated,
  yellow,
  type CliIO,
  type WriteResult,
} from "./io.js";
import {
  DEFAULT_ENV_FIELDS,
  inferEnvFields,
  renderEnvConfig,
  renderEnvExample,
  renderMiddleware,
  requiredPackages,
  type Framework,
} from "./templates.js";

export const HELP = `${"nexkit"} — Build Better Backends With Less Boilerplate.

Usage:
  nexkit init [--framework express|fastify|none] [--dir src] [--force] [--dry-run]
  nexkit doctor
  nexkit generate config [--out src/config/env.ts] [--from .env.example] [--example]
  nexkit generate middleware [--framework express|fastify] [--out src/nexkit.ts] [--no-health] [--no-ratelimit]

Options:
  -h, --help       Show help
  -v, --version    Show version
  --force          Overwrite existing files
  --dry-run        Print what would be written without touching the filesystem

Examples:
  nexkit init --framework express
  nexkit generate config --from .env.example
  nexkit generate middleware --framework fastify --out src/plugins/nexkit.ts
`;

export interface CommandResult {
  exitCode: number;
  files: WriteResult[];
}

function detectFramework(io: CliIO): Framework {
  const pkg = readPackageJson(io.cwd);
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (deps.fastify) return "fastify";
  if (deps.express) return "express";
  return "none";
}

function assertFramework(value: string | undefined, fallback: Framework): Framework {
  if (value === undefined) return fallback;
  if (value === "express" || value === "fastify" || value === "none") return value;
  throw new UsageError(`Unknown framework "${value}". Expected express, fastify or none.`);
}

export class UsageError extends Error {}

/* -------------------------------------------------------------------------- */
/*                                    init                                    */
/* -------------------------------------------------------------------------- */

export function init(io: CliIO, argv: string[]): CommandResult {
  const { values } = parseArgs({
    args: argv,
    options: {
      framework: { type: "string", short: "f" },
      dir: { type: "string", default: "src" },
      force: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  const framework = assertFramework(values.framework, detectFramework(io));
  const dir = values.dir ?? "src";
  const opts = { force: values.force, dryRun: values["dry-run"] };
  const files: WriteResult[] = [];

  io.stdout(bold(io, `Initializing NexKit (${framework === "none" ? "no framework" : framework})`));
  const existingExample = readText(io.cwd, ".env.example");
  const fields = existingExample ? inferEnvFields(existingExample) : DEFAULT_ENV_FIELDS;
  files.push(
    writeGenerated(
      io,
      `${dir}/config/env.ts`,
      renderEnvConfig(fields.length ? fields : DEFAULT_ENV_FIELDS),
      opts,
    ),
  );
  if (!existingExample)
    files.push(writeGenerated(io, ".env.example", renderEnvExample(DEFAULT_ENV_FIELDS), opts));
  if (framework !== "none") {
    files.push(writeGenerated(io, `${dir}/nexkit.ts`, renderMiddleware({ framework }), opts));
  }

  const pm = detectPackageManager(io.cwd);
  io.stdout("");
  io.stdout(bold(io, "Next steps"));
  io.stdout(`  1. Install packages:  ${cyan(io, installCommand(pm, requiredPackages(framework)))}`);
  io.stdout(`  2. Copy ${dim(io, ".env.example")} to ${dim(io, ".env")} and fill in values.`);
  if (framework === "express") {
    io.stdout(
      `  3. In your app:       ${dim(io, "const kit = createNexkit(); kit.before(app); /* routes */ kit.after(app);")}`,
    );
  } else if (framework === "fastify") {
    io.stdout(
      `  3. In your app:       ${dim(io, "const kit = createNexkit(); const app = Fastify({ genReqId: kit.genReqId }); await kit.register(app);")}`,
    );
  }
  io.stdout(`  Run ${cyan(io, "nexkit doctor")} to verify your setup.`);
  return { exitCode: 0, files };
}

/* -------------------------------------------------------------------------- */
/*                                  generate                                  */
/* -------------------------------------------------------------------------- */

export function generate(io: CliIO, argv: string[]): CommandResult {
  const [kind, ...rest] = argv;
  if (kind === "config") return generateConfig(io, rest);
  if (kind === "middleware") return generateMiddleware(io, rest);
  throw new UsageError(`Unknown generator "${kind ?? ""}". Expected "config" or "middleware".`);
}

function generateConfig(io: CliIO, argv: string[]): CommandResult {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: "string", default: "src/config/env.ts" },
      from: { type: "string" },
      example: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const opts = { force: values.force, dryRun: values["dry-run"] };
  let fields = DEFAULT_ENV_FIELDS;
  const source =
    values.from ?? (existsSync(resolve(io.cwd, ".env.example")) ? ".env.example" : undefined);
  if (source) {
    const text = readText(io.cwd, source);
    if (text === undefined) throw new UsageError(`Cannot read "${source}".`);
    const inferred = inferEnvFields(text);
    if (inferred.length) {
      fields = inferred;
      io.stdout(
        dim(
          io,
          `Inferred ${inferred.length} variable${inferred.length === 1 ? "" : "s"} from ${source}`,
        ),
      );
    }
  }
  const files = [
    writeGenerated(io, values.out ?? "src/config/env.ts", renderEnvConfig(fields), opts),
  ];
  if (values.example)
    files.push(writeGenerated(io, ".env.example", renderEnvExample(fields), opts));
  return { exitCode: 0, files };
}

function generateMiddleware(io: CliIO, argv: string[]): CommandResult {
  const { values } = parseArgs({
    args: argv,
    options: {
      framework: { type: "string", short: "f" },
      out: { type: "string" },
      health: { type: "boolean", default: true },
      "no-health": { type: "boolean", default: false },
      ratelimit: { type: "boolean", default: true },
      "no-ratelimit": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const detected = detectFramework(io);
  const framework = assertFramework(values.framework, detected);
  if (framework === "none") {
    throw new UsageError(
      "Could not detect a framework. Pass --framework express or --framework fastify.",
    );
  }
  const health = !values["no-health"];
  const rateLimit = !values["no-ratelimit"];
  const out = values.out ?? "src/nexkit.ts";
  const files = [
    writeGenerated(io, out, renderMiddleware({ framework, health, rateLimit }), {
      force: values.force,
      dryRun: values["dry-run"],
    }),
  ];
  io.stdout(dim(io, `Requires: ${requiredPackages(framework, { health, rateLimit }).join(" ")}`));
  return { exitCode: 0, files };
}

/* -------------------------------------------------------------------------- */
/*                                   doctor                                   */
/* -------------------------------------------------------------------------- */

export interface DoctorCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

const MIN_NODE_MAJOR = 20;

export function runDoctorChecks(io: CliIO, nodeVersion = process.version): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const major = Number(nodeVersion.replace(/^v/, "").split(".")[0]);
  checks.push(
    major >= MIN_NODE_MAJOR
      ? {
          name: "Node.js version",
          status: "pass",
          message: `${nodeVersion} (>= ${MIN_NODE_MAJOR} required)`,
        }
      : {
          name: "Node.js version",
          status: "fail",
          message: `${nodeVersion} is not supported; NexKit requires Node.js >= ${MIN_NODE_MAJOR}`,
        },
  );

  const pkg = readPackageJson(io.cwd);
  if (!pkg) {
    checks.push({
      name: "package.json",
      status: "fail",
      message: "No package.json found in the current directory",
    });
    return checks;
  }
  checks.push({
    name: "package.json",
    status: "pass",
    message: pkg.name ? `found (${pkg.name})` : "found",
  });

  checks.push(
    pkg.type === "module"
      ? { name: "ESM package", status: "pass", message: '"type": "module" is set' }
      : {
          name: "ESM package",
          status: "warn",
          message:
            'NexKit packages are ESM. Set "type": "module" or use dynamic import() / Node >= 20.19 require(esm)',
        },
  );

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const installed = Object.keys(deps).filter((d) => d.startsWith("@nexkitjs/"));
  if (installed.length === 0) {
    checks.push({
      name: "NexKit packages",
      status: "warn",
      message: "No @nexkitjs/* packages in dependencies yet",
    });
  } else {
    const versions = new Set(installed.map((d) => deps[d]));
    checks.push(
      versions.size === 1
        ? {
            name: "NexKit packages",
            status: "pass",
            message: `${installed.length} installed at ${[...versions][0]}`,
          }
        : {
            name: "NexKit packages",
            status: "warn",
            message: `Mixed versions: ${installed.map((d) => `${d}@${deps[d]}`).join(", ")}`,
          },
    );
    for (const adapter of ["express", "fastify"] as const) {
      if (installed.includes(`@nexkitjs/${adapter}`) && !deps[adapter]) {
        checks.push({
          name: `${adapter} peer dependency`,
          status: "fail",
          message: `@nexkitjs/${adapter} requires ${adapter} to be installed`,
        });
      }
    }
  }

  const tsconfig = readText(io.cwd, "tsconfig.json");
  if (tsconfig) {
    const moduleResolution = /"moduleResolution"\s*:\s*"([^"]+)"/i
      .exec(tsconfig)?.[1]
      ?.toLowerCase();
    const ok =
      moduleResolution === undefined ||
      ["node16", "nodenext", "bundler"].includes(moduleResolution);
    checks.push(
      ok
        ? {
            name: "tsconfig moduleResolution",
            status: "pass",
            message: moduleResolution ?? "default",
          }
        : {
            name: "tsconfig moduleResolution",
            status: "warn",
            message: `"${moduleResolution}" cannot read package "exports"; use "node16", "nodenext" or "bundler"`,
          },
    );
  } else {
    checks.push({
      name: "tsconfig.json",
      status: "warn",
      message: "not found (JavaScript project?)",
    });
  }

  const gitignore = readText(io.cwd, ".gitignore");
  if (gitignore !== undefined) {
    const ignoresEnv = gitignore
      .split(/\r?\n/)
      .some((l) => /^\s*\.env(\.\*|\*)?\s*$/.test(l) || /^\s*\*\.env\s*$/.test(l));
    checks.push(
      ignoresEnv
        ? { name: ".env ignored by git", status: "pass", message: ".gitignore contains .env" }
        : {
            name: ".env ignored by git",
            status: "fail",
            message: "Add `.env` to .gitignore to avoid committing secrets",
          },
    );
  } else {
    checks.push({ name: ".gitignore", status: "warn", message: "not found" });
  }

  checks.push(
    existsSync(resolve(io.cwd, ".env.example"))
      ? { name: ".env.example", status: "pass", message: "present" }
      : {
          name: ".env.example",
          status: "warn",
          message: "missing — run `nexkit generate config --example`",
        },
  );

  return checks;
}

export function doctor(io: CliIO): CommandResult {
  const checks = runDoctorChecks(io);
  io.stdout(bold(io, "NexKit doctor"));
  for (const c of checks) {
    const icon =
      c.status === "pass" ? green(io, "✔") : c.status === "warn" ? yellow(io, "⚠") : red(io, "✖");
    io.stdout(`  ${icon} ${c.name.padEnd(28)} ${dim(io, c.message)}`);
  }
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  io.stdout("");
  io.stdout(
    fails
      ? red(
          io,
          `${fails} problem${fails === 1 ? "" : "s"}, ${warns} warning${warns === 1 ? "" : "s"}`,
        )
      : green(io, `All good (${warns} warning${warns === 1 ? "" : "s"})`),
  );
  return { exitCode: fails ? 1 : 0, files: [] };
}
