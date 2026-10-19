"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navigation } from "@/lib/nav";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Documentation" className="text-sm">
      {navigation.map((group) => (
        <div key={group.title} className="mb-6">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.pages.map((page) => {
              const href = `/docs/${page.slug}/`;
              const active = pathname === href || pathname === href.slice(0, -1);
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={
                      "block rounded-md px-2 py-1.5 transition-colors " +
                      (active
                        ? "bg-accent-100 font-medium text-accent-900 dark:bg-accent-900/40 dark:text-accent-100"
                        : "text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--fg)]")
                    }
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
