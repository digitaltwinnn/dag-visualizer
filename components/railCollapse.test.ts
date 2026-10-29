import { describe, it, expect } from "vitest";
import {
  boxedSlotOf, isCollapsed, openBoxes, openDefaultOf, overridesOnSelection, overridesOnViewEntry, railSelectionKey, subjectRunEnd,
  type LaneCollapseState, type SelectionKeyState,
} from "@/components/railCollapse";
import { detailsCards, focusSlotId, ladderSlotIds, type RailManifestState } from "@/components/railCards";
import type { PickDescriptor } from "@/src/data/types";

// THE RAIL'S COLLAPSE MACHINE BY OUTCOME (review M5, 2026-10-27). Each case builds the rail state the
// way Inspector does — the manifest's presence, `focusSlotId`, the store's overrides — and checks the
// one invariant the grammar rests on: whenever a lane card is present, EXACTLY ONE is the open box.
// I1 and I2 are the two ways the AI notes card (R57) broke it, driven through here end to end.

const snapPick = { kind: "snapshot", data: { ordinal: 42 } } as unknown as Extract<PickDescriptor, { kind: "snapshot" }>;
const nodePick = { kind: "metanode", node: { ip: "9.9.9.9" }, meta: { id: "dor" } } as unknown as PickDescriptor;

const manifest = (over: Partial<RailManifestState>): RailManifestState => ({
  mode: "hyper",
  filter: "all",
  inspect: null,
  snap: null,
  country: null,
  cohort: null,
  composition: null,
  selNodesCount: 10,
  filterLabel: null,
  noteAbsent: false,
  ...over,
});

type Overrides = Record<string, boolean | undefined>;
/** The rail state Inspector derives for this store slice and these overrides. */
function rail(m: RailManifestState, overrides: Overrides = {}, selStack: readonly string[] = []): LaneCollapseState {
  const cards = detailsCards(m);
  const present = (id: string) => cards.find((c) => c.id === id)?.present ?? false;
  return { lane: ladderSlotIds(m.mode), present, focusId: focusSlotId({ ...m, selStack }), overrides };
}
/** `store.setRailCollapseMany`: null deletes, a boolean sets. */
function apply(o: Overrides, writes: Record<string, boolean | null>): Overrides {
  const out = { ...o };
  for (const [id, v] of Object.entries(writes)) {
    if (v === null) delete out[id];
    else out[id] = v;
  }
  return out;
}
/** The rail's own accordion: open `id`, fold the other present lane cards (`openRailCard`). */
function openByHand(s: LaneCollapseState, id: string): Overrides {
  const folds = s.lane.filter((x) => x !== id && s.present(x));
  return { ...s.overrides, ...Object.fromEntries(folds.map((x) => [x, true])), [id]: false };
}

describe("the default box", () => {
  it("at rest the AI notes card is the one box (R57)", () => {
    const s = rail(manifest({}));
    expect(openDefaultOf(s)).toBe("notes");
    expect(openBoxes(s)).toEqual(["notes"]);
  });
  it("a subject card takes the box; the note rests folded above it", () => {
    const s = rail(manifest({ filter: "dor" }), {}, ["network"]);
    expect(openBoxes(s)).toEqual(["context"]);
    expect(isCollapsed(s, "notes")).toBe(true);
  });
  it("Snapshots: the LIVE tick leaves the note the box (R70); a PINNED tick takes it, under a folded note", () => {
    const live = rail(manifest({ mode: "ledger", snap: snapPick }));
    expect(boxedSlotOf(live)).toBe("notes");
    expect(openBoxes(live)).toEqual(["notes"]);
    const pinned = rail(manifest({ mode: "ledger", snap: snapPick }), {}, ["snap"]);
    expect(boxedSlotOf(pinned)).toBe("snap");
    expect(openBoxes(pinned)).toEqual(["snap"]);
  });
  it("History: the window's range and the front plane leave the note the box (R70); a brushed range takes it", () => {
    const rest = rail(manifest({ mode: "trend", trendFront: "dag" }));
    expect(openBoxes(rest)).toEqual(["notes"]);
    const brushed = rail(manifest({ mode: "trend", trendFront: "dag", trendRange: { fromMs: 1, toMs: 2 } }), {}, ["range"]);
    expect(openBoxes(brushed)).toEqual(["range"]);
  });
  it("opening the notes entry by hand makes it the one box", () => {
    const before = rail(manifest({ filter: "dor" }), {}, ["network"]);
    const s = { ...before, overrides: openByHand(before, "notes") };
    expect(openBoxes(s)).toEqual(["notes"]);
  });
});

describe("a view switch (`overridesOnViewEntry`)", () => {
  // I1 (review, 2026-10-27): Hypergraph on `dor`, notes opened by hand, then another view. The
  // entry used to pin `context: true` while the unpinned note yielded to the auto rule: no box.
  it.each(["geo", "ledger", "trend"] as const)("I1: notes opened by hand in Hypergraph → %s arrives with exactly one box, the subject card", (to) => {
    const hyper = rail(manifest({ filter: "dor" }), {}, ["network"]);
    const opened = openByHand(hyper, "notes");
    // The effect runs on the first render of the NEW view, with the departing overrides.
    const arriving = (o: Overrides) => rail(manifest({ mode: to, filter: "dor", ...(to === "ledger" ? { snap: snapPick } : {}) }), o, ["network"]);
    const after = apply(opened, overridesOnViewEntry(arriving(opened)));
    const boxes = openBoxes(arriving(after));
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).not.toBe("notes");
  });
  it("a subject box the reader opened survives the switch (EXPANDED STATE SURVIVES A VIEW SWITCH)", () => {
    // Hyper: a node committed, the reader re-boxed the Metagraph card.
    const m = manifest({ filter: "dor", inspect: nodePick });
    const hyper = rail(m, {}, ["node", "network"]);
    const opened = openByHand(hyper, "context");
    const arriving = (o: Overrides) => rail({ ...m, mode: "geo" }, o, ["node", "network"]);
    const after = apply(opened, overridesOnViewEntry(arriving(opened)));
    expect(openBoxes(arriving(after))).toEqual(["context"]);
  });
  it("the note is never pinned: at Snapshots' entry it stands alone, the late live tick lands under it, and a pinned tick takes the box", () => {
    const entry = rail(manifest({ mode: "ledger" }));
    expect(openBoxes(entry)).toEqual(["notes"]);
    const after = apply({}, overridesOnViewEntry(entry));
    expect(after.notes).toBeUndefined();
    expect(openBoxes(rail(manifest({ mode: "ledger", snap: snapPick }), after))).toEqual(["notes"]);
    expect(openBoxes(rail(manifest({ mode: "ledger", snap: snapPick }), after, ["snap"]))).toEqual(["snap"]);
  });
});

describe("a new selection moment (`railSelectionKey` + `overridesOnSelection`)", () => {
  const key = (over: Partial<SelectionKeyState>): string =>
    railSelectionKey({
      mode: "ledger", filter: "all", country: null, cohort: null, composition: null, inspect: null,
      trendCursorMs: null, trendRange: null, trendFocus: null, tickNet: null, following: false, snap: snapPick, metaSnap: null,
      ...over,
    });

  // I2 (review, 2026-10-27): a pinned tick, the notes entry opened by hand, then a step into one of
  // the tick's networks. The step re-pins the same ordinal, so without `tickNet` in the key nothing
  // moved, the overrides survived, and the note stayed open beside the arriving Metagraph card.
  it("I2: a network committed inside the pinned tick is a new moment, and the rail lands on one box", () => {
    const tickNet = { metaId: "dor", globalOrdinal: 42 };
    expect(key({ tickNet })).not.toBe(key({}));
    const pinned = rail(manifest({ mode: "ledger", snap: snapPick }), {}, ["snap"]);
    const opened = openByHand(pinned, "notes");
    const stepped = (o: Overrides) => rail(manifest({ mode: "ledger", snap: snapPick, tickNet }), o, ["network", "snap"]);
    // The failure the key change prevents: kept overrides leave two boxes.
    expect(openBoxes(stepped(opened))).toEqual(["notes", "context"]);
    const after = apply(opened, overridesOnSelection({ overrides: opened }));
    expect(openBoxes(stepped(after))).toEqual(["context"]);
  });
  it("while following, the live ordinals are not a new moment", () => {
    expect(key({ following: true, snap: snapPick })).toBe(key({ following: true, snap: { data: { ordinal: 43 } } }));
    expect(key({ following: false, snap: snapPick })).not.toBe(key({ following: false, snap: { data: { ordinal: 43 } } }));
  });
  it("clears every standing override", () => {
    expect(overridesOnSelection({ overrides: { notes: false, snap: true } })).toEqual({ notes: null, snap: null });
  });
});

describe("subjectRunEnd — the run the next-rung step reads", () => {
  it("skips the notes slot: it neither starts the run nor ends it", () => {
    const present = (ids: string[]) => (id: string) => ids.includes(id);
    expect(subjectRunEnd(ladderSlotIds("hyper"), present(["notes", "context"]))).toBe("context");
    expect(subjectRunEnd(ladderSlotIds("ledger"), present(["notes", "snap"]))).toBe("snap");
    expect(subjectRunEnd(ladderSlotIds("hyper"), present(["notes"]))).toBeNull();
    // A gap after the run still ends it.
    expect(subjectRunEnd(ladderSlotIds("geo"), present(["notes", "context", "node"]))).toBe("context");
  });
});
