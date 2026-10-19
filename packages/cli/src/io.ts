import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

export interface CliIO {
  cwd: string;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  /** Disable ANSI colors. */
  noColor?: boolean;
}

export function defaultIO(): CliIO {
  return {
    cwd: process.cwd(),
    stdout: (line) => process.stdout.write(line + "\n"),
    stderr: (line) => process.stderr.write(line + "\n"),
    noColor: Boolean(process.env.NO_COLOR) || !process.stdout.isTTY,
  };
}

export function paint(io: CliIO, code: string, text: string): string {
  return io.noColor ? text : `\u001b[${code}m${text}\u001b[0m`;
}
export const green = (io: CliIO, t: string) => paint(io, "32", t);
export const red = (io: CliIO, t: string) => paint(io, "31", t);
export const yellow = (io: CliIO, t: string) => paint(io, "33", t);
export const dim = (io: CliIO, t: string) => paint(io, "2", t);
export const bold = (io: CliIO, t: string) => paint(io, "1", t);
export const cyan = (io: CliIO, t: string) => paint(io, "36", t);

export interface WriteResult {
  path: string;
  status: "created" | "overwritten" | "skipped" | "dry-run";
}

/** Writes a file unless it exists (and `force` is false). Creates parent directories. */
export function writeGenerated(
  io: CliIO,
  relPath: string,
  content: string,
  options: { force?: boolean; dryRun?: boolean } = {},
): WriteResult {
  const abs = resolve(io.cwd, relPath);
  const exists = existsSync(abs);
  if (exists && !options.force) {
    io.stdout(
      `${yellow(io, "skip")}   ${relPath} ${dim(io, "(exists — use --force to overwrite)")}`,
    );
    return { path: abs, status: "skipped" };
  }
  if (options.dryRun) {
    io.stdout(`${cyan(io, "would write")} ${relPath}`);
    return { path: abs, status: "dry-run" };
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  io.stdout(`${green(io, exists ? "update" : "create")} ${relPath}`);
  return { path: abs, status: exists ? "overwritten" : "created" };
}

export interface PackageJson {
  name?: string;
  type?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  engines?: { node?: string };
  scripts?: Record<string, string>;
}

export function readPackageJson(cwd: string): PackageJson | undefined {
  const p = resolve(cwd, "package.json");
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}

export function readText(cwd: string, relPath: string): string | undefined {
  const p = resolve(cwd, relPath);
  return existsSync(p) ? readFileSync(p, "utf8") : undefined;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(resolve(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(resolve(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(resolve(cwd, "bun.lockb")) || existsSync(resolve(cwd, "bun.lock"))) return "bun";
  return "npm";
}

export function installCommand(pm: PackageManager, packages: string[], dev = false): string {
  const list = packages.join(" ");
  switch (pm) {
    case "pnpm":
      return `pnpm add ${dev ? "-D " : ""}${list}`;
    case "yarn":
      return `yarn add ${dev ? "-D " : ""}${list}`;
    case "bun":
      return `bun add ${dev ? "-d " : ""}${list}`;
    default:
      return `npm install ${dev ? "-D " : ""}${list}`;
  }
}

export function relPath(io: CliIO, abs: string): string {
  return relative(io.cwd, abs) || ".";
}
