import { describe, expect, it } from "vitest";
import { CLOSED_PATH, pathViewChanged, syncLedgerPath, type LedgerPath, type LedgerPathView } from "./ledgerPath";

const view = (p: Partial<LedgerPathView> = {}): LedgerPathView => ({ metaSnap: null, snapOrd: null, following: false, boxed: null, ...p });
const ms = (ordinal: number, globalOrdinal: number) => ({ metaId: "dor", ordinal, globalOrdinal, netKey: "dor" });
const open: LedgerPath = { tick: 100, net: "dor", snap: "dor|5", selfResume: false };

describe("syncLedgerPath", () => {
  it("a snapshot committed while pinned opens the path to it", () => {
    const next = syncLedgerPath(CLOSED_PATH, view(), view({ metaSnap: ms(7, 120), snapOrd: 120 }));
    expect(next).toEqual({ tick: 120, net: "dor", snap: null, selfResume: false });
  });
  it("keeps the signer level open only for the same snapshot", () => {
    const same = syncLedgerPath({ ...open, snap: "dor|7" }, view(), view({ metaSnap: ms(7, 120), snapOrd: 120 }));
    expect(same.snap).toBe("dor|7");
    const other = syncLedgerPath(open, view(), view({ metaSnap: ms(7, 120), snapOrd: 120 }));
    expect(other.snap).toBeNull();
  });
  it("the live follow's own commit leaves the path alone", () => {
    const prev = view({ following: true });
    expect(syncLedgerPath(CLOSED_PATH, prev, view({ following: true, metaSnap: ms(7, 120), snapOrd: 120 }))).toBe(CLOSED_PATH);
  });
  it("a tick pinned elsewhere re-points an open path, and closes its finer levels", () => {
    expect(syncLedgerPath(open, view({ snapOrd: 100 }), view({ snapOrd: 101 }))).toEqual({ ...CLOSED_PATH, tick: 101 });
  });
  it("…but not when the same commit carried a snapshot of that tick", () => {
    const next = syncLedgerPath(open, view({ snapOrd: 100 }), view({ snapOrd: 101, metaSnap: ms(9, 101) }));
    expect(next).toEqual({ tick: 101, net: "dor", snap: null, selfResume: false });
  });
  it("a pin with no tick open opens nothing", () => {
    expect(syncLedgerPath(CLOSED_PATH, view({ snapOrd: 100 }), view({ snapOrd: 101 }))).toBe(CLOSED_PATH);
  });
  it("resuming live closes the path", () => {
    expect(syncLedgerPath(open, view({ snapOrd: 100 }), view({ following: true, snapOrd: 130 }))).toBe(CLOSED_PATH);
  });
  it("…unless the resume is this explorer's own click, which keeps the path and spends the flag", () => {
    const mine = { ...open, selfResume: true };
    expect(syncLedgerPath(mine, view({ snapOrd: 100 }), view({ following: true, snapOrd: 130 }))).toEqual({ ...open, selfResume: false });
  });
});

describe("syncLedgerPath — the path mirrors the snapshot chain's box", () => {
  const live = (p: Partial<LedgerPathView> = {}) => view({ following: true, ...p });
  const atSnaps = { tick: 120, net: "dor", snap: null, selfResume: false };
  const atSigners = { tick: 120, net: "dor", snap: "dor|7", selfResume: false };
  it("the Metagraph snapshot card stands the path at the network's snapshots, its row washed", () => {
    expect(syncLedgerPath(CLOSED_PATH, live({ metaSnap: ms(7, 120) }), live({ metaSnap: ms(7, 120), boxed: "metaSnap" }))).toEqual(atSnaps);
  });
  it("the Node card takes it one level deeper, to the snapshot's signers", () => {
    expect(syncLedgerPath(atSnaps, live({ metaSnap: ms(7, 120), boxed: "metaSnap" }), live({ metaSnap: ms(7, 120), boxed: "node" }))).toEqual(atSigners);
    // …and back up when the snapshot card is re-boxed.
    expect(syncLedgerPath(atSigners, live({ metaSnap: ms(7, 120), boxed: "node" }), live({ metaSnap: ms(7, 120), boxed: "metaSnap" }))).toEqual(atSnaps);
  });
  it("a re-box mirrors while pinned too", () => {
    expect(syncLedgerPath(atSnaps, view({ metaSnap: ms(7, 120), boxed: "metaSnap" }), view({ metaSnap: ms(7, 120), boxed: "node" }))).toEqual(atSigners);
  });
  it("…but a pinned COMMIT keeps rule 2, so the explorer's own drill into the signers stands", () => {
    const drilled = { tick: 120, net: "dor", snap: "dor|7", selfResume: false };
    expect(syncLedgerPath(drilled, view({ boxed: "context" }), view({ metaSnap: ms(7, 120), snapOrd: 120, boxed: "metaSnap" }))).toEqual(drilled);
  });
  it("live, it moves with each snapshot the heartbeat commits while the card stays the box", () => {
    const next = syncLedgerPath(atSnaps, live({ metaSnap: ms(7, 120), boxed: "metaSnap" }), live({ metaSnap: ms(8, 121), boxed: "metaSnap" }));
    expect(next).toEqual({ tick: 121, net: "dor", snap: null, selfResume: false });
  });
  it("live, the heartbeat leaves the path alone under any other box", () => {
    expect(syncLedgerPath(CLOSED_PATH, live({ boxed: "context" }), live({ metaSnap: ms(7, 120), boxed: "context" }))).toBe(CLOSED_PATH);
  });
  it("live, it goes back to the tick list when the box leaves the chain", () => {
    expect(syncLedgerPath(atSnaps, live({ metaSnap: ms(7, 120), boxed: "metaSnap" }), live({ metaSnap: ms(7, 120), boxed: "context" }))).toEqual(CLOSED_PATH);
  });
  it("…but leaves a path the reader opened elsewhere alone", () => {
    expect(syncLedgerPath(open, live({ metaSnap: ms(7, 120), boxed: "metaSnap" }), live({ metaSnap: ms(7, 120), boxed: "context" }))).toBe(open);
  });
});

describe("syncLedgerPath — pinning the live tip", () => {
  it("re-points an open path when the followed tick is pinned in place", () => {
    // Browsing tick 100 while live; the card pins the live tip, 105 — no ordinal changes.
    const next = syncLedgerPath(open, view({ following: true, snapOrd: 105 }), view({ following: false, snapOrd: 105 }));
    expect(next).toEqual({ ...CLOSED_PATH, tick: 105 });
  });
});

describe("pathViewChanged", () => {
  it("sees a new snapshot, tick or follow state, and nothing else", () => {
    expect(pathViewChanged(view(), view())).toBe(false);
    expect(pathViewChanged(view(), view({ snapOrd: 1 }))).toBe(true);
    expect(pathViewChanged(view(), view({ following: true }))).toBe(true);
    expect(pathViewChanged(view(), view({ metaSnap: ms(1, 2) }))).toBe(true);
    expect(pathViewChanged(view(), view({ boxed: "metaSnap" }))).toBe(true);
  });
});
