import { describe, it, expect } from "vitest";
import { LADDERS, type FocusLevel } from "@/src/engine/domain/focusLadder";
import { detailsCards, ladderSlotIds, type RailManifestState } from "@/components/railCards";
import { CHILD_OF } from "@/components/railSiblings";
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

// ⚠️ THE TWO GUARANTEES THE DERIVATION USED TO GIVE FOR FREE (2026-09-15). The display lane was
// computed from LADDERS — reversed, mapped through the slot table — so a rung could not be missing
// from the spine and the spine could not disagree about the ORDER. The lane is a plain table now,
// which reads far better and cannot check itself, so both properties are asserted here. A rung
// added to LADDERS without a place in its view's lane fails the first; a lane reordered against the
// camera walk fails the second.
describe("ladder↔lane boundary — the lane still agrees with the rung tables", () => {
  for (const [view, rungs] of Object.entries(LADDERS)) {
    const lane = ladderSlotIds(view as RailManifestState["mode"]);
    const rungSlots = [...rungs]
      .reverse() // rung tables walk finest→coarsest; the lane runs coarsest→finest
      .flatMap((r) => (r.level === "all" || EXEMPT[r.level] ? [] : [LEVEL_CARD[r.level]]));

    it(`${view}: every committable rung sits somewhere in the lane`, () => {
      for (const id of rungSlots) expect(lane, `"${id}" is a rung with no place in the lane`).toContain(id);
    });

    it(`${view}: the lane's rung members run coarsest→finest, matching the camera walk`, () => {
      // Non-rung members (the ledger's two snapshot slots) are display hierarchy and may sit
      // anywhere between them; what must not drift is the ORDER of the rungs themselves.
      expect(lane.filter((id) => rungSlots.includes(id))).toEqual(rungSlots);
    });
  }

  it("a flat view has no lane at all", () => {
    expect(ladderSlotIds("soon")).toEqual([]);
  });
});

// ⚠️ A ∨ STEP GOES EXACTLY ONE SLOT DOWN THE LANE (2026-09-15). This rule has been enforced by
// comments and by whoever remembered it, and it was broken twice in the same place: the ledger's
// tick used to reach TWO levels down (straight to a metagraph snapshot) and drag the filter — a
// coarser rung — along with it. `CHILD_OF` declares each step's destination, so both halves are
// checkable: a step that skips a rung fails here, and so does one that reaches back up.
describe("child steps descend exactly one rung of the lane", () => {
  for (const [view, slots] of Object.entries(CHILD_OF)) {
    const lane = ladderSlotIds(view as RailManifestState["mode"]);
    for (const [from, entry] of Object.entries(slots ?? {})) {
      it(`${view}: ${from} → ${entry!.to} is the next slot down`, () => {
        const at = lane.indexOf(from);
        expect(at, `"${from}" is not in ${view}'s lane at all`).toBeGreaterThanOrEqual(0);
        expect(lane[at + 1], `${view}: ${from}'s child should be ${lane[at + 1]}, not ${entry!.to}`).toBe(entry!.to);
      });
    }
  }

  it("every lane slot with something below it is reachable, or is a deliberate leaf", () => {
    // Not every slot needs a child — a leaf is a leaf — but a slot that HAS one must not be
    // silently unreachable, which is what a stale table entry would look like.
    for (const [view, slots] of Object.entries(CHILD_OF)) {
      const lane = ladderSlotIds(view as RailManifestState["mode"]);
      for (const from of Object.keys(slots ?? {})) expect(lane).toContain(from);
    }
  });
});

// Snapshots-first explorer (2026-08-06): only the two snapshot FLOORS carry display copy — the
// node layers are per-role containers (ledgerRails.ROLE_CODE) and no layer is committable.
it("the ledger explorer's floor vocabulary is exactly the two snapshot floors", () => {
  expect(LEDGER_LAYERS.map((l) => l.id).sort()).toEqual(["gl0", "msnap"]);
});
