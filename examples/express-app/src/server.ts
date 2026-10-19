import { createApp } from "./app.js";
import { env } from "./config/env.js";

const { app, kit } = createApp();

const server = app.listen(env.PORT, () => {
  kit.logger.info({ port: env.PORT, env: env.NODE_ENV }, "server listening");
});

function shutdown(signal: string) {
  kit.logger.info({ signal }, "shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
