import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const pkg = (name: string) => `${root}packages/${name}/src/index.ts`;

/** Package tests import sibling packages from *source* for a fast feedback loop. */
const sourceAliases = {
  "@nexkitjs/core": pkg("core"),
  "@nexkitjs/config": pkg("config"),
  "@nexkitjs/errors": pkg("errors"),
  "@nexkitjs/logger": pkg("logger"),
  "@nexkitjs/health": pkg("health"),
  "@nexkitjs/response": pkg("response"),
  "@nexkitjs/ratelimit": pkg("ratelimit"),
  "@nexkitjs/express": pkg("express"),
  "@nexkitjs/fastify": pkg("fastify"),
  "@nexkitjs/testing": pkg("testing"),
  "@nexkitjs/cli": pkg("cli"),
};

const packageNames = [
  "core",
  "config",
  "errors",
  "logger",
  "health",
  "response",
  "ratelimit",
  "express",
  "fastify",
  "testing",
  "cli",
];

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/cli/src/bin.ts"],
      reporter: ["text", "lcov"],
    },
    projects: [
      ...packageNames.map((name) => ({
        test: {
          name,
          root: `${root}packages/${name}`,
          include: ["test/**/*.test.ts"],
          environment: "node",
        },
        resolve: { alias: sourceAliases },
      })),
      // Example apps intentionally resolve @nexkitjs/* through node_modules → built `dist`,
      // so they verify the real package exports. Run `npm run build` first.
      {
        test: {
          name: "express-example",
          root: `${root}examples/express-app`,
          include: ["test/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "fastify-example",
          root: `${root}examples/fastify-app`,
          include: ["test/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
