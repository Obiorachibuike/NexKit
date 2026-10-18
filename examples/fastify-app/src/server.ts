import { createApp } from "./app.js";
import { env } from "./config/env.js";

const { app, kit } = await createApp();

await app.listen({ port: env.PORT, host: "0.0.0.0" });
kit.logger.info({ port: env.PORT, env: env.NODE_ENV }, "server listening");

async function shutdown(signal: string) {
  kit.logger.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
