import type { ReactNode } from "react";

const styles = {
  note: "border-sky-300/60 bg-sky-50 text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100",
  tip: "border-accent-300/60 bg-accent-50 text-accent-900 dark:border-accent-500/30 dark:bg-accent-500/10 dark:text-accent-100",
  warning:
    "border-amber-300/60 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
  danger:
    "border-rose-300/60 bg-rose-50 text-rose-950 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100",
};

const labels = { note: "Note", tip: "Tip", warning: "Warning", danger: "Important" };

export function Callout({
  type = "note",
  title,
  children,
}: {
  type?: keyof typeof styles;
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside
      className={`my-5 rounded-lg border px-4 py-3 text-[0.925rem] [&_p]:my-1.5 [&_a]:text-inherit ${styles[type]}`}
      role="note"
    >
      <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
        {title ?? labels[type]}
      </p>
      {children}
    </aside>
  );
}
