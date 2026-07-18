import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// EXPLORER-CHROME BOUNDARY (user, 2026-07-18 — set alongside the ExplorerShell extraction): the
// three left-rail tool cards must render the ONE shared chrome (components/ExplorerShell.tsx),
// not hand-roll their own Card/CardHead/body wrapper. The three had already drifted once (the
// ledger card wore a stray bottom separator geo didn't have, and a stuck-hover bug the shared
// chrome's container-level `onLeave` now backstops) — this is the cheap grep that keeps a future
// explorer (or a "quick fix" on an existing one) from silently reintroducing a fourth chrome.
//
// Cheap grep over real source (the house pattern — see selectionBoundary.test.ts,
// engine/layerBoundaries.test.ts, engine/noHardcodedColors.test.ts).

const COMPONENTS = join(import.meta.dirname, ".");

const EXPLORERS = ["GeoExplore.tsx", "HyperExplore.tsx", "LedgerPanel.tsx"];

describe("explorer-chrome boundary (the three tool cards render the shared shell)", () => {
  it("every explorer renders <ExplorerShell — none hand-rolls its own card chrome", () => {
    const bad: string[] = [];
    for (const name of EXPLORERS) {
      const src = readFileSync(join(COMPONENTS, name), "utf8");
      if (!src.includes("<ExplorerShell")) bad.push(name);
    }
    expect(bad, "every explorer must render <ExplorerShell — add it instead of hand-rolling chrome").toEqual([]);
  });
});
