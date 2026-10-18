/**
 * @nexkitjs/cli — scaffolding and diagnostics for NexKit projects.
 *
 * Exposes the same functionality as the `nexkit` binary for programmatic use
 * (e.g. in tests or custom generators).
 *
 * @packageDocumentation
 */
import { readFileSync } from "node:fs";
import { HELP, UsageError, doctor, generate, init } from "./commands.js";
import { defaultIO, red, type CliIO } from "./io.js";

export { HELP, doctor, generate, init, runDoctorChecks, UsageError } from "./commands.js";
export type { CommandResult, DoctorCheck } from "./commands.js";
export { defaultIO, detectPackageManager, installCommand, writeGenerated } from "./io.js";
export type { CliIO, PackageManager, WriteResult } from "./io.js";
export {
  DEFAULT_ENV_FIELDS,
  inferEnvFields,
  renderEnvConfig,
  renderEnvExample,
  renderMiddleware,
  requiredPackages,
} from "./templates.js";
export type { EnvFieldSpec, Framework, MiddlewareTemplateOptions } from "./templates.js";

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

/**
 * Runs the CLI with the given arguments. Returns the process exit code.
 *
 * @example
 * const code = await run(["generate", "config", "--dry-run"], { cwd, stdout: console.log, stderr: console.error });
 */
export async function run(argv: string[], io: CliIO = defaultIO()): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case undefined:
      case "-h":
      case "--help":
      case "help":
        io.stdout(HELP);
        return 0;
      case "-v":
      case "--version":
      case "version":
        io.stdout(version());
        return 0;
      case "init":
        return init(io, rest).exitCode;
      case "doctor":
        return doctor(io).exitCode;
      case "generate":
      case "g":
        return generate(io, rest).exitCode;
      default:
        io.stderr(red(io, `Unknown command "${command}".`));
        io.stderr(HELP);
        return 2;
    }
  } catch (err) {
    if (err instanceof UsageError || (err instanceof TypeError && err.message.includes("option"))) {
      io.stderr(red(io, err.message));
      io.stderr("");
      io.stderr(HELP);
      return 2;
    }
    io.stderr(red(io, err instanceof Error ? (err.stack ?? err.message) : String(err)));
    return 1;
  }
}
