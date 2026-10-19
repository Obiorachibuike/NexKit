export interface NavPage {
  slug: string;
  title: string;
  description: string;
}

export interface NavGroup {
  title: string;
  pages: NavPage[];
}

/**
 * Single source of truth for the documentation navigation, static params,
 * metadata and the search index. Every entry needs a matching
 * `content/docs/<slug>.mdx` file registered in `content/registry.ts`.
 */
export const navigation: NavGroup[] = [
  {
    title: "Getting started",
    pages: [
      {
        slug: "introduction",
        title: "Introduction",
        description: "What NexKit is, what it is not, and how it fits your stack.",
      },
      {
        slug: "installation",
        title: "Installation",
        description: "Install only the modules you need. Requirements and package manager notes.",
      },
      {
        slug: "quick-start",
        title: "Quick start",
        description: "A production-shaped Express or Fastify service in five minutes.",
      },
      {
        slug: "modules",
        title: "Module directory",
        description: "Every @nexkitjs package, what it does and when to use it.",
      },
    ],
  },
  {
    title: "Core modules",
    pages: [
      {
        slug: "configuration",
        title: "Configuration",
        description:
          "Validate environment variables with validateEnv: types, defaults, secrets and errors.",
      },
      {
        slug: "errors",
        title: "Error handling",
        description:
          "AppError, error codes, HTTP mapping, public vs internal messages and serialization.",
      },
      {
        slug: "logging",
        title: "Logging",
        description:
          "Structured JSON logs with levels, child loggers, redaction and request correlation.",
      },
      {
        slug: "request-utilities",
        title: "Request utilities",
        description: "Request ids, correlation ids, timing and structured request logging.",
      },
      {
        slug: "security",
        title: "Security",
        description:
          "Secure headers, input validation, request size limits, redaction and what NexKit does not do.",
      },
      {
        slug: "health-checks",
        title: "Health checks",
        description: "Liveness and readiness probes with timeouts and sanitized reports.",
      },
      {
        slug: "responses",
        title: "API responses",
        description:
          "Consistent success and error envelopes, pagination and validation formatting.",
      },
      {
        slug: "rate-limiting",
        title: "Rate limiting",
        description:
          "The RateLimiter contract, Redis stores and adapters for established libraries.",
      },
    ],
  },
  {
    title: "Frameworks",
    pages: [
      {
        slug: "express",
        title: "Express",
        description: "Middleware reference and complete examples for Express 4 and 5.",
      },
      {
        slug: "fastify",
        title: "Fastify",
        description: "Plugin reference and complete examples for Fastify 4 and 5.",
      },
      {
        slug: "typescript",
        title: "TypeScript",
        description: "Type inference, Standard Schema validation, tsconfig and ESM notes.",
      },
    ],
  },
  {
    title: "Tooling",
    pages: [
      {
        slug: "cli",
        title: "CLI",
        description: "nexkit init, doctor and generate — scaffold and diagnose projects.",
      },
      {
        slug: "testing",
        title: "Testing",
        description: "Test helpers and patterns for apps built with NexKit.",
      },
    ],
  },
  {
    title: "Guides",
    pages: [
      {
        slug: "migration",
        title: "Migration",
        description: "Adopt NexKit incrementally in an existing Express or Fastify codebase.",
      },
      {
        slug: "deployment",
        title: "Deployment",
        description:
          "Containers, health probes, proxies, logging pipelines and deploying the docs.",
      },
      {
        slug: "publishing",
        title: "Publishing",
        description: "How the @nexkitjs packages are versioned and released.",
      },
      { slug: "faq", title: "FAQ", description: "Frequently asked questions." },
    ],
  },
  {
    title: "Project",
    pages: [
      {
        slug: "api-reference",
        title: "API reference",
        description: "Every public export of every package, with signatures.",
      },
      {
        slug: "roadmap",
        title: "Roadmap",
        description: "What is implemented, known limitations, and what comes next.",
      },
      {
        slug: "contributing",
        title: "Contributing",
        description: "Repository layout, development workflow and coding guidelines.",
      },
    ],
  },
];

export const allPages: NavPage[] = navigation.flatMap((g) => g.pages);

export function findPage(slug: string): NavPage | undefined {
  return allPages.find((p) => p.slug === slug);
}

export function adjacentPages(slug: string): { prev?: NavPage; next?: NavPage } {
  const index = allPages.findIndex((p) => p.slug === slug);
  return {
    prev: index > 0 ? allPages[index - 1] : undefined,
    next: index >= 0 && index < allPages.length - 1 ? allPages[index + 1] : undefined,
  };
}
