import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The SCENE-VIEW CONTRACT — house grep-tests (layerBoundaries idiom) enforcing the patterns the
// 2026-07-17 view-transition work settled, so FUTURE views inherit them by CI, not by memory:
//
//   1. Every view module under scene/views/ rides the furniture-alpha mechanism
//      (`setViewAlpha`) — the transition choreography's build/teardown contract. A new view
//      that skips it would pop instead of fading and break the "old/new furniture never
//      overlaps the flight" rule.
//   2. Scene modules are MODE-AGNOSTIC: they never compare `Mode` strings. Views receive
//      booleans/alphas/policy flags from the Engine (the only store bridge); a `mode === "x"`
//      in scene code is a deny-list seed and a layering leak.
//   3. Camera/framing math reads LAYOUT data, never rendered transforms: in Engine.ts, any
//      `getWorldPosition(`/`getMatrixAt(` call must carry a `render-state OK` marker comment
//      justifying it (the documented escape hatch for genuine render-path uses like the
//      dormant DoF focus read). Two live-review bugs (hyperWorldPos framing the staging grid,
//      the boundary framing a collapsed root) came from framing against render state — the
//      transition system makes "where things are drawn" and "where they belong" permanently
//      different things.

const HERE = import.meta.dirname;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(full));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("scene-view contract", () => {
  it("every scene/views module exposes setViewAlpha (the furniture build/teardown contract)", () => {
    // Documented exemption: GeoView builds the geo SURFACE whose furniture alpha rides
    // Globe.setMorph's surf/extras choke points (the geoFades registry) — Globe consumes
    // furnitureAlpha("geo") for it. Every OTHER view (and every future one) owns its alpha.
    const EXEMPT = new Set(["GeoView.ts"]);
    for (const f of sourceFiles(join(HERE, "scene/views"))) {
      const name = f.split("/").pop()!;
      if (EXEMPT.has(name)) continue;
      const src = readFileSync(f, "utf8");
      expect(src.includes("setViewAlpha("), `${name} must implement setViewAlpha( — new views ride the transition furniture alpha`).toBe(true);
    }
  });

  it("scene modules never compare Mode strings (views are mode-agnostic)", () => {
    const MODE_CMP = /mode\s*===\s*["']|===\s*["'](hyper|geo|ledger|status|transactions|staking)["']/;
    for (const f of sourceFiles(join(HERE, "scene"))) {
      const src = readFileSync(f, "utf8");
      for (const [i, line] of src.split("\n").entries()) {
        const code = line.split("//")[0]; // comments may mention modes freely
        expect(MODE_CMP.test(code), `${f.split("/src/")[1]}:${i + 1} compares a Mode string — scene code takes booleans/alphas/policy flags from the Engine instead`).toBe(false);
      }
    }
  });

  it("Engine framing math reads layout, not render state (marker-gated getWorldPosition/getMatrixAt)", () => {
    const lines = readFileSync(join(HERE, "Engine.ts"), "utf8").split("\n");
    for (const [i, line] of lines.entries()) {
      if (/\.(getWorldPosition|getMatrixAt)\(/.test(line)) {
        // The `render-state OK` marker may sit on the call line or the comment line above it.
        const marked = line.includes("render-state OK") || (lines[i - 1] ?? "").includes("render-state OK");
        expect(marked, `Engine.ts:${i + 1} reads a rendered transform without the \`render-state OK\` marker — framing/camera math must consume LAYOUT data (records, anchors, orbit slots); add the marker ONLY for a justified render-path read`).toBe(true);
      }
    }
  });

  it("views never write their root group's `visible` — the Engine/policy owns it (spec A#5)", () => {
    // Root-group visibility is VIEW LIFECYCLE (which view is on) — Engine territory. Views own
    // opacity/alpha (FadeSet) + child-mesh visibility. `this.group.visible =` in a view is the
    // two-writers bug class (the Engine/LedgerView fight the transitions branch fixed).
    const ROOT_VIS = /this\.(group|root)\.visible\s*=/;
    for (const f of sourceFiles(join(HERE, "scene/views"))) {
      const src = readFileSync(f, "utf8");
      for (const [i, line] of src.split("\n").entries()) {
        const code = line.split("//")[0];
        expect(ROOT_VIS.test(code), `${f.split("/src/")[1]}:${i + 1} writes the view root's visible — Engine/policy owns root visibility; views fade via alpha`).toBe(false);
      }
    }
  });
});
