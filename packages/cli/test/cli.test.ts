import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ENV_FIELDS,
  inferEnvFields,
  renderEnvConfig,
  renderEnvExample,
  renderMiddleware,
  requiredPackages,
  run,
  runDoctorChecks,
  type CliIO,
} from "../src/index.js";

const repoRoot = resolve(__dirname, "../../..");

function makeIO(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIO = { cwd, stdout: (l) => out.push(l), stderr: (l) => err.push(l), noColor: true };
  return { io, out, err, text: () => out.join("\n"), errText: () => err.join("\n") };
}

const temps: string[] = [];
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "nexkit-cli-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("templates", () => {
  it("example apps contain exactly what the CLI generates (kept in sync)", () => {
    for (const framework of ["express", "fastify"] as const) {
      const dir = join(repoRoot, "examples", `${framework}-app`);
      expect(readFileSync(join(dir, "src/nexkit.ts"), "utf8")).toBe(
        renderMiddleware({ framework }),
      );
      expect(readFileSync(join(dir, "src/config/env.ts"), "utf8")).toBe(
        renderEnvConfig(DEFAULT_ENV_FIELDS),
      );
      expect(readFileSync(join(dir, ".env.example"), "utf8")).toBe(
        renderEnvExample(DEFAULT_ENV_FIELDS),
      );
    }
  });

  it("renders env config with all field kinds", () => {
    const src = renderEnvConfig([
      { key: "PORT", type: "port", default: 8080 },
      { key: "TAGS", type: "list", default: ["a", "b"] },
      { key: "MODE", type: "enum", values: ["x", "y"], optional: true, description: "Mode" },
      { key: "FLAG", type: "boolean", default: false },
    ]);
    expect(src).toContain('PORT: { type: "port", default: 8080 }');
    expect(src).toContain('TAGS: { type: "list", default: ["a", "b"] }');
    expect(src).toContain(
      'MODE: { type: "enum", values: ["x", "y"], optional: true, description: "Mode" }',
    );
    expect(src).toContain('FLAG: { type: "boolean", default: false }');
    expect(src).toContain("export const env: Env = validateEnv(envSchema);");
  });

  it("renders .env.example without secrets", () => {
    const text = renderEnvExample([
      { key: "API_KEY", type: "string" },
      { key: "PORT", type: "port", default: 3000 },
    ]);
    expect(text).toContain("API_KEY=<secret>");
    expect(text).toContain("# PORT=3000");
  });

  it("lists required packages per variant", () => {
    expect(requiredPackages("none")).toEqual(["@nexkitjs/config", "@nexkitjs/logger"]);
    expect(requiredPackages("express")).toContain("@nexkitjs/express");
    expect(requiredPackages("fastify", { health: false, rateLimit: false })).toEqual([
      "@nexkitjs/config",
      "@nexkitjs/logger",
      "@nexkitjs/fastify",
    ]);
  });

  it("every middleware variant type-checks against the real packages", () => {
    // Inside the repo so `express`/`fastify` types resolve from node_modules.
    mkdirSync(join(repoRoot, ".tmp"), { recursive: true });
    const dir = mkdtempSync(join(repoRoot, ".tmp", "cli-typecheck-"));
    temps.push(dir);
    const files: string[] = [];
    for (const framework of ["express", "fastify"] as const) {
      for (const health of [true, false]) {
        for (const rateLimit of [true, false]) {
          const file = join(dir, `${framework}-${health}-${rateLimit}.ts`);
          writeFileSync(file, renderMiddleware({ framework, health, rateLimit }));
          files.push(file);
        }
      }
    }
    const envFile = join(dir, "env.ts");
    writeFileSync(
      envFile,
      renderEnvConfig(inferEnvFields("PORT=1\nDATABASE_URL=postgres://x\nDEBUG=true\nNAMES=a,b\n")),
    );
    files.push(envFile);

    const pkg = (name: string) => [join(repoRoot, "packages", name, "src/index.ts")];
    const program = ts.createProgram(files, {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      baseUrl: repoRoot,
      typeRoots: [join(repoRoot, "node_modules/@types")],
      types: ["node"],
      paths: {
        "@nexkitjs/config": pkg("config"),
        "@nexkitjs/core": pkg("core"),
        "@nexkitjs/errors": pkg("errors"),
        "@nexkitjs/express": pkg("express"),
        "@nexkitjs/fastify": pkg("fastify"),
        "@nexkitjs/health": pkg("health"),
        "@nexkitjs/logger": pkg("logger"),
        "@nexkitjs/ratelimit": pkg("ratelimit"),
        "@nexkitjs/response": pkg("response"),
      },
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file && files.includes(d.file.fileName))
      .map((d) => `${d.file?.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
    expect(diagnostics).toEqual([]);
  }, 60_000);
});

describe("inferEnvFields", () => {
  it("round-trips NexKit's own .env.example losslessly", () => {
    expect(inferEnvFields(renderEnvExample(DEFAULT_ENV_FIELDS))).toEqual(DEFAULT_ENV_FIELDS);
    const custom = [
      { key: "TAGS", type: "list" as const, default: ["a", "b"], description: "Tags" },
      { key: "MODE", type: "enum" as const, values: ["x", "y"], optional: true },
      { key: "API_KEY", type: "string" as const },
    ];
    expect(inferEnvFields(renderEnvExample(custom))).toEqual(custom);
  });

  it("guesses types, defaults and secrets from dotenv content", () => {
    const fields = inferEnvFields(`
# HTTP port
PORT=8080
DATABASE_URL="postgres://u:p@h/db"
JWT_SECRET=changeme
ENABLE_CACHE=true
WORKERS=4 # inline comment
NODE_ENV=production
LOG_LEVEL=debug
ORIGINS=a.com,b.com
API_TOKEN=
export NAME='svc'
# OPTIONAL_THING=hello
`);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.PORT).toEqual({
      key: "PORT",
      type: "port",
      default: 8080,
      description: "HTTP port",
    });
    expect(byKey.DATABASE_URL).toEqual({ key: "DATABASE_URL", type: "url" });
    expect(byKey.JWT_SECRET).toEqual({ key: "JWT_SECRET", type: "string" });
    expect(byKey.ENABLE_CACHE).toEqual({ key: "ENABLE_CACHE", type: "boolean", default: true });
    expect(byKey.WORKERS).toEqual({ key: "WORKERS", type: "number", default: 4 });
    expect(byKey.NODE_ENV).toMatchObject({ type: "enum", default: "production" });
    expect(byKey.LOG_LEVEL).toMatchObject({ type: "enum", default: "debug" });
    expect(byKey.ORIGINS).toEqual({ key: "ORIGINS", type: "list", default: ["a.com", "b.com"] });
    expect(byKey.API_TOKEN).toEqual({ key: "API_TOKEN", type: "string" });
    expect(byKey.NAME).toEqual({ key: "NAME", type: "string", default: "svc" });
    expect(byKey.OPTIONAL_THING).toMatchObject({ type: "string", optional: true });
    expect(JSON.stringify(fields)).not.toContain("changeme");
  });
});

describe("run()", () => {
  it("prints help and version, and rejects unknown commands", async () => {
    const h = makeIO(tmp());
    expect(await run([], h.io)).toBe(0);
    expect(h.text()).toContain("nexkit init");
    const v = makeIO(tmp());
    expect(await run(["--version"], v.io)).toBe(0);
    expect(v.text()).toMatch(/^\d+\.\d+\.\d+/);
    const u = makeIO(tmp());
    expect(await run(["frobnicate"], u.io)).toBe(2);
    expect(u.errText()).toContain('Unknown command "frobnicate"');
  });

  it("init scaffolds files, detects the framework, skips existing files and honours --force", async () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "x", type: "module", dependencies: { fastify: "^5" } }),
    );
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    const first = makeIO(dir);
    expect(await run(["init"], first.io)).toBe(0);
    expect(first.text()).toContain("Initializing NexKit (fastify)");
    expect(first.text()).toContain("pnpm add @nexkitjs/config");
    expect(readFileSync(join(dir, "src/nexkit.ts"), "utf8")).toBe(
      renderMiddleware({ framework: "fastify" }),
    );
    expect(existsSync(join(dir, "src/config/env.ts"))).toBe(true);
    expect(existsSync(join(dir, ".env.example"))).toBe(true);

    writeFileSync(join(dir, "src/nexkit.ts"), "// customized");
    const second = makeIO(dir);
    expect(await run(["init", "--framework", "fastify"], second.io)).toBe(0);
    expect(second.text()).toContain("skip   src/nexkit.ts");
    expect(readFileSync(join(dir, "src/nexkit.ts"), "utf8")).toBe("// customized");

    const third = makeIO(dir);
    expect(await run(["init", "--framework", "express", "--force"], third.io)).toBe(0);
    expect(readFileSync(join(dir, "src/nexkit.ts"), "utf8")).toBe(
      renderMiddleware({ framework: "express" }),
    );
  });

  it("init with --dry-run writes nothing and with no framework skips middleware", async () => {
    const dir = tmp();
    const io = makeIO(dir);
    expect(await run(["init", "--dry-run", "--framework", "none"], io.io)).toBe(0);
    expect(io.text()).toContain("would write src/config/env.ts");
    expect(io.text()).not.toContain("nexkit.ts");
    expect(existsSync(join(dir, "src"))).toBe(false);
  });

  it("generate config infers from .env.example and can emit an example", async () => {
    const dir = tmp();
    writeFileSync(join(dir, ".env.example"), "PORT=4000\nREDIS_URL=redis://x\n");
    const io = makeIO(dir);
    expect(
      await run(["generate", "config", "--out", "env.ts", "--example", "--force"], io.io),
    ).toBe(0);
    const src = readFileSync(join(dir, "env.ts"), "utf8");
    expect(src).toContain('PORT: { type: "port", default: 4000 }');
    expect(src).toContain('REDIS_URL: { type: "url" }');
    expect(readFileSync(join(dir, ".env.example"), "utf8")).toContain("REDIS_URL=<secret>");
    expect(io.text()).toContain("Inferred 2 variables");

    const missing = makeIO(dir);
    expect(await run(["generate", "config", "--from", "nope.env"], missing.io)).toBe(2);
    expect(missing.errText()).toContain('Cannot read "nope.env"');
  });

  it("generate middleware supports variants and errors without a framework", async () => {
    const dir = tmp();
    const io = makeIO(dir);
    expect(
      await run(
        ["generate", "middleware", "-f", "express", "--no-health", "--out", "mw.ts"],
        io.io,
      ),
    ).toBe(0);
    const src = readFileSync(join(dir, "mw.ts"), "utf8");
    expect(src).not.toContain("healthRoutes");
    expect(src).toContain("rateLimit(");
    expect(io.text()).toContain(
      "Requires: @nexkitjs/config @nexkitjs/logger @nexkitjs/express @nexkitjs/ratelimit",
    );

    const none = makeIO(dir);
    expect(await run(["generate", "middleware"], none.io)).toBe(2);
    expect(none.errText()).toContain("Could not detect a framework");

    const bogus = makeIO(dir);
    expect(await run(["generate", "bogus"], bogus.io)).toBe(2);
    expect(await run(["generate", "middleware", "--framework", "koa"], makeIO(dir).io)).toBe(2);
    expect(await run(["generate", "config", "--unknown-flag"], makeIO(dir).io)).toBe(2);
  });

  it("doctor reports passes, warnings and failures with the right exit code", async () => {
    const dir = tmp();
    const bad = makeIO(dir);
    expect(await run(["doctor"], bad.io)).toBe(1);
    expect(bad.text()).toContain("No package.json");

    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "x",
        type: "commonjs",
        dependencies: { "@nexkitjs/express": "0.1.0", "@nexkitjs/core": "0.2.0" },
      }),
    );
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { moduleResolution: "node" } }),
    );
    writeFileSync(join(dir, ".gitignore"), "node_modules\n");
    const checks = runDoctorChecks(bad.io, "v18.0.0");
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
    expect(byName["Node.js version"]?.status).toBe("fail");
    expect(byName["ESM package"]?.status).toBe("warn");
    expect(byName["NexKit packages"]?.message).toContain("Mixed versions");
    expect(byName["express peer dependency"]?.status).toBe("fail");
    expect(byName["tsconfig moduleResolution"]?.status).toBe("warn");
    expect(byName[".env ignored by git"]?.status).toBe("fail");
    expect(byName[".env.example"]?.status).toBe("warn");

    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "x",
        type: "module",
        dependencies: { express: "^5", "@nexkitjs/express": "0.1.0", "@nexkitjs/core": "0.1.0" },
      }),
    );
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { moduleResolution: "NodeNext" } }),
    );
    writeFileSync(join(dir, ".gitignore"), "node_modules\n.env\n");
    writeFileSync(join(dir, ".env.example"), "");
    const good = makeIO(dir);
    expect(await run(["doctor"], good.io)).toBe(0);
    expect(good.text()).toContain("All good (0 warnings)");
  });
});
