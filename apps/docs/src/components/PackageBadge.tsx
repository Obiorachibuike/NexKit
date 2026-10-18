export function Pkg({ name }: { name: string }) {
  return (
    <code className="rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 font-mono text-[0.8em]">
      @nexkitjs/{name}
    </code>
  );
}
