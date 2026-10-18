#!/usr/bin/env node
/**
 * Generates content/docs/api-reference.mdx from the public exports of every
 * @nexkitjs package using the TypeScript compiler API, so the reference cannot
 * drift from the code. Run via `npm run build:api` (also runs before dev/build).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(docsRoot, "..", "..");
const packagesDir = path.join(repoRoot, "packages");
const outFile = path.join(docsRoot, "content", "docs", "api-reference.mdx");

const ORDER = [
  "core",
  "config",
  "errors",
  "logger",
  "health",
  "response",
  "ratelimit",
  "express",
  "fastify",
  "testing",
  "cli",
];

const packages = ORDER.filter((name) => readdirSync(packagesDir).includes(name)).map((name) => {
  const pkg = JSON.parse(readFileSync(path.join(packagesDir, name, "package.json"), "utf8"));
  return {
    name,
    npm: pkg.name,
    description: pkg.description ?? "",
    entry: path.join(packagesDir, name, "src", "index.ts"),
  };
});

const tsconfigPath = path.join(repoRoot, "tsconfig.base.json");
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
const program = ts.createProgram(
  packages.map((p) => p.entry),
  {
    ...parsed.options,
    noEmit: true,
    composite: false,
    incremental: false,
    declaration: false,
    declarationMap: false,
    tsBuildInfoFile: undefined,
  },
);
const checker = program.getTypeChecker();

const SIGNATURE_FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.WriteArrowStyleSignature |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  ts.TypeFormatFlags.MultilineObjectLiterals;

/** Escapes MDX-significant characters outside inline code spans. */
function mdxSafe(text) {
  return text
    .split(/(`[^`]*`)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/[{}<>]/g, (c) => ({ "{": "\\{", "}": "\\}", "<": "&lt;", ">": "&gt;" })[c]),
    )
    .join("");
}

function jsDoc(symbol) {
  const parts = symbol.getDocumentationComment(checker);
  const text = ts.displayPartsToString(parts).trim();
  // first paragraph only, collapse whitespace, strip {@link X} → `X`
  return mdxSafe(
    text
      .split(/\n\s*\n/)[0]
      .replace(/\{@link\s+([^}|]+)(?:\|[^}]*)?\}/g, "`$1`")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function printer() {
  return ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
}
const print = printer();

function nodeText(node, sourceFile) {
  return print.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}

function stripExport(text) {
  return text.replace(/^export\s+(default\s+)?/, "").replace(/^declare\s+/, "");
}

function functionSignature(decl, sourceFile) {
  // Print the declaration without its body.
  const clone = ts.factory.updateFunctionDeclaration(
    decl,
    decl.modifiers?.filter(
      (m) => m.kind !== ts.SyntaxKind.ExportKeyword && m.kind !== ts.SyntaxKind.DefaultKeyword,
    ),
    decl.asteriskToken,
    decl.name,
    decl.typeParameters,
    decl.parameters,
    decl.type,
    undefined,
  );
  return nodeText(clone, sourceFile).replace(/;?\s*$/, ";");
}

function classSignature(decl, sourceFile) {
  const name = decl.name?.text ?? "(anonymous)";
  const heritage = decl.heritageClauses?.map((h) => nodeText(h, sourceFile)).join(" ") ?? "";
  const members = [];
  for (const m of decl.members) {
    const mods = ts.getCombinedModifierFlags(m);
    if (mods & ts.ModifierFlags.Private || (m.name && ts.isPrivateIdentifier(m.name))) continue;
    if (ts.isConstructorDeclaration(m)) {
      const params = m.parameters.map((p) => nodeText(p, sourceFile)).join(", ");
      members.push(`  constructor(${params});`);
    } else if (ts.isMethodDeclaration(m)) {
      const clone = ts.factory.updateMethodDeclaration(
        m,
        m.modifiers,
        m.asteriskToken,
        m.name,
        m.questionToken,
        m.typeParameters,
        m.parameters,
        m.type,
        undefined,
      );
      members.push("  " + nodeText(clone, sourceFile).replace(/;?\s*$/, ";"));
    } else if (ts.isPropertyDeclaration(m)) {
      if (m.name && ts.isComputedPropertyName(m.name)) continue;
      const clone = ts.factory.updatePropertyDeclaration(
        m,
        m.modifiers,
        m.name,
        m.questionToken ?? m.exclamationToken,
        m.type,
        undefined,
      );
      let text = nodeText(clone, sourceFile).replace(/;?\s*$/, ";");
      if (!m.type && m.initializer) {
        const t = checker.getTypeAtLocation(m);
        text = text.replace(/;$/, `: ${checker.typeToString(t, m, SIGNATURE_FLAGS)};`);
      }
      members.push("  " + text);
    } else if (ts.isGetAccessorDeclaration(m)) {
      members.push(
        `  get ${m.name.getText(sourceFile)}(): ${m.type ? nodeText(m.type, sourceFile) : "unknown"};`,
      );
    }
  }
  return `class ${name}${decl.typeParameters ? `<${decl.typeParameters.map((t) => nodeText(t, sourceFile)).join(", ")}>` : ""}${heritage ? " " + heritage : ""} {\n${members.join("\n")}\n}`.replace(
    /\s{2,}(extends|implements)/g,
    " $1",
  );
}

function variableSignature(decl, sourceFile, symbol) {
  const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
  const name = decl.name.getText(sourceFile);
  const typeText = checker
    .typeToString(type, decl, SIGNATURE_FLAGS)
    .replace(/\{\s{2,}/g, "{ ")
    .replace(/;\s{2,}/g, "; ")
    .replace(/;\s*\}/g, " }");
  return `const ${name}: ${typeText};`;
}

function declarationFor(symbol) {
  let target = symbol;
  if (symbol.flags & ts.SymbolFlags.Alias) target = checker.getAliasedSymbol(symbol);
  const decls = target.getDeclarations() ?? [];
  return { target, decls };
}

function kindOf(decl) {
  if (ts.isFunctionDeclaration(decl)) return "function";
  if (ts.isClassDeclaration(decl)) return "class";
  if (ts.isInterfaceDeclaration(decl)) return "interface";
  if (ts.isTypeAliasDeclaration(decl)) return "type";
  if (ts.isVariableDeclaration(decl)) return "const";
  if (ts.isEnumDeclaration(decl)) return "enum";
  if (ts.isModuleDeclaration(decl)) return "namespace";
  return "other";
}

const KIND_ORDER = {
  function: 0,
  class: 1,
  const: 2,
  interface: 3,
  type: 4,
  enum: 5,
  namespace: 6,
  other: 7,
};

function renderEntry(exportName, symbol) {
  const { target, decls } = declarationFor(symbol);
  if (decls.length === 0) return null;
  const sourceFile = decls[0].getSourceFile();
  const kind = kindOf(decls[0]);
  const doc = jsDoc(target) || jsDoc(symbol);
  let signature;
  if (kind === "function") {
    signature = decls
      .filter(ts.isFunctionDeclaration)
      .filter((d) => d.body === undefined || decls.filter(ts.isFunctionDeclaration).length === 1)
      .map((d) => functionSignature(d, sourceFile))
      .join("\n");
  } else if (kind === "class") {
    signature = classSignature(decls[0], sourceFile);
  } else if (kind === "const") {
    signature = variableSignature(decls[0], sourceFile, target);
  } else if (kind === "interface" || kind === "type" || kind === "enum") {
    signature = stripExport(nodeText(decls[0], sourceFile));
  } else if (kind === "namespace") {
    signature = `namespace ${exportName} { … }`;
  } else {
    signature = stripExport(nodeText(decls[0], sourceFile));
  }
  if (exportName === "default")
    signature = `export default ${target.getName()}; // alias of ${target.getName()}`;
  return { name: exportName, kind, doc, signature };
}

function anchor(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

let out = `{/* GENERATED FILE — do not edit by hand. Run \`npm run build:api --workspace apps/docs\`. */}

# API reference

Every public export of every \`@nexkitjs\` package, generated from the TypeScript sources by
\`apps/docs/scripts/build-api-reference.mjs\`. Runtime exports are additionally verified
against \`scripts/expected-exports.json\` in CI. Type-only exports are listed in their own
section per package.

`;

out += "| Package | Runtime exports | Types |\n| --- | --- | --- |\n";
const rendered = [];
for (const pkg of packages) {
  const sf = program.getSourceFile(pkg.entry);
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  const exports = checker.getExportsOfModule(moduleSymbol);
  const entries = exports
    .map((s) => renderEntry(s.getName(), s))
    .filter(Boolean)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
  const runtime = entries.filter((e) =>
    ["function", "class", "const", "enum", "other"].includes(e.kind),
  );
  const types = entries.filter((e) => ["interface", "type", "namespace"].includes(e.kind));
  rendered.push({ pkg, runtime, types });
  out += `| [\`${pkg.npm}\`](#${anchor(pkg.npm)}) | ${runtime.length} | ${types.length} |\n`;
}
out += "\n";

for (const { pkg, runtime, types } of rendered) {
  out += `## ${pkg.npm}\n\n`;
  if (pkg.description) out += `${pkg.description}\n\n`;
  out += `\`\`\`bash\nnpm install ${pkg.npm}\n\`\`\`\n\n`;
  for (const e of runtime) {
    out += `### ${e.name}\n\n`;
    if (e.doc) out += `${e.doc}\n\n`;
    out += `\`\`\`ts\n${e.signature}\n\`\`\`\n\n`;
  }
  if (types.length > 0) {
    out += `### Types (${pkg.name})\n\n`;
    for (const e of types) {
      out += `#### ${e.name}\n\n`;
      if (e.doc) out += `${e.doc}\n\n`;
      out += `\`\`\`ts\n${e.signature}\n\`\`\`\n\n`;
    }
  }
}

writeFileSync(outFile, out);
const total = rendered.reduce((n, r) => n + r.runtime.length + r.types.length, 0);
console.log(
  `api reference: ${total} entries across ${rendered.length} packages → ${path.relative(docsRoot, outFile)}`,
);
