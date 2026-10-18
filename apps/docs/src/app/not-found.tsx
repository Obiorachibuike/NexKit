import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-32 text-center">
      <p className="font-mono text-sm text-[var(--muted)]">404 · NOT_FOUND</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-3 text-[var(--muted)]">
        Not every route needs a handler — but this one would have returned a NexKit{" "}
        <code>NotFoundError</code>.
      </p>
      <Link
        href="/docs/introduction/"
        className="mt-8 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
      >
        Go to the docs
      </Link>
    </main>
  );
}
