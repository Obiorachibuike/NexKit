import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { registry } from "@content/registry";
import { TableOfContents } from "@/components/TableOfContents";
import { adjacentPages, allPages, findPage } from "@/lib/nav";
import { site } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return allPages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findPage(slug);
  if (!page) return {};
  return { title: page.title, description: page.description };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findPage(slug);
  const load = registry[slug];
  if (!page || !load) notFound();

  const { default: Content } = await load();
  const { prev, next } = adjacentPages(slug);

  return (
    <>
      <article className="prose min-w-0 flex-1 py-8 lg:px-10 lg:py-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-700 dark:text-accent-300">
          {page.title}
        </p>
        <Content />
        <hr />
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          {prev ? (
            <Link href={`/docs/${prev.slug}/`} className="group no-underline!">
              <span className="block text-xs text-[var(--muted)]">← Previous</span>
              <span className="font-medium group-hover:underline">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/docs/${next.slug}/`} className="group text-right no-underline!">
              <span className="block text-xs text-[var(--muted)]">Next →</span>
              <span className="font-medium group-hover:underline">{next.title}</span>
            </Link>
          )}
        </div>
        <p className="mt-8 text-xs text-[var(--muted)]">
          <a href={`${site.repo}/edit/main/apps/docs/content/docs/${slug}.mdx`}>
            Edit this page on GitHub
          </a>
        </p>
      </article>
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto py-10 pl-2 xl:block">
        <TableOfContents />
      </aside>
    </>
  );
}
