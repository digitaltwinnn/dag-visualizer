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
  // R78 (user, 2026-10-29): a view is entered on its note — filtered or not, the note is the one
  // box on arrival and the carried subject cards fold to their entries beneath it.
  it.each(["geo", "ledger", "trend"] as const)("R78: a committed network arrives in %s on the note, the subject cards folded, exactly one box", (to) => {
    const hyper = rail(manifest({ filter: "dor" }), {}, ["network"]);
    // The effect runs on the first render of the NEW view, with the departing overrides.
    const arriving = (o: Overrides) => rail(manifest({ mode: to, filter: "dor", ...(to === "ledger" ? { snap: snapPick } : {}) }), o, ["snap", "network"]);
    const after = apply(hyper.overrides, overridesOnViewEntry(arriving(hyper.overrides)));
    expect(openBoxes(arriving(after))).toEqual(["notes"]);
    expect(isCollapsed(arriving(after), "context")).toBe(true);
  });
  it("R78: a subject box the reader opened by hand still yields to the note on arrival (supersedes EXPANDED STATE SURVIVES A VIEW SWITCH there)", () => {
    const m = manifest({ filter: "dor", inspect: nodePick });
    const hyper = rail(m, {}, ["node", "network"]);
    const opened = openByHand(hyper, "context");
    const arriving = (o: Overrides) => rail({ ...m, mode: "geo" }, o, ["node", "network"]);
    const after = apply(opened, overridesOnViewEntry(arriving(opened)));
    expect(openBoxes(arriving(after))).toEqual(["notes"]);
    expect(isCollapsed(arriving(after), "node")).toBe(true);
  });
  it("R78: the arrival pins are a selection moment's to drop — a click after it opens its own card and the note folds", () => {
    const geo = rail(manifest({ mode: "geo", filter: "dor" }), {}, ["network"]);
    const pinned = apply({}, overridesOnViewEntry(geo));
    expect(openBoxes(rail(manifest({ mode: "geo", filter: "dor" }), pinned, ["network"]))).toEqual(["notes"]);
    const clicked = rail(manifest({ mode: "geo", filter: "dor", country: "DE" }), pinned, ["country", "network"]);
    const dropped = apply(pinned, overridesOnSelection(clicked));
    expect(openBoxes(rail(manifest({ mode: "geo", filter: "dor", country: "DE" }), dropped, ["country", "network"]))).toEqual(["country"]);
  });
  it("R78: at Snapshots' entry the note stands alone and is pinned open; the late live tick lands folded under it, and a pinned tick still takes the box once the pins drop", () => {
    const entry = rail(manifest({ mode: "ledger" }));
    const after = apply({}, overridesOnViewEntry(entry));
    expect(after.notes).toBe(false);
    expect(openBoxes(rail(manifest({ mode: "ledger", snap: snapPick }), after))).toEqual(["notes"]);
    const pinnedTick = rail(manifest({ mode: "ledger", snap: snapPick }), after, ["snap"]);
    expect(openBoxes(rail(manifest({ mode: "ledger", snap: snapPick }), apply(after, overridesOnSelection(pinnedTick)), ["snap"]))).toEqual(["snap"]);
  });
  it("without a note (off mainnet, or none for the subject), a subject box the reader opened survives the switch, and nothing is pinned when the departing box was no subject", () => {
    const m = manifest({ filter: "dor", inspect: nodePick, noteAbsent: true });
    const hyper = rail(m, {}, ["node", "network"]);
    const opened = openByHand(hyper, "context");
    const arriving = (o: Overrides) => rail({ ...m, mode: "geo" }, o, ["node", "network"]);
    expect(openBoxes(arriving(apply(opened, overridesOnViewEntry(arriving(opened)))))).toEqual(["context"]);
    // The departing box was the note (in a view that had one); the arriving view has none: no pin, the auto rule.
    const withNote = rail(manifest({ filter: "dor" }), {}, ["network"]);
    const noteOpen = openByHand(withNote, "notes");
    const arrivingBare = (o: Overrides) => rail(manifest({ mode: "geo", filter: "dor", noteAbsent: true }), o, ["network"]);
    expect(openBoxes(arrivingBare(apply(noteOpen, overridesOnViewEntry(arrivingBare(noteOpen)))))).toEqual(["context"]);
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
