import { describe, it, expect } from "vitest";
import {
  boxedSlotOf, displayOrder, hasFoldControl, isCollapsed, openBoxes, openDefaultOf, overridesOnNoteStandDown, overridesOnSelection, overridesOnViewEntry, railSelectionKey, subjectRunEnd,
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
  // D3 (user, 2026-11-07): in the Blocks register live follows the newest block and the Block card
  // is the register's default box. The note pinned open on arrival stood beside the live block's
  // arriving box (two boxes, found live): where the register SEATS its own subject, the view is
  // entered on the auto rule instead — the note while nothing stands, the live block once it lands.
  it("D3: Blocks is entered on the auto rule, not the note's pin — the note alone, then the live block alone", () => {
    const block = { chain: "dag", hash: "h", ordinal: 42, anchorOrd: 42 };
    const blocks = (over: Partial<RailManifestState>) => manifest({ mode: "ledger", ledgerRegister: "blocks", ...over });
    const hyper = rail(manifest({}), {});
    const entry = { ...rail(blocks({}), hyper.overrides), seats: "block" };
    const after = apply(hyper.overrides, overridesOnViewEntry(entry));
    expect(openBoxes(rail(blocks({}), after))).toEqual(["notes"]);
    expect(openBoxes(rail(blocks({ snap: snapPick, block }), after))).toEqual(["block"]);
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

describe("the note's stand-down (`overridesOnNoteStandDown`)", () => {
  it("a view entered while its note is read pins the note open and the subjects folded; when the read then answers none, the pins drop and the focus rung is the box", () => {
    const m = manifest({ filter: "dor", inspect: nodePick });
    const arrive = (o: Overrides, over: Partial<RailManifestState> = {}) => rail({ ...m, mode: "geo", ...over }, o, ["node", "network"]);
    const pinned = apply({}, overridesOnViewEntry(arrive({})));
    expect(openBoxes(arrive(pinned))).toEqual(["notes"]);
    // The read answers none: the notes slot leaves the lane, and the pins alone leave NO box.
    const standDown = arrive(pinned, { noteAbsent: true });
    expect(openBoxes(standDown)).toEqual([]);
    const after = arrive(apply(pinned, overridesOnNoteStandDown(standDown)), { noteAbsent: true });
    expect(after.focusId).not.toBeNull();
    expect(openBoxes(after)).toEqual([after.focusId]);
  });

  it("writes nothing while the note stands, and nothing when no open pin rests on the notes slot", () => {
    const m = manifest({ filter: "dor", inspect: nodePick });
    expect(overridesOnNoteStandDown(rail(m, { node: true }, ["node", "network"]))).toEqual({});
    expect(overridesOnNoteStandDown(rail({ ...m, noteAbsent: true }, { node: true }, ["node", "network"]))).toEqual({});
    expect(overridesOnNoteStandDown(rail({ ...m, noteAbsent: true }, {}, ["node", "network"]))).toEqual({});
  });
});

describe("a new selection moment (`railSelectionKey` + `overridesOnSelection`)", () => {
  const key = (over: Partial<SelectionKeyState>): string =>
    railSelectionKey({
      mode: "ledger", filter: "all", railNet: null, country: null, cohort: null, composition: null, inspect: null,
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
  it("while following in the Blocks register, the live BLOCK advancing is not a new moment either (D3); a pinned block's is", () => {
    const a = { chain: "dag", hash: "a", ordinal: 1, anchorOrd: 1 };
    const b = { ...a, hash: "b" };
    expect(key({ following: true, block: a })).toBe(key({ following: true, block: b }));
    expect(key({ following: false, block: a })).not.toBe(key({ following: false, block: b }));
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
  it("a slot the rail does not draw at all is no gap: the Snapshots register's block slot", () => {
    const metaSnap = { metaId: "dor", ordinal: 7, hash: "h", globalOrdinal: 42, ts: "t" };
    const m = manifest({ mode: "ledger", filter: "dor", snap: snapPick, metaSnap, inspect: nodePick, nodeHere: true, noteAbsent: true });
    const cards = detailsCards(m);
    const present = (id: string) => cards.find((c) => c.id === id)?.present ?? false;
    const ghosted = (id: string) => cards.find((c) => c.id === id)?.hint != null;
    for (const id of ["snap", "context", "metaSnap", "node"]) expect(present(id), id).toBe(true);
    expect(present("block") || ghosted("block")).toBe(false);
    expect(subjectRunEnd(ladderSlotIds("ledger"), present, ghosted)).toBe("node");
    // In the Blocks register the same empty slot is a ghost, so it is a gap there.
    const b = detailsCards({ ...m, ledgerRegister: "blocks" });
    expect(subjectRunEnd(ladderSlotIds("ledger"), (id) => b.find((c) => c.id === id)?.present ?? false, (id) => b.find((c) => c.id === id)?.hint != null)).toBe("metaSnap");
  });
});

// GHOSTS SINK (user, 2026-10-31, option B of four): a ghost holding its ladder slot could sit above
// a real card and split the stack, so the chosen cards close up and the ghosts wait below them. The
// ghost that is the next step leads them: the slot under the deepest card is where a step is drawn.
describe("displayOrder", () => {
  const present = (ids: string[]) => (id: string) => ids.includes(id);
  const geo = ladderSlotIds("geo");
  it("draws the chosen cards first, in lane order, then the ghosts", () => {
    expect(displayOrder(geo, present(["notes", "country"]), [])).toEqual(["notes", "country", "context", "cohort", "node"]);
  });
  it("the next step's ghost leads the ghosts", () => {
    expect(displayOrder(geo, present(["notes", "country"]), ["cohort"])).toEqual(["notes", "country", "cohort", "context", "node"]);
  });
  it("closes a gap in the stack", () => {
    const lane = ladderSlotIds("ledger");
    expect(displayOrder(lane, present(["notes", "snap", "node"]), ["context"])).toEqual(["notes", "snap", "node", "context", "metaSnap", "block"]);
  });
  it("the next step never passes another step ghost: the Block ghost keeps its place above the node, and under the snapshot", () => {
    const lane = ladderSlotIds("ledger");
    expect(displayOrder(lane, present(["notes", "snap", "context", "metaSnap"]), ["node", "block"])).toEqual(["notes", "snap", "context", "metaSnap", "block", "node"]);
    expect(displayOrder(lane, present(["notes", "snap"]), ["context", "block"])).toEqual(["notes", "snap", "context", "metaSnap", "block", "node"]);
  });
  it("is the lane itself with nothing chosen, and with everything", () => {
    expect(displayOrder(geo, present([]), [])).toEqual(geo);
    expect(displayOrder(geo, present(geo), [])).toEqual(geo);
  });
});

// A BROWSED NETWORK IS A CHOICE (user, 2026-10-31: "the AI card does not collapse"): arriving in a
// view pins the note open, and only a new selection moment drops that pin.
describe("railSelectionKey and the browsed network", () => {
  const state = { mode: "hyper", filter: "all", railNet: null, country: null, cohort: null, composition: null, inspect: null, trendCursorMs: null, trendRange: null, trendFocus: null, tickNet: null, following: false, snap: null, metaSnap: null } as SelectionKeyState;
  it("browsing a network is a new moment, and so is each swipe", () => {
    const rest = railSelectionKey(state);
    const dag = railSelectionKey({ ...state, railNet: "dag" });
    expect(dag).not.toBe(rest);
    expect(railSelectionKey({ ...state, railNet: "dor" })).not.toBe(dag);
  });
});

describe("hasFoldControl — who wears the −", () => {
  it("the AI notes card everywhere, a subject card only on the phone", () => {
    expect(hasFoldControl("notes", false)).toBe(true);
    expect(hasFoldControl("notes", true)).toBe(true);
    expect(hasFoldControl("context", false)).toBe(false);
    expect(hasFoldControl("node", false)).toBe(false);
    expect(hasFoldControl("context", true)).toBe(true);
    expect(hasFoldControl("snap", true)).toBe(true);
  });
});

// THE BLOCK CARD (the Blocks register, 2026-11-05): a block commit pins its tick and commits the
// block, and the block's card is the box — under a folded Global snapshot entry, the note folded
// above both. And the commit is a selection moment, so a hand-opened card above does not stay open
// beside it.
describe("a block commit opens its card", () => {
  const block = { chain: "dag", hash: "abc", ordinal: 42, anchorOrd: 42 };
  const blocks = (over: Partial<RailManifestState> = {}) => manifest({ mode: "ledger", ledgerRegister: "blocks", snap: snapPick, ...over });
  it("the block slot is the box", () => {
    const s = rail(blocks({ block }), {}, ["block", "snap"]);
    expect(openBoxes(s)).toEqual(["block"]);
    expect(boxedSlotOf(s)).toBe("block");
    expect(isCollapsed(s, "snap")).toBe(true);
    expect(isCollapsed(s, "notes")).toBe(true);
  });
  it("it stands under the Global snapshot card, ahead of every ghost", () => {
    const s = rail(blocks({ block }), {}, ["block", "snap"]);
    const order = displayOrder(s.lane, s.present, []);
    expect(order.slice(0, 3)).toEqual(["notes", "snap", "block"]);
  });
  it("the commit is a new selection moment, and so is another block", () => {
    const key = (b: typeof block | null): string =>
      railSelectionKey({
        mode: "ledger", filter: "all", railNet: null, country: null, cohort: null, composition: null, inspect: null,
        trendCursorMs: null, trendRange: null, trendFocus: null, tickNet: null, following: false, snap: snapPick, metaSnap: null, block: b,
      });
    expect(key(block)).not.toBe(key(null));
    expect(key({ ...block, hash: "def" })).not.toBe(key(block));
  });
  it("with the box opened by hand on the tick, the commit's moment drops the pin and the block opens", () => {
    const before = rail(blocks(), {}, ["snap"]);
    const opened = openByHand(before, "snap");
    const after = rail(blocks({ block }), opened, ["block", "snap"]);
    const dropped = apply(opened, overridesOnSelection(after));
    expect(openBoxes(rail(blocks({ block }), dropped, ["block", "snap"]))).toEqual(["block"]);
  });
});
