# @nexkitjs/health

Liveness and readiness checks with per-check timeouts, criticality, and sanitized reports.

```bash
npm install @nexkitjs/health
```

```ts
import { createHealthRegistry, healthStatusCode } from "@nexkitjs/health";

const health = createHealthRegistry({ defaultTimeoutMs: 3000, info: { version: "1.4.0" } });

health.register("postgres", (signal) => db.ping({ signal })); // critical readiness check
health.register("redis", () => cache.ping(), { critical: false }); // degrades only
health.register("event-loop", eventLoopLagCheck(), { probe: "liveness" });

const report = await health.readiness();
// { status: "ok" | "degraded" | "fail", probe, timestamp, uptime, checks: { postgres: { status, durationMs } } }
healthStatusCode(report); // 200 or 503
```

- Checks may return `void`/`true` (ok), `false` (fail) or `{ status, message?, details? }`.
- Timeouts produce `{ status: "fail", message: "Timed out after 3000ms" }` and abort the signal.
- Thrown error messages are **not** exposed unless `exposeErrorMessages: true`; stacks never are.
- Built-ins: `memoryHeapCheck(maxBytes)`, `eventLoopLagCheck({ warnMs, failMs })`.

The Express and Fastify adapters mount `/health/live` and `/health/ready` for a registry.

## License

MIT
