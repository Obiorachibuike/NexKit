/**
 * Copies `title="…"` from a fenced code block's meta string onto the <code> element
 * so the <pre> component (CodeBlock) can render a titled header.
 * Zero-dependency alternative to rehype-mdx-code-props.
 */
export default function rehypeCodeMeta() {
  return (tree) => {
    walk(tree);
  };
}

function walk(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "element" && node.tagName === "code") {
    const meta = node.data?.meta;
    if (typeof meta === "string") {
      const title = /title="([^"]*)"/.exec(meta)?.[1];
      if (title) {
        node.properties ??= {};
        node.properties.title = title;
      }
    }
  }
  if (Array.isArray(node.children)) node.children.forEach(walk);
}
