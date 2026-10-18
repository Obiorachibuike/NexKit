import express, { type Express } from "express";
import { env } from "./config/env.js";
import { createNexkit, type Nexkit, type NexkitOptions } from "./nexkit.js";
import { usersRouter } from "./routes/users.js";

/**
 * Builds the Express app. Kept separate from `server.ts` so tests can create
 * an app without binding a port.
 */
export function createApp(options: NexkitOptions = {}): { app: Express; kit: Nexkit } {
  const kit = createNexkit({ isProduction: env.NODE_ENV === "production", ...options });
  const app = express();

  kit.before(app);
  app.use(express.json({ limit: "1mb" }));

  // Example readiness check — replace with real dependency pings.
  kit.health.register("memory", () => process.memoryUsage().heapUsed < 512 * 1024 * 1024);

  app.get("/", (_req, res) =>
    res.json({ success: true, data: { name: "nexkit-express-example" } }),
  );
  app.use("/users", usersRouter);

  kit.after(app);
  return { app, kit };
}
