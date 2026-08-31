import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

// NO IMPORT CYCLES, made executable (2026-08-31).
//
// Three real cycles were found in src/data by a graph walk:
//
//   network -> unlisted -> network
//   unlisted -> anchorLog -> ledgerStory -> unlisted
//   network -> unlisted -> anchorLog -> ledgerStory -> network
//
// None was BREAKING, and that is exactly why this test exists rather than a comment. A cycle in
// ESM survives as long as nothing evaluates across it at MODULE SCOPE — live bindings cover a
// function that is only ever CALLED later. The failure arrives when someone adds a module-scope
// const that calls a cycle partner (unlisted.ts already computes LISTED_IDS at module scope, so
// the shape is right there): then the value is `undefined`, or throws a TDZ error, depending on
// which module the bundler happened to enter first. It is invisible in review, invisible to tsc,
// and it reproduces only under one import order.
//
// The cycles were broken by extracting the two identity literals into the leaf
// src/data/unlistedId.ts. This keeps them broken.
//
// SCOPE: src/ and components/, non-test files, following relative and `@/`-aliased imports.
// Anything else (node_modules, type-only packages) is out of scope.
const ROOTS = ["src", "components", "lib", "app"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const files = ROOTS.flatMap(walk).map((f) => f.replace(/\\/g, "/"));
const known = new Set(files);

/** Resolve an import specifier to a file in `known`, or null when it leaves the project. */
function resolveImport(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = relative(process.cwd(), resolve(dirname(from), spec)).replace(/\\/g, "/");
  else return null; // a package
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (known.has(base + ext)) return base + ext;
  }
  return known.has(base) ? base : null;
}

const graph = new Map<string, string[]>();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const out: string[] = [];
  // `import ... from "x"`, `export ... from "x"`, and bare `import "x"`
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g)) {
    const t = resolveImport(m[1], f);
    if (t && t !== f) out.push(t);
  }
  graph.set(f, out);
}

/** Every cycle reachable in the import graph, as readable paths. */
function findCycles(): string[][] {
  const state = new Map<string, 0 | 1 | 2>();
  const cycles: string[][] = [];
  const stack: string[] = [];
  const visit = (n: string) => {
    state.set(n, 1);
    stack.push(n);
    for (const m of graph.get(n) ?? []) {
      const s = state.get(m) ?? 0;
      if (s === 1) cycles.push([...stack.slice(stack.indexOf(m)), m]);
      else if (s === 0) visit(m);
    }
    stack.pop();
    state.set(n, 2);
  };
  for (const f of files) if ((state.get(f) ?? 0) === 0) visit(f);
  return cycles;
}

describe("no import cycles", () => {
  it("the module graph is acyclic", () => {
    const cycles = findCycles();
    const rendered = cycles.map((c) => c.join(" -> "));
    expect(
      rendered,
      "an import cycle survives only while nothing evaluates across it at module scope — break it " +
        "by extracting what both sides need into a leaf module, as src/data/unlistedId.ts does",
    ).toEqual([]);
  });

  it("the unlisted identity leaf stays a leaf", () => {
    // Its whole purpose is having no imports; one would re-open all three original cycles.
    expect(graph.get("src/data/unlistedId.ts")).toEqual([]);
  });
});
