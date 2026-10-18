import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";

import { Callout } from "@/components/Callout";
import { CodeBlock } from "@/components/CodeBlock";
import { Pkg } from "@/components/PackageBadge";
import { Tab, Tabs } from "@/components/Tabs";

function heading(Tag: "h2" | "h3" | "h4") {
  return function Heading({ id, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
    return (
      <Tag id={id} {...rest}>
        {id ? (
          <a href={`#${id}`}>
            {children}
            <span className="anchor" aria-hidden="true">
              #
            </span>
          </a>
        ) : (
          children
        )}
      </Tag>
    );
  };
}

function Anchor({
  href = "",
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) {
  const internal = href.startsWith("/");
  if (internal) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  const external = /^https?:\/\//.test(href);
  return (
    <a href={href} {...rest} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {children}
    </a>
  );
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    a: Anchor,
    pre: CodeBlock,
    Callout,
    Tabs,
    Tab,
    Pkg,
    ...components,
  };
}
