import type { ComponentType } from "react";

/** Maps a docs slug to its MDX module. Keep in sync with `src/lib/nav.ts`. */
export const registry: Record<string, () => Promise<{ default: ComponentType }>> = {
  introduction: () => import("./docs/introduction.mdx"),
  installation: () => import("./docs/installation.mdx"),
  "quick-start": () => import("./docs/quick-start.mdx"),
  modules: () => import("./docs/modules.mdx"),
  configuration: () => import("./docs/configuration.mdx"),
  errors: () => import("./docs/errors.mdx"),
  logging: () => import("./docs/logging.mdx"),
  "request-utilities": () => import("./docs/request-utilities.mdx"),
  security: () => import("./docs/security.mdx"),
  "health-checks": () => import("./docs/health-checks.mdx"),
  responses: () => import("./docs/responses.mdx"),
  "rate-limiting": () => import("./docs/rate-limiting.mdx"),
  express: () => import("./docs/express.mdx"),
  fastify: () => import("./docs/fastify.mdx"),
  typescript: () => import("./docs/typescript.mdx"),
  cli: () => import("./docs/cli.mdx"),
  testing: () => import("./docs/testing.mdx"),
  migration: () => import("./docs/migration.mdx"),
  deployment: () => import("./docs/deployment.mdx"),
  publishing: () => import("./docs/publishing.mdx"),
  faq: () => import("./docs/faq.mdx"),
  "api-reference": () => import("./docs/api-reference.mdx"),
  roadmap: () => import("./docs/roadmap.mdx"),
  contributing: () => import("./docs/contributing.mdx"),
};
