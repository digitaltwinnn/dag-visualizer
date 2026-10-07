import { describe, expect, it } from "vitest";
import { CLOSED_PATH, pathViewChanged, syncLedgerPath, type LedgerPath, type LedgerPathView } from "./ledgerPath";

const view = (p: Partial<LedgerPathView> = {}): LedgerPathView => ({ metaSnap: null, snapOrd: null, following: false, metaSnapBoxed: false, ...p });
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

describe("syncLedgerPath — live, the path follows the Metagraph snapshot card", () => {
  const live = (p: Partial<LedgerPathView> = {}) => view({ following: true, ...p });
  it("opens down to the snapshot itself when that card becomes the box", () => {
    const next = syncLedgerPath(CLOSED_PATH, live({ metaSnap: ms(7, 120) }), live({ metaSnap: ms(7, 120), metaSnapBoxed: true }));
    expect(next).toEqual({ tick: 120, net: "dor", snap: "dor|7", selfResume: false });
  });
  it("moves with each snapshot the heartbeat commits while the card stays the box", () => {
    const at7 = { tick: 120, net: "dor", snap: "dor|7", selfResume: false };
    const next = syncLedgerPath(at7, live({ metaSnap: ms(7, 120), metaSnapBoxed: true }), live({ metaSnap: ms(8, 121), metaSnapBoxed: true }));
    expect(next).toEqual({ tick: 121, net: "dor", snap: "dor|8", selfResume: false });
  });
  it("goes back to the tick list when the box moves off the card", () => {
    const at7 = { tick: 120, net: "dor", snap: "dor|7", selfResume: false };
    expect(syncLedgerPath(at7, live({ metaSnap: ms(7, 120), metaSnapBoxed: true }), live({ metaSnap: ms(7, 120) }))).toEqual(CLOSED_PATH);
  });
  it("…but leaves a path the reader opened elsewhere alone", () => {
    expect(syncLedgerPath(open, live({ metaSnap: ms(7, 120), metaSnapBoxed: true }), live({ metaSnap: ms(7, 120) }))).toBe(open);
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
    expect(pathViewChanged(view(), view({ metaSnapBoxed: true }))).toBe(true);
  });
});
