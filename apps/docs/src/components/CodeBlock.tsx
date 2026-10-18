"use client";

import { highlight } from "sugar-high";
import { useMemo, useState, type ReactNode } from "react";

interface CodeBlockProps {
  children?: ReactNode;
  className?: string;
  title?: string;
}

function extractCode(children: ReactNode): { code: string; language: string; title?: string } {
  // MDX renders <pre><code className="language-ts" title="…">text</code></pre>
  if (children && typeof children === "object" && "props" in children) {
    const props = (
      children as { props: { className?: string; title?: string; children?: ReactNode } }
    ).props;
    const language = /language-(\w+)/.exec(props.className ?? "")?.[1] ?? "";
    const code = typeof props.children === "string" ? props.children : String(props.children ?? "");
    return {
      code: code.replace(/\n$/, ""),
      language,
      ...(props.title ? { title: props.title } : {}),
    };
  }
  return { code: typeof children === "string" ? children : "", language: "" };
}

export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (insecure context) */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      data-copied={copied}
      aria-label={copied ? "Copied" : "Copy code"}
      className={`copy-button ${className}`}
    >
      {copied ? (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
        </svg>
      )}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

const HIGHLIGHTABLE = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "typescript",
  "javascript",
]);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function CodeBlock({ children, title: titleProp }: CodeBlockProps) {
  const { code, language, title: metaTitle } = useMemo(() => extractCode(children), [children]);
  const title = titleProp ?? metaTitle;
  const html = useMemo(
    () => (HIGHLIGHTABLE.has(language) ? highlight(code) : escapeHtml(code)),
    [code, language],
  );
  const label = title ?? (language ? language : undefined);

  return (
    <div className="codeblock" data-has-title={Boolean(title)}>
      {title ? (
        <div className="codeblock-header">
          <span>{title}</span>
          <CopyButton text={code} />
        </div>
      ) : (
        <>
          {label && (
            <span className="pointer-events-none absolute top-2 left-3 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              {label}
            </span>
          )}
          <CopyButton text={code} className="copy-floating" />
        </>
      )}
      <pre className={title ? undefined : "pt-6!"}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
