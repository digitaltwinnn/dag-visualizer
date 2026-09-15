import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Enforces the layering carved out by the Engine refactor:
//   domain/  = pure logic + data. THREE's math classes (Vector3, Color, …) are fine — the boundary
//              forbids scene/, three/addons, react, and store VALUE imports (the `Mode` string-union
//              TYPE is allowed via `import type`). src/net/current is allowed outright: the frozen
//              page-level network resolver is still pure data — the same standing config has
//              (evaluated once, no store, no react, no scene).
//   scene/   = imperative THREE view code. Must not reach into the store or react (the engine layer
//              is the only bridge to Lane B; the scene is driven by plain data).
//   engine/  = the ONE store bridge — as a LAYER, not as a file. `src/engine/*.ts` may hold the
//              store's values; everything below it (domain/, scene/) may not. The bridge files are
//              named in STORE_BRIDGE below, so the rule survives refactoring without dissolving:
//              splitting Engine.ts is a normal thing to do, silently growing a second bridge is
//              not. Adding a name there is a deliberate edit with a reason, the allow-list way.
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

  // ⚠️ THE BRIDGE IS A LAYER, NOT A FILE (user, 2026-09-15: "the rule should not force things to be
  // in one file, the rule is a concept/principal and code refactoring should be able to be done
  // within those bounds"). Rule 1 used to name `Engine.ts`, which made a 2000-line file the price
  // of the invariant — the boundary that matters is that the SCENE is driven by plain data and one
  // layer answers to the store, not that the layer is spelled as a single module.
  //
  // So the check is an allow-list of engine-layer files that may hold store VALUES. `import type`
  // is free everywhere (the `Mode` string-union is a shape, not a channel — CameraDirector and
  // CalloutSync already take it). What this catches is a NEW engine file quietly reaching for
  // `useStore` because it was convenient, which is how one bridge becomes three.
  const STORE_BRIDGE = new Set([
    "Engine.ts", // the render loop, picking, the command bridge
  ]);

  it("only the named engine-layer files hold store VALUES", () => {
    const files = sourceFiles(HERE).filter((f) => {
      const rel = f.slice(HERE.length + 1);
      return !rel.includes("/"); // the engine layer itself: domain/ and scene/ are covered above
    });
    expect(files.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const file of files) {
      const rel = file.slice(HERE.length + 1);
      for (const { spec, typeOnly } of importsOf(readFileSync(file, "utf8"))) {
        if (typeOnly || !spec.startsWith("@/src/store")) continue;
        if (!STORE_BRIDGE.has(rel)) bad.push(`${rel} → ${spec}`);
      }
    }
    expect(
      bad,
      `these engine files reach the store without being named as a bridge — add them to STORE_BRIDGE with a reason, or drive them with plain data:\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("every named bridge exists and actually bridges — no stale entries", () => {
    // A name left behind after its file stopped touching the store would quietly widen the rule.
    for (const rel of STORE_BRIDGE) {
      const src = readFileSync(join(HERE, rel), "utf8");
      const holdsValue = importsOf(src).some((i) => !i.typeOnly && i.spec.startsWith("@/src/store"));
      expect(holdsValue, `"${rel}" is listed as a store bridge but holds no store value`).toBe(true);
    }
  });
});
