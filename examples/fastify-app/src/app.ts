import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./config/env.js";
import { createNexkit, type Nexkit, type NexkitOptions } from "./nexkit.js";
import { usersRoutes } from "./routes/users.js";

/** Builds the Fastify instance without listening, so tests can use `inject()`. */
export async function createApp(
  options: NexkitOptions = {},
): Promise<{ app: FastifyInstance; kit: Nexkit }> {
  const kit = createNexkit({ isProduction: env.NODE_ENV === "production", ...options });
  const app = Fastify({ logger: false, genReqId: kit.genReqId, bodyLimit: 1024 * 1024 });

  await kit.register(app);

  // Example readiness check — replace with real dependency pings.
  kit.health.register("memory", () => process.memoryUsage().heapUsed < 512 * 1024 * 1024);

  app.get("/", async () => ({ success: true, data: { name: "nexkit-fastify-example" } }));
  await app.register(usersRoutes, { prefix: "/users" });

  return { app, kit };
}
