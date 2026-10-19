# Publishing guide

How `@nexkitjs/*` packages are versioned and published to npm. Publishing uses **npm
trusted publishing (OpenID Connect)** from GitHub Actions: there is **no npm token** stored
in this repository, and none should ever be added.

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

> **Why `@nexkitjs` and not `@nexkit`?** The unscoped `nexkit` package and the `@nexkit` scope
> were already registered by unrelated parties. `@nexkitjs` was free. If you fork under another
> scope, replace `@nexkitjs/` across the repository and update `scripts/expected-exports.json`.

All packages share one version number (Changesets "fixed" group), so
`@nexkitjs/express@0.3.0` is guaranteed to work with `@nexkitjs/core@0.3.0`.

## How a release flows

```
changeset in PR ──► merge to main ──► "chore: version packages" PR (release.yml)
      ──► merge it ──► GitHub Release tagged v<version> ──► publish.yml (OIDC) ──► npm
```

| Workflow                        | Trigger                      | Does                                                                                                                                                                              |
| ------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release.yml` | push to `main`               | Opens/updates the version PR from pending changesets. Never publishes.                                                                                                            |
| `.github/workflows/publish.yml` | GitHub Release **published** | Verifies tag = every `package.json` version, builds, tests, publishes all packages in dependency order via trusted publishing. Runs in the `npm` environment (approval required). |

`publish.yml` **skips any package whose version already exists on npm** and reports it as a
no-op. Re-running a release is therefore safe, but it is _not_ a new publication — to validate
the OIDC setup you must publish a version that does not exist yet.

---

## One-time setup

### 1. Bootstrap the packages on npm (first version only)

npm only lets you configure a trusted publisher on a package that **already exists**. The very
first version of each of the 11 packages therefore has to be published once from a maintainer's
machine, with 2FA:

```bash
npm ci && npm run check && npm run verify:pack
npm login                     # account that owns the @nexkitjs scope
node scripts/publish-packages.mjs   # publishes all 11 in dependency order; skips existing versions
```

(`DRY_RUN=true node scripts/publish-packages.mjs` to rehearse.) Afterwards, tag the commit
`v0.1.0` for the record — publishing `v0.1.0` again from CI will be a no-op, which is expected.

### 2. Create the GitHub environment `npm`

The publish job runs inside a GitHub **environment named `npm`** that:

- requires approval from a reviewer (the repository owner by default), and
- only allows deployments from tags matching `v*`.

Run the helper (needs `gh` authenticated as a repository admin):

```bash
scripts/setup-npm-environment.sh            # REPO=owner/name REVIEWER_LOGIN=someone to override
```

Or in the UI: **Settings → Environments → New environment → `npm`** → tick _Required
reviewers_ and add yourself → _Deployment branches and tags_ → _Selected branches and tags_ →
_Add deployment branch or tag rule_ → **Tag**, pattern `v*`.

Do **not** add an `NPM_TOKEN` secret to the environment or the repository.

### 3. Configure trusted publishing on npm (per package)

For **each** of the 11 packages: npmjs.com → package → **Settings** → _Trusted Publisher_ →
**GitHub Actions**, then enter exactly:

| Field             | Value              |
| ----------------- | ------------------ |
| GitHub owner      | `Obiorachibuike`   |
| Repository        | `NexKit`           |
| Workflow filename | `publish.yml`      |
| Environment       | `npm`              |
| Allowed action    | Direct npm publish |

The values must match the workflow's run context byte for byte (the repository name is the
GitHub repository that runs the workflow — `NexKit`; the filename is the file under
`.github/workflows/` without a path). While there, set _Publishing access_ to **Require
two-factor authentication and disallow tokens** so OIDC is the only way to publish.

Trusted publishing works for public repositories on GitHub-hosted runners, needs npm CLI
**≥ 11.5.1** (the workflow upgrades npm), and generates provenance attestations automatically.

---

## Releasing a version

1. Every user-facing PR adds a changeset:

   ```bash
   npm run changeset        # choose patch / minor / major; all packages bump together
   ```

2. Merge to `main`. The **Version packages** workflow opens/updates a PR titled
   _chore: version packages_ that bumps every `package.json`, rewrites internal dependency
   ranges and updates `CHANGELOG.md`.

3. Review and **merge the version PR**. Note the new version, e.g. `0.1.1`.

4. **Publish a GitHub Release** whose tag is exactly `v<version>` on the merge commit:

   ```bash
   gh release create v0.1.1 --target main --title "v0.1.1" --generate-notes
   ```

   (Or _Releases → Draft a new release → Choose a tag → create `v0.1.1`_. The tag must start
   with `v` and match the versions in `packages/*/package.json`; a mismatch fails the `verify`
   job before anything is published.)

5. The **Publish to npm** workflow starts. The `publish` job pauses in the `npm` environment
   until a required reviewer approves it (**Actions → run → Review deployments → npm →
   Approve**). After approval the packages are published; the run summary lists each package
   as _published_ or _skipped (already published)_.

6. Check the result: `npm view @nexkitjs/core version` and the _Provenance_ badge on the
   package page.

### Validating OIDC after a local bootstrap

If `0.1.0` was published locally in step 1, the first CI publication must be a **new** version
such as `0.1.1`: add a changeset (patch), merge the version PR, release `v0.1.1`. Releasing
`v0.1.0` would only exercise the no-op path.

### Dry run

_Actions → Publish to npm → Run workflow_ from a `v*` tag with **dry_run = true** performs the
verification, build, tests and `npm publish --dry-run` without touching the registry. The job
still requires environment approval.

---

## Recovery and troubleshooting

| Symptom                                                        | Cause / fix                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify` fails: _Release tag vX does not match the repository_ | The version PR was not merged, or the tag points at the wrong commit. Delete the release and tag (`gh release delete vX --cleanup-tag`), merge the version PR, recreate the release on the merge commit.                                                                                  |
| `ENEEDAUTH` / `E401` / `E404` during publish                   | Trusted-publisher fields do not match (owner, repo `NexKit`, `publish.yml`, environment `npm`), the package has not been bootstrapped, or the job did not run in the `npm` environment. Fix the npm settings and re-run the job (_Re-run failed jobs_).                                   |
| `E403` _cannot publish over previously published version_      | Should not happen — the script skips existing versions. If it does, the registry has that version; bump and release again.                                                                                                                                                                |
| Publish succeeded for some packages, then failed               | The script stops at the first failure. Fix the cause and **re-run the same job**: already-published packages are skipped, the rest are published. Dependents are always published after their dependencies, so the registry is never left with a dependent pointing at a missing version. |
| Wrong tag name (`0.1.1` instead of `v0.1.1`)                   | `publish.yml` does not trigger on non-`v` tags. Delete the release/tag and recreate it with the `v` prefix.                                                                                                                                                                               |
| Need to publish from a different workflow file / environment   | Update the trusted-publisher settings on **all 11 packages** to the new filename/environment before the next release; mismatches fail with `E404`/`E401`.                                                                                                                                 |
| Lost access to npm, or a maintainer leaves                     | Trusted publishing is tied to the repository, not a person. Rotate nothing; just keep the `nexkitjs` org membership current and the `npm` environment's reviewers up to date.                                                                                                             |
| Emergency manual publish                                       | A maintainer with 2FA can run `node scripts/publish-packages.mjs` locally. If _disallow tokens_ is enabled, temporarily allow it in the package settings, publish, then re-enable. Record what was done in the release notes.                                                             |
| Published something broken                                     | Do not unpublish. Publish a fixed patch and run `npm deprecate @nexkitjs/<name>@<bad-version> "use >= <fixed>"` for each affected package.                                                                                                                                                |

## Pre-release checklist

- `npm run check` passes on Node 20, 22 and 24 (CI matrix).
- `npm run verify:pack` passes — tarballs contain `dist/`, `README.md`, `LICENSE`; `exports` resolve for consumers.
- `scripts/expected-exports.json` and the generated API reference are up to date.
- `CHANGELOG.md` entries read well for users.
- Peer ranges (`express >=4.18 <6`, `fastify >=4 <6`) are still accurate.

## What is in a tarball

```
dist/         compiled ESM JavaScript, .d.ts declarations and source maps
README.md
LICENSE
package.json  type: module, exports map, engines, publishConfig.access: public
```

Tests, source `.ts` files and tsconfig files are not published.

## Compatibility promises

- **Node.js**: `engines.node >= 20`. The minimum moves only in a minor release with a changelog note, after the version's end-of-life.
- **Module format**: ESM only. Node ≥ 20.19 / ≥ 22.12 can `require()` these packages; older CommonJS projects should use dynamic `import()`.
- **SemVer**: on `0.x`, minor releases may contain breaking changes, always documented. From `1.0.0` the public API follows SemVer.
