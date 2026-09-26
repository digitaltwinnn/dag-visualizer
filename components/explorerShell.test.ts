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
// directly. `MIGRATING` names the cards still on the old composition while the design lands
// view by view; each conversion removes its entry, and the set ends empty.
const MIGRATING = new Set(["LedgerPanel.tsx", "TrendExplore.tsx"]);

describe("explorer boundary (every tool card is a description handed to the one Explorer)", () => {
  it("every migrated explorer renders <Explorer and never the shell or the row primitives itself", () => {
    const bad: string[] = [];
    for (const name of EXPLORERS) {
      const src = readFileSync(join(COMPONENTS, name), "utf8");
      if (MIGRATING.has(name)) {
        if (!src.includes("<ExplorerShell")) bad.push(`${name}: a migrating explorer still renders <ExplorerShell`);
        continue;
      }
      if (!src.includes("<Explorer\n") && !src.includes("<Explorer ")) bad.push(`${name}: must render <Explorer`);
      for (const forbidden of ["<ExplorerShell", "<ExplorerRow", "<ExplorerHeading", "<ExplorerPath", "<ExplorerLevel", "<ScopeDot"]) {
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

// DISCLOSURE-CHEVRON BOUNDARY (user, 2026-07-18 — set alongside the shared DisclosureChevron
// extraction): a ledger fix had hand-copied ExploreRows' DisclosureRow chevron treatment and
// dropped its hover-reveal (always-visible instead), the exact drift the user predicted a shared
// component would prevent. The cheap backstop: no explorer may import ChevronRight itself — the
// disclosure affordance comes ONLY from components/ExploreRows.tsx (DisclosureChevron directly,
// or DisclosureRow which wraps it), so there is nowhere left for a hand-copy to drift from.
// Post-2026-09-26 an explorer renders NO chevron at all (the design's "quieter" screen: the wash
// is the selection and the row is the control), so the rule only has teeth on the cards still
// migrating; a migrated explorer trips the first describe long before it could import an icon.
describe("disclosure-chevron boundary (the migrating explorers never import ChevronRight directly)", () => {
  it("every migrating explorer gets its disclosure chevron via ExploreRows, not lucide-react directly", () => {
    const bad: string[] = [];
    for (const name of EXPLORERS.filter((n) => MIGRATING.has(n) && n !== "TrendExplore.tsx")) {
      const src = readFileSync(join(COMPONENTS, name), "utf8");
      if (src.includes("ChevronRight")) bad.push(name);
    }
    expect(
      bad,
      "no explorer may reference ChevronRight — use DisclosureChevron/DisclosureRow from components/ExploreRows.tsx instead",
    ).toEqual([]);
  });
});
