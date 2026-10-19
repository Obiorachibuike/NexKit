import Link from "next/link";

import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { Search } from "./Search";
import { ThemeToggle } from "./ThemeToggle";
import { site } from "@/lib/site";

const links = [
  { href: "/docs/introduction/", label: "Docs" },
  { href: "/docs/modules/", label: "Modules" },
  { href: "/docs/api-reference/", label: "API" },
  { href: "/docs/express/", label: "Examples" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur supports-[backdrop-filter]:bg-[var(--bg)]/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <MobileNav />
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          <span>{site.name}</span>
          <span className="hidden rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)] sm:inline">
            v{site.version}
          </span>
        </Link>
        <nav className="ml-6 hidden items-center gap-5 text-sm text-[var(--muted)] md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-[var(--fg)]">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Search />
          <ThemeToggle />
          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--card)]"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden="true">
              <path d="M12 .5A11.5 11.5 0 0 0 .5 12.2c0 5.17 3.3 9.55 7.86 11.1.58.1.79-.26.79-.57v-2.1c-3.2.7-3.87-1.4-3.87-1.4-.53-1.35-1.28-1.71-1.28-1.71-1.05-.73.08-.72.08-.72 1.16.08 1.77 1.22 1.77 1.22 1.03 1.8 2.7 1.28 3.36.98.1-.76.4-1.28.73-1.57-2.55-.3-5.23-1.3-5.23-5.8 0-1.28.45-2.33 1.2-3.15-.12-.3-.52-1.5.11-3.12 0 0 .98-.32 3.2 1.2a10.9 10.9 0 0 1 5.83 0c2.22-1.52 3.2-1.2 3.2-1.2.63 1.62.23 2.82.11 3.12.75.82 1.2 1.87 1.2 3.15 0 4.52-2.69 5.5-5.25 5.79.41.36.78 1.07.78 2.16v3.2c0 .31.2.68.8.56A11.52 11.52 0 0 0 23.5 12.2 11.5 11.5 0 0 0 12 .5Z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
