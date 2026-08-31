import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The SUBJECT CALLOUT's contracts, made executable (2026-08-16 — the boundary-test idiom).
// The callout is split across two owners on purpose — React owns the DOM and content
// (components/SceneCallout.tsx), CalloutSync owns per-frame placement (src/engine/CalloutSync.ts) —
// and three agreements keep the split from drifting:
//
//  1. `#callout` has exactly TWO homes: SceneCallout renders the marker element, the Engine
//     queries it. A third home would be a second positioning or content path.
//  2. BOTH owners consult `boxedCard`. The box-led subject preference is deliberately mirrored
//     (the component picks the MODEL, CalloutSync picks the ANCHOR); an owner that stops reading
//     the channel would label one subject while pointing at another.
//  3. `SCENE_GLASS` (components/selection.tsx, the shared-recipe home) is the ONE container
//     for scene-anchored labels: SceneCallout and Tooltip both wear it (user, 2026-08-15 —
//     "align the hover and the click card"). Neither may re-grow its own glass recipe.
//  4. BOTH owners decline on a PHONE, through `breakpointOf`'s one home (the component via
//     `useBreakpoint`, CalloutSync directly). The callout's value is co-location with its
//     subject and its ~298px reach cannot deliver that under 700px; a hard-coded width in
//     either owner would let the DOM and the placement disagree about where the tier ends.

const ROOTS = ["components", "src", "app"];
// The engine-side home moved out of Engine.ts into CalloutSync.ts (2026-08-31) — the placement
// was ten methods and ~270 lines that shared no state with the rest of the Engine. A change of
// FILE, not of the rule: there are still exactly two owners, one rendering and one positioning.
const CALLOUT_HOMES = new Set(["components/SceneCallout.tsx", "src/engine/CalloutSync.ts"]);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const read = (p: string) => readFileSync(p, "utf8");

describe("subject-callout boundary", () => {
  it('the "callout" marker id lives only in its two homes', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const norm = file.replace(/\\/g, "/");
        if (CALLOUT_HOMES.has(norm)) continue;
        const code = stripComments(read(file));
        if (/["'`]callout["'`]/.test(code)) offenders.push(norm);
      }
    }
    expect(
      offenders,
      `#callout is a two-home marker contract (SceneCallout renders, Engine positions): ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("both callout owners consult the boxedCard channel (the box-led preference is mirrored)", () => {
    for (const home of CALLOUT_HOMES) {
      const code = stripComments(read(home));
      expect(code.includes("boxedCard"), `${home} no longer reads boxedCard — the box-led subject preference must stay mirrored in both owners`).toBe(true);
    }
  });

  it("both scene-anchored labels wear SCENE_GLASS rather than glass recipes of their own", () => {
    for (const f of ["components/Tooltip.tsx", "components/SceneCallout.tsx"]) {
      const code = stripComments(read(f));
      expect(code.includes("SCENE_GLASS"), `${f} must wear the shared scene-label container`).toBe(true);
      expect(/backdrop-blur|panel-solid/.test(code), `${f} re-grows its own glass — the container belongs to SCENE_GLASS (components/selection.tsx)`).toBe(false);
    }
  });

  it("both callout owners decline on a phone through the shared breakpoint home", () => {
    for (const home of CALLOUT_HOMES) {
      const code = stripComments(read(home));
      expect(
        /breakpointOf|useBreakpoint/.test(code),
        `${home} must read the tier from src/data/breakpoint (directly or via useBreakpoint) — a hard-coded width lets the two owners disagree about where the phone tier ends`,
      ).toBe(true);
      expect(code.includes('"phone"'), `${home} no longer declines the callout on the phone tier`).toBe(true);
    }
  });
});
