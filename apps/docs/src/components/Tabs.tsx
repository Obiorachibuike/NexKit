"use client";

import { Children, isValidElement, useEffect, useId, useState, type ReactNode } from "react";

interface TabsProps {
  items: string[];
  children: ReactNode;
  /** Remember the selected tab across all Tabs with the same group (e.g. "framework"). */
  group?: string;
}

const listeners = new Map<string, Set<(v: string) => void>>();

function publish(group: string, value: string) {
  try {
    sessionStorage.setItem(`nexkit-tabs:${group}`, value);
  } catch {
    /* ignore */
  }
  listeners.get(group)?.forEach((fn) => fn(value));
}

export function Tabs({ items, children, group }: TabsProps) {
  const id = useId();
  const [active, setActive] = useState(items[0] ?? "");
  const panels = Children.toArray(children).filter(isValidElement);

  // Keep every "Express | Fastify" switcher on the page (and across pages) in sync.
  useEffect(() => {
    if (!group) return;
    const set = listeners.get(group) ?? new Set();
    listeners.set(group, set);
    const listener = (v: string) => {
      if (items.includes(v)) setActive(v);
    };
    set.add(listener);
    try {
      const stored = sessionStorage.getItem(`nexkit-tabs:${group}`);
      if (stored) listener(stored);
    } catch {
      /* ignore */
    }
    return () => {
      set.delete(listener);
    };
  }, [group, items]);

  return (
    <div className="my-5 overflow-hidden rounded-xl border border-[var(--border)]">
      <div
        role="tablist"
        className="flex gap-1 border-b border-[var(--border)] bg-[var(--card)] px-2 pt-2"
      >
        {items.map((item) => {
          const selected = item === active;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              id={`${id}-tab-${item}`}
              aria-selected={selected}
              aria-controls={`${id}-panel-${item}`}
              onClick={() => (group ? publish(group, item) : setActive(item))}
              className={
                "-mb-px rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (selected
                  ? "border border-b-0 border-[var(--border)] bg-[var(--bg)] text-[var(--fg)]"
                  : "text-[var(--muted)] hover:text-[var(--fg)]")
              }
            >
              {item}
            </button>
          );
        })}
      </div>
      {items.map((item, i) => (
        <div
          key={item}
          role="tabpanel"
          id={`${id}-panel-${item}`}
          aria-labelledby={`${id}-tab-${item}`}
          hidden={item !== active}
          className="px-4 [&_.codeblock]:my-3"
        >
          {panels[i]}
        </div>
      ))}
    </div>
  );
}

export function Tab({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
