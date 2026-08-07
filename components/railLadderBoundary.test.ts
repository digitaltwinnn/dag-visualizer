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
};
const EXEMPT: Partial<Record<Exclude<FocusLevel, "all">, string>> = {
  // (none today — add `level: "reason"` only with a spec decision)
};

const stateFor = (mode: RailManifestState["mode"]): RailManifestState => ({
  mode,
  filter: "all",
  inspect: null,
  snap: null,
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

// Snapshots-first explorer (2026-08-06): only the two snapshot FLOORS carry display copy — the
// node layers are per-role containers (ledgerRails.ROLE_CODE) and no layer is committable.
it("the ledger explorer's floor vocabulary is exactly the two snapshot floors", () => {
  expect(LEDGER_LAYERS.map((l) => l.id).sort()).toEqual(["gl0", "msnap"]);
  expect(LEDGER_LAYERS.map((l) => l.level).sort()).toEqual(["1", "2"]);
});
