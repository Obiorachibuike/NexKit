# Contributing to NexKit

Thanks for your interest in NexKit! This guide explains how the repository is organized and
how to get a change merged.

## Prerequisites

- Node.js **20 or newer** (the repo is tested on 20, 22 and 24 — see `.nvmrc`).
- npm 10+ (workspaces are used; no other package manager is required).

## Getting started

```bash
git clone https://github.com/Obiorachibuike/NexKit.git
cd NexKit
npm install
npm run build          # builds every package in dependency order (tsc -b)
npm test               # runs every Vitest project (packages + example apps)
```

Useful commands:

| Command                  | What it does                                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| `npm run build`          | Type-checks and emits `dist/` for every package (project references).       |
| `npm test`               | All tests. Package tests import sibling packages from **source**.           |
| `npm run test:examples`  | Example apps only — these consume the **built** packages via `exports`.     |
| `npm run verify:exports` | Checks published entry points, declarations and the documented export list. |
| `npm run verify:pack`    | `npm pack`s every package and installs the tarballs into a fresh project.   |
| `npm run lint`           | ESLint (type-aware).                                                        |
| `npm run format`         | Prettier.                                                                   |
| `npm run check`          | lint + build + test + verify:exports (what CI runs).                        |
| `npm run build:docs`     | Builds the documentation website (`apps/docs`).                             |

## Repository layout

```
packages/        publishable @nexkitjs/* packages
  core/          framework-agnostic primitives (redaction, request context, headers…)
  errors/        AppError, HTTP error classes, normalizeError, serialization
  config/        validateEnv and friends
  logger/        structured logger + transports
  health/        health-check registry
  response/      API envelopes + pagination
  ratelimit/     rate-limiter contracts and adapters
  express/       Express middleware
  fastify/       Fastify plugin
  testing/       test helpers
  cli/           `nexkit` binary
examples/        runnable Express and Fastify apps (also integration tests)
apps/docs/       Next.js documentation site
scripts/         build/verification scripts
```

Dependency direction is strictly **core → errors → everything else → adapters**. The core
package must never import a web framework.

## Making changes

1. Create a branch from `main`.
2. Write code **and tests**. Every package has a `test/` folder; adapters have integration
   tests that spin up real servers.
3. If you touch a CLI template, regenerate the example apps so they stay in sync:
   ```bash
   npm run build
   (cd examples/express-app && node ../../packages/cli/dist/bin.js init --framework express --force)
   (cd examples/fastify-app && node ../../packages/cli/dist/bin.js init --framework fastify --force)
   ```
   A CLI test asserts the example files equal the template output.
4. If you add or remove a public export, update `scripts/expected-exports.json`
   (`npm run verify:exports` tells you exactly what changed) and regenerate the API reference
   page (`npm run build:api --workspace apps/docs` rewrites
   `apps/docs/content/docs/api-reference.mdx` from the sources; it also runs on every docs build).
5. Add a changeset: `npm run changeset` (choose the bump; all packages are versioned together).
   Releases are cut by merging the generated version PR and publishing a GitHub Release tagged
   `v<version>` — see `docs/PUBLISHING.md`.
6. Run `npm run check` locally.
7. Open a pull request. CI runs lint, build, tests on three Node versions, export verification
   and the pack smoke test.

## Coding guidelines

- TypeScript `strict` with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- ESM only; relative imports use explicit `.js` extensions.
- No new runtime dependencies without a clear justification in the PR description. The
  packages currently have **zero** third-party runtime dependencies by design.
- Never log or throw raw secret values. Error messages that could contain user data must go
  through redaction or be marked non-exposed.
- Public APIs need JSDoc comments; they feed the generated declarations and the docs.

## Reporting bugs and requesting features

Use GitHub issues. For security problems, follow [SECURITY.md](./SECURITY.md) instead of
opening a public issue.

## Code of conduct

Be kind and constructive. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
