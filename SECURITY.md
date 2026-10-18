# Security Policy

## Supported versions

| Version | Supported            |
| ------- | -------------------- |
| 0.x     | ✅ latest minor only |

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private vulnerability reporting on
<https://github.com/Obiorachibuike/NexKit/security/advisories/new>. Include:

- affected package(s) and version(s),
- a description and, if possible, a minimal reproduction,
- the impact you believe it has.

You will receive an acknowledgement within 72 hours and a status update at least every 7 days
until the issue is resolved. We aim to ship fixes for confirmed high-severity issues within 14
days and will credit reporters in the release notes unless they prefer otherwise.

## Security design notes

NexKit is a toolkit, not a security product. The following statements describe what the
packages do and do not provide so you can make informed decisions.

- **No custom cryptography.** NexKit does not implement any cryptographic primitives. Request
  ids use `crypto.randomUUID()` from Node.js. Anything requiring hashing, signing or encryption
  should use `node:crypto` or an audited library.
- **Redaction is best-effort and key-based.** `@nexkitjs/core`'s `redact()` replaces values
  whose _keys_ look sensitive (password, token, authorization, cookie, …) plus any keys you add.
  It cannot recognize secrets embedded in free-form strings unless you supply `valuePatterns`.
  Treat logs as sensitive regardless.
- **Error responses never include internal messages for 5xx errors** unless you explicitly set
  `expose: true` or a `publicMessage`. Stack traces, `meta` and `cause` are never serialized to
  clients. Config validation errors never include raw environment values.
- **Secure headers are defaults, not guarantees.** The preset targets JSON APIs. If you serve
  HTML, audit the Content-Security-Policy. The headers do not replace TLS, authentication, CORS
  policy or input validation.
- **Rate limiting correctness depends on the store.** The in-memory store is explicitly
  single-process. Use a Redis-backed store (or an adapter over an established library) for
  multi-instance deployments. `rateLimit` middleware defaults to _allowing_ requests when the
  store fails (`onStoreError: "allow"`); set `"deny"` if availability of the limiter is a
  security requirement for you.
- **Request ids from clients are validated** (charset and length) before being trusted. Set
  `trustIncomingRequestId: false` if your edge does not sanitize this header.
- **IP-based keys depend on proxy configuration.** `req.ip`/`request.ip` are only meaningful
  when `trust proxy` (Express) / `trustProxy` (Fastify) match your deployment.

## Dependency policy

Runtime packages have no third-party dependencies. Development dependencies are pinned via
`package-lock.json` and updated regularly.

## Release integrity

Packages are published **only** from GitHub Actions (`.github/workflows/publish.yml`) using
npm **trusted publishing (OIDC)** with provenance attestations. No long-lived npm token exists
in the repository or its environments, publishing requires approval in the `npm` GitHub
environment, and each package on npm is configured to require 2FA and disallow token-based
publishing. You can verify a published tarball with `npm audit signatures` or by inspecting the
provenance badge on npmjs.com. See `docs/PUBLISHING.md`.
