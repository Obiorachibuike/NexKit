import type { MetadataRoute } from "next";

import { allPages } from "@/lib/nav";
import { site } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = `${site.url.replace(/\/$/, "")}`;
  return [
    { url: `${base}/`, lastModified: new Date(), priority: 1 },
    ...allPages.map((p) => ({
      url: `${base}/docs/${p.slug}/`,
      lastModified: new Date(),
      priority: 0.7,
    })),
  ];
}
