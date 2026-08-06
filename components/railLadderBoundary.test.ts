import { describe, it, expect } from "vitest";
import { LADDERS, type FocusLevel } from "@/src/engine/domain/focusLadder";
import { detailsCards, type RailManifestState } from "@/components/railCards";
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers";

// THE LADDER↔RAIL CONTRACT (spec Part 6): every committable ladder rung has a right-rail
// facts slot — a future rung cannot land without deciding its card. Exemptions must be
// EXPLICIT here with a reason, the allow-list way.
const LEVEL_CARD: Record<Exclude<FocusLevel, "all">, string> = {
  network: "context",
  node: "node",
  country: "country",
  cohort: "cohort",
  composition: "composition",
  layer: "layer",
};
const EXEMPT: Partial<Record<Exclude<FocusLevel, "all">, string>> = {
  // (none today — add `level: "reason"` only with a spec decision)
};

const stateFor = (mode: RailManifestState["mode"]): RailManifestState => ({
  mode,
  filter: "all",
  inspect: null,
  snap: null,
  layer: null,
  country: null,
  cohort: null,
  composition: null,
  selNodesCount: 5,
  filterLabel: null,
});

describe("ladder↔rail boundary — every rung has a facts slot", () => {
  for (const [view, rungs] of Object.entries(LADDERS)) {
    it(`${view}: each committable rung maps to a hinted card slot`, () => {
      const cards = detailsCards(stateFor(view as RailManifestState["mode"]));
      for (const rung of rungs) {
        if (rung.level === "all" || EXEMPT[rung.level]) continue;
        const id = LEVEL_CARD[rung.level];
        expect(id, `rung "${rung.level}" has no card mapping`).toBeTruthy();
        const card = cards.find((c) => c.id === id);
        expect(card, `view ${view}: no "${id}" slot for rung "${rung.level}"`).toBeTruthy();
        expect(
          card!.hint,
          `view ${view}: slot "${id}" renders no ghost — the rung is invisible when unselected`
        ).not.toBeNull();
      }
    });
  }
});

// Task 18 — the explorer's floors-and-rails vocabulary: LEDGER_LAYERS' `level` field IS the
// floor/rail split the panel groups its rows by (rail = the four node layers, "1"/"2" = the
// two snapshot floors). Confirms the contract before touching LedgerPanel's rendering.
it("the ledger explorer still browses every node layer, now as rails", () => {
  const rails = LEDGER_LAYERS.filter((l) => l.level === "rail").map((l) => l.id).sort();
  expect(rails).toEqual(["hypl0", "hypl1", "ml0", "ml1"]);
  const floors = LEDGER_LAYERS.filter((l) => l.level !== "rail").map((l) => l.id).sort();
  expect(floors).toEqual(["gl0", "msnap"]);
});
