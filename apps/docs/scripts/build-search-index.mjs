#!/usr/bin/env node
/**
 * Builds public/search-index.json from content/docs/*.mdx.
 * Each page is split into sections by H2/H3 headings; anchors follow the
 * github-slugger convention used by rehype-slug so search hits deep-link correctly.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = path.join(root, "content", "docs");
const outFile = path.join(root, "public", "search-index.json");

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/ /g, "-");
}

function stripMdx(text) {
  return text
    .replace(/^import\s.+$/gm, "")
    .replace(/^export\s.+$/gm, "")
    .replace(/<[^>]+>/g, " ") // JSX tags
    .replace(/```[\w-]*(?:\s+title="[^"]*")?\n?/g, " ") // code fences (keep code text)
    .replace(/[`*_>|#]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const entries = [];
const files = (await readdir(contentDir)).filter((f) => f.endsWith(".mdx")).sort();
const slugCounts = new Map();

for (const file of files) {
  const slug = file.replace(/\.mdx$/, "");
  const source = await readFile(path.join(contentDir, file), "utf8");
  const lines = source.split("\n");
  let pageTitle = slug;
  let heading = "";
  let anchor = "";
  let buffer = [];
  let inFence = false;
  slugCounts.clear();

  const flush = () => {
    const content = stripMdx(buffer.join("\n"));
    if (content || heading)
      entries.push({ slug, title: pageTitle, heading, anchor, content: content.slice(0, 1500) });
    buffer = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) inFence = !inFence;
    if (!inFence) {
      const h1 = /^#\s+(.+)$/.exec(line);
      if (h1) {
        pageTitle = h1[1].replace(/`/g, "").trim();
        continue;
      }
      const h = /^(##|###|####)\s+(.+)$/.exec(line);
      if (h) {
        flush();
        heading = h[2].replace(/`/g, "").trim();
        let a = slugify(heading);
        const n = slugCounts.get(a) ?? 0;
        slugCounts.set(a, n + 1);
        if (n > 0) a = `${a}-${n}`;
        anchor = a;
        continue;
      }
    }
    buffer.push(line);
  }
  flush();
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(entries));
console.log(
  `search index: ${entries.length} sections from ${files.length} pages → ${path.relative(root, outFile)}`,
);
