# Publishing guide

This document describes how `@nexkitjs/*` packages are versioned and published to npm.

## Package names

| Package               | npm name              |
| --------------------- | --------------------- |
| Core primitives       | `@nexkitjs/core`      |
| Config validation     | `@nexkitjs/config`    |
| Errors                | `@nexkitjs/errors`    |
| Logger                | `@nexkitjs/logger`    |
| Health checks         | `@nexkitjs/health`    |
| API responses         | `@nexkitjs/response`  |
| Rate limiting         | `@nexkitjs/ratelimit` |
| Express adapter       | `@nexkitjs/express`   |
| Fastify adapter       | `@nexkitjs/fastify`   |
| Test utilities        | `@nexkitjs/testing`   |
| CLI (`nexkit` binary) | `@nexkitjs/cli`       |

> **Why `@nexkitjs` and not `@nexkit`?** At the time of writing the unscoped `nexkit` package
> and the `@nexkit` npm scope were already registered by unrelated parties. `@nexkitjs` was
> free and is what the manifests, docs and CLI use. If you own a different scope, do a
> repository-wide replace of `@nexkitjs/` and update `scripts/expected-exports.json`.

All packages share one version number (Changesets "fixed" group), so `@nexkitjs/express@0.3.0`
is guaranteed to work with `@nexkitjs/core@0.3.0`.

## One-time setup

1. Create the `nexkitjs` organization on npm (or claim the scope) and add publishers.
2. Create an **automation** access token and store it as the `NPM_TOKEN` repository secret.
3. Ensure the repository has `id-token: write` permission for workflows (already set in
   `.github/workflows/release.yml`) so npm **provenance** attestations can be generated.
4. Protect `main` and require the CI workflow to pass.

## Day-to-day flow

1. Make your change on a branch and add a changeset:

   ```bash
   npm run changeset
   ```

   Pick the bump type (patch / minor / major). Because the packages are a fixed group you only
   need to select one; all are bumped together.

2. Merge the pull request into `main`.

3. The **Release** workflow (`changesets/action`) opens a _"chore: version packages"_ PR that
   applies pending changesets: bumps `version` fields, updates internal dependency ranges and
   writes `CHANGELOG.md` entries.

4. Merge the version PR. The same workflow runs `npm run release`, which executes
   `npm run build && changeset publish`. Each changed package is published with
   `--access public` and provenance, and git tags (`@nexkitjs/core@x.y.z`) are pushed.

## Publishing manually (fallback)

```bash
npm ci
npm run check            # lint + build + tests + export verification
npm run verify:pack      # pack + install tarballs into a fresh project + run smoke app
npm run version-packages # applies changesets locally
git commit -am "chore: version packages"
npm login                # account with publish rights to @nexkitjs
npm run release
git push --follow-tags
```

## Pre-publish checklist

- `npm run check` passes on Node 20, 22 and 24 (CI matrix).
- `npm run verify:pack` passes — this proves the tarballs contain `dist/`, `README.md`,
  `LICENSE` and that `exports` resolve for consumers.
- `scripts/expected-exports.json` matches the API reference in the docs.
- `CHANGELOG.md` entries read well for users.
- Peer dependency ranges (`express >=4.18 <6`, `fastify >=4 <6`) are still accurate.

## What is included in a tarball

`package.json#files` restricts the contents to:

```
dist/        compiled ESM JavaScript, .d.ts declarations and source maps
README.md
LICENSE
package.json
```

Tests, source `.ts` files and tsconfig files are **not** published. Source maps reference
`../src`, which is fine for debugging via the repository.

## Compatibility promises

- **Node.js**: `engines.node >= 20`. Node 20 is tested until its EOL (April 2026 per the Node
  release schedule); after that the minimum will move to 22 in a minor release with a changeset
  note.
- **Module format**: ESM only. Node ≥ 20.19 / ≥ 22.12 can `require()` these packages directly;
  older CommonJS projects should use dynamic `import()`.
- **SemVer**: while on `0.x`, minor releases may contain breaking changes, always documented in
  the changelog. From `1.0.0` the public API documented in the API reference follows SemVer.

## Deprecating or unpublishing

Prefer `npm deprecate @nexkitjs/<name>@<range> "<message>"` over unpublishing. Unpublishing is
limited by npm policy (72 hours and no dependents) and breaks consumers' lockfiles.
