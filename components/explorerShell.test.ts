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

const EXPLORERS = ["GeoExplore.tsx", "HyperExplore.tsx", "LedgerPanel.tsx", "TrendExplore.tsx"];

// THE RULE MOVED UP A LEVEL ON 2026-09-26 (the explorer-card design session, user: "every view
// will have an explorer, so I'd like to keep its behaviour consistent by design rather than
// copy-paste"): an explorer no longer composes the shell, the heading, the path and the rows
// itself — it hands a DESCRIPTION of its levels to the ONE `components/explorer/Explorer.tsx`,
// which is the only file that renders `<ExplorerShell`. So the grep is now two-sided: every
// explorer renders `<Explorer`, and none of them renders the shell or the row primitives
// directly. (A `MIGRATING` set carried the cards still on the old composition while the design
// landed view by view; it ended empty on 2026-09-26 and went, with `components/ExploreRows.tsx`.)

describe("explorer boundary (every tool card is a description handed to the one Explorer)", () => {
  it("every explorer renders <Explorer and never the shell or the row primitives itself", () => {
    const bad: string[] = [];
    for (const name of EXPLORERS) {
      const src = readFileSync(join(COMPONENTS, name), "utf8");
      if (!src.includes("<Explorer\n") && !src.includes("<Explorer ")) bad.push(`${name}: must render <Explorer`);
      for (const forbidden of ["<ExplorerShell", "<ExplorerRow", "<ExplorerHeading", "<ExplorerPath", "<ExplorerLevel"]) {
        if (src.includes(forbidden)) bad.push(`${name}: renders ${forbidden} itself — that is Explorer.tsx's job`);
      }
    }
    expect(bad, "the explorer grammar has one home, components/explorer/Explorer.tsx").toEqual([]);
  });

  it("only Explorer.tsx renders the shell", () => {
    const src = readFileSync(join(COMPONENTS, "explorer", "Explorer.tsx"), "utf8");
    expect(src.includes("<ExplorerShell")).toBe(true);
  });
});
