import createMDX from "@next/mdx";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import rehypeCodeMeta from "./lib/rehype-code-meta.mjs";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the site is plain HTML/CSS/JS and deploys to any static host.
  output: "export",
  ...(basePath ? { basePath } : {}),
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  pageExtensions: ["ts", "tsx", "mdx"],
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeSlug, rehypeCodeMeta],
  },
});

export default withMDX(nextConfig);
