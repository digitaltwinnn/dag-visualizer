import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The bespoke views implement the SceneView interface at the TYPE level (spec Part B #4), so the
// compiler — not just the sceneViewContract grep — enforces the shared shape. GeoView is exempt
// (Globe drives its furniture alpha). This test pins the implements-wiring so a refactor can't
// silently drop it.
const VIEWS = join(import.meta.dirname);

describe("SceneView interface", () => {
  it("HyperView and LedgerView declare `implements SceneView`", () => {
    for (const name of ["HyperView.ts", "LedgerView.ts"]) {
      const src = readFileSync(join(VIEWS, name), "utf8");
      expect(src.includes("implements SceneView"), `${name} must implement SceneView`).toBe(true);
    }
  });

  it("the interface exposes exactly setViewAlpha (kept minimal until Plan 2)", () => {
    const src = readFileSync(join(VIEWS, "SceneView.ts"), "utf8");
    expect(src.includes("setViewAlpha(a: number): void")).toBe(true);
  });
});
