# @nexkitjs/fastify

Fastify plugin for NexKit. Peer dependency: `fastify >=4 <6` (Fastify 5 recommended).

```bash
npm install @nexkitjs/fastify @nexkitjs/logger @nexkitjs/health @nexkitjs/ratelimit fastify
```

```ts
import Fastify from "fastify";
import { createLogger } from "@nexkitjs/logger";
import { createHealthRegistry } from "@nexkitjs/health";
import { nexkit, requestIdGenerator, validateRequest, getValidated } from "@nexkitjs/fastify";

const logger = createLogger({ name: "api" });
const health = createHealthRegistry();
const app = Fastify({ genReqId: requestIdGenerator(), bodyLimit: 1024 * 1024 });

await app.register(nexkit, {
  logger,
  health, // mounts /health/live and /health/ready
  rateLimit: { limiter }, // optional
  secureHeaders: { strictTransportSecurity: process.env.NODE_ENV === "production" ? {} : false },
  requestContext: { ignore: ["/health/live", "/health/ready"] },
});

app.post("/users", { preHandler: validateRequest({ body: CreateUser }) }, async (req, reply) => {
  const { body } = getValidated<z.infer<typeof CreateUser>>(req);
  return reply.code(201).send(ok(body));
});
```

The plugin is registered without encapsulation, so hooks, the error handler and the 404 handler
apply to the whole instance. Each feature can be disabled (`requestContext: false`,
`secureHeaders: false`, `errorHandler: false`, `notFoundHandler: false`).

Also exported: `rateLimitHook(options)` to limit individual routes, and `requestIdGenerator()`
for the Fastify factory's `genReqId`.

Fastify's native JSON-schema validation errors are normalized to NexKit `ValidationError`
responses (422); `bodyLimit` violations become 413.

## License

MIT
