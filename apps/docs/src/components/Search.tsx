"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { asset } from "@/lib/site";

interface SearchEntry {
  slug: string;
  title: string;
  heading: string;
  anchor: string;
  content: string;
}

interface Hit extends SearchEntry {
  score: number;
  snippet: string;
}

let indexPromise: Promise<SearchEntry[]> | null = null;
function loadIndex(): Promise<SearchEntry[]> {
  indexPromise ??= fetch(asset("/search-index.json"))
    .then((r) => (r.ok ? (r.json() as Promise<SearchEntry[]>) : []))
    .catch(() => []);
  return indexPromise;
}

function search(index: SearchEntry[], query: string): Hit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const hits: Hit[] = [];
  for (const entry of index) {
    const title = entry.title.toLowerCase();
    const heading = entry.heading.toLowerCase();
    const content = entry.content.toLowerCase();
    let score = 0;
    let firstPos = -1;
    for (const term of terms) {
      let termScore = 0;
      if (title.includes(term)) termScore += 8;
      if (heading.includes(term)) termScore += 5;
      const pos = content.indexOf(term);
      if (pos >= 0) {
        termScore += 1;
        if (firstPos < 0) firstPos = pos;
      }
      if (termScore === 0) {
        score = 0;
        break;
      }
      score += termScore;
    }
    if (score > 0) {
      const start = Math.max(0, (firstPos < 0 ? 0 : firstPos) - 50);
      const raw = entry.content.slice(start, start + 140).trim();
      hits.push({ ...entry, score, snippet: (start > 0 ? "…" : "") + raw + "…" });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 12);
}

export function Search() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelected(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (open) {
      void loadIndex().then(setIndex);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const hits = useMemo(() => (index ? search(index, query) : []), [index, query]);

  function go(hit: Hit) {
    router.push(`/docs/${hit.slug}/${hit.anchor ? `#${hit.anchor}` : ""}`);
    close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search documentation"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-sm text-[var(--muted)] hover:bg-[var(--card)] sm:w-56 sm:justify-between"
      >
        <span className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Search docs…</span>
        </span>
        <kbd className="hidden sm:inline">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-[var(--muted)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelected((s) => Math.min(s + 1, hits.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelected((s) => Math.max(s - 1, 0));
                  } else if (e.key === "Enter" && hits[selected]) {
                    go(hits[selected]);
                  }
                }}
                placeholder="Search docs (e.g. validateEnv, rate limit, Fastify)"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                aria-label="Search query"
                autoComplete="off"
              />
              <kbd>esc</kbd>
            </div>
            <ul className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2" role="listbox">
              {query && index && hits.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-[var(--muted)]">
                  No results for “{query}”.
                </li>
              )}
              {!query && (
                <li className="px-3 py-6 text-center text-sm text-[var(--muted)]">
                  Type to search across all pages. Use <kbd>↑</kbd> <kbd>↓</kbd> and{" "}
                  <kbd>Enter</kbd>.
                </li>
              )}
              {hits.map((hit, i) => (
                <li
                  key={`${hit.slug}#${hit.anchor}`}
                  role="option"
                  aria-selected={i === selected}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => go(hit)}
                  className={
                    "cursor-pointer rounded-lg px-3 py-2 " +
                    (i === selected ? "bg-accent-100 dark:bg-accent-900/40" : "")
                  }
                >
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="font-medium">{hit.title}</span>
                    {hit.heading && (
                      <span className="truncate text-[var(--muted)]">› {hit.heading}</span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">{hit.snippet}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
