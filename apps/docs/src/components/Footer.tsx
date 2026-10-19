import Link from "next/link";

import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} NexKit contributors · MIT License ·{" "}
          <span className="font-mono">{site.npmScope}/*</span>
        </p>
        <nav className="flex flex-wrap gap-4">
          <Link href="/docs/introduction/" className="hover:text-[var(--fg)]">
            Docs
          </Link>
          <Link href="/docs/roadmap/" className="hover:text-[var(--fg)]">
            Roadmap
          </Link>
          <Link href="/docs/contributing/" className="hover:text-[var(--fg)]">
            Contributing
          </Link>
          <a href={`${site.repo}/blob/main/SECURITY.md`} className="hover:text-[var(--fg)]">
            Security
          </a>
          <a href={site.repo} className="hover:text-[var(--fg)]">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
