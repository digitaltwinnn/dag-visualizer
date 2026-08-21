import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Enforces the layering carved out by the Engine refactor:
//   domain/  = pure logic + data. THREE's math classes (Vector3, Color, …) are fine — the boundary
//              forbids scene/, three/addons, react, and store VALUE imports (the `Mode` string-union
//              TYPE is allowed via `import type`). src/net/current is allowed outright: the frozen
//              page-level network resolver is still pure data — the same standing config has
//              (evaluated once, no store, no react, no scene).
//   scene/   = imperative THREE view code. Must not reach into the store or react (the Engine is
//              the only bridge to Lane B; the scene is driven by plain data).
// Reading the files with fs keeps this a cheap grep over real import lines — no bundler needed.

const HERE = import.meta.dirname;

// Every .ts (incl. nested), excluding *.test.ts, under a dir.
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(full));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

// The import specifiers (the string after `from`) of every static/`import type` line in a file.
function importsOf(src: string): { spec: string; typeOnly: boolean }[] {
  const out: { spec: string; typeOnly: boolean }[] = [];
  const re = /^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ typeOnly: !!m[1], spec: m[2] });
  return out;
}

describe("engine layer boundaries", () => {
  it("domain/ imports nothing from scene/, three/addons, react, or the store (except `import type { Mode }`)", () => {
    const files = sourceFiles(join(HERE, "domain"));
    expect(files.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const file of files) {
      const rel = file.slice(HERE.length + 1);
      for (const { spec, typeOnly } of importsOf(readFileSync(file, "utf8"))) {
        const isStore = spec === "@/src/store/store" || spec.startsWith("@/src/store/");
        const forbidden =
          spec.includes("/scene/") ||
          spec.endsWith("/scene") ||
          spec.startsWith("three/addons") ||
          spec === "react" ||
          spec.startsWith("react/") ||
          (isStore && !typeOnly);
        if (forbidden) bad.push(`${rel} → ${spec}${typeOnly ? " (type)" : ""}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("scene/ imports nothing from the store or react", () => {
    const files = sourceFiles(join(HERE, "scene"));
    expect(files.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const file of files) {
      const rel = file.slice(HERE.length + 1);
      for (const { spec } of importsOf(readFileSync(file, "utf8"))) {
        const forbidden =
          spec.startsWith("@/src/store") || spec === "react" || spec.startsWith("react/");
        if (forbidden) bad.push(`${rel} → ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
