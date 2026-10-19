import type { ReactNode } from "react";

import { SidebarNav } from "@/components/SidebarNav";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-7xl px-4 sm:px-6">
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-[var(--border)] py-8 pr-4 scrollbar-thin lg:block">
        <SidebarNav />
      </aside>
      {children}
    </div>
  );
}
