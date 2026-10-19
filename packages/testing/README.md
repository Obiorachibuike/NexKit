# @nexkitjs/testing

Test helpers for applications built with NexKit. Works with Vitest, Jest, `node:test`, etc.

```bash
npm install -D @nexkitjs/testing
```

```ts
import {
  createTestLogger,
  withEnv,
  expectAppError,
  rejected,
  createTestRateLimiter,
} from "@nexkitjs/testing";

const logs = createTestLogger();
const app = createApp({ logger: logs.logger });
// ...
expect(logs.at("error")).toHaveLength(1);
expect(logs.contains("hunter2")).toBe(false); // assert nothing leaked

await withEnv({ DATABASE_URL: undefined }, async () => {
  expectAppError(await rejected(() => import("./env.js")), { code: "CONFIG_INVALID" });
});

const { limiter, clock } = createTestRateLimiter({ limit: 10, windowMs: 60_000 });
clock.advance(60_001);
```

Also: `runInTestContext(fn, ctx)`, `createManualClock()`, `healthCheckStub({ status, delayMs, throws })`.

## License

MIT
