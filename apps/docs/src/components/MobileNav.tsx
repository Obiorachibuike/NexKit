"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Logo } from "./Logo";
import { SidebarNav } from "./SidebarNav";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--card)] lg:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4.5 w-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[85vw] max-w-xs flex-col bg-[var(--bg)] shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-4">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 font-semibold"
              >
                <Logo /> NexKit
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-[var(--card)]"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4.5 w-4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
              <SidebarNav onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
