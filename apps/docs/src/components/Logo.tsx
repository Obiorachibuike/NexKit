export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="8"
        className="fill-zinc-900 dark:fill-zinc-100"
      />
      <path
        d="M9.5 22.5v-13l13 13v-13"
        className="stroke-accent-400 dark:stroke-accent-500"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
