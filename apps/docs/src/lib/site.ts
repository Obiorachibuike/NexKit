export const site = {
  name: "NexKit",
  tagline: "Build Better Backends With Less Boilerplate.",
  description:
    "NexKit is a modular backend toolkit for Node.js and TypeScript: configuration validation, standardized errors, structured logging, health checks, secure headers, response envelopes and rate-limit integration — with first-class Express and Fastify adapters.",
  repo: "https://github.com/Obiorachibuike/NexKit",
  npmScope: "@nexkitjs",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://obiorachibuike.github.io/NexKit",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  version: "0.1.0",
};

/** Prefixes a public asset path with the configured basePath (for static hosting under a sub-path). */
export function asset(path: string): string {
  return `${site.basePath}${path}`;
}
