import { describe, expect, it } from "vitest";
import { CLOSED_PATH, pathViewChanged, syncLedgerPath, type LedgerPath, type LedgerPathView } from "./ledgerPath";

const view = (p: Partial<LedgerPathView> = {}): LedgerPathView => ({ metaSnap: null, snapOrd: null, following: false, tickNet: null, ...p });
const ms = (ordinal: number, globalOrdinal: number) => ({ metaId: "dor", ordinal, globalOrdinal, netKey: "dor" });
const open: LedgerPath = { tick: 100, net: "dor", snap: "dor|5", selfResume: false };
const signersOf = (ordinal: number, tick: number): LedgerPath => ({ tick, net: "dor", snap: `dor|${ordinal}`, selfResume: false });

describe("syncLedgerPath — the path follows the selection", () => {
  it("a snapshot selected while pinned opens down to its signers", () => {
    expect(syncLedgerPath(CLOSED_PATH, view(), view({ metaSnap: ms(7, 120), snapOrd: 120 }))).toEqual(signersOf(7, 120));
  });
  it("…and so does the live follow's selection, moving when the network anchors a new one", () => {
    const live = (m: ReturnType<typeof ms>) => view({ following: true, metaSnap: m, snapOrd: m.globalOrdinal });
    const at7 = syncLedgerPath(CLOSED_PATH, view({ following: true }), live(ms(7, 120)));
    expect(at7).toEqual(signersOf(7, 120));
    expect(syncLedgerPath(at7, live(ms(7, 120)), live(ms(8, 125)))).toEqual(signersOf(8, 125));
  });
  it("a tick pinned elsewhere opens that tick, closing its finer levels", () => {
    expect(syncLedgerPath(open, view({ snapOrd: 100 }), view({ snapOrd: 101 }))).toEqual({ ...CLOSED_PATH, tick: 101 });
    expect(syncLedgerPath(CLOSED_PATH, view({ snapOrd: 100 }), view({ snapOrd: 101 }))).toEqual({ ...CLOSED_PATH, tick: 101 });
  });
  it("a snapshot of another tick than the shown one is not followed", () => {
    expect(syncLedgerPath(CLOSED_PATH, view(), view({ metaSnap: ms(7, 90), snapOrd: 101 }))).toEqual({ ...CLOSED_PATH, tick: 101 });
  });
  it("a network selected inside a pinned tick opens that network's snapshots there", () => {
    // The Metagraph ghost under a global snapshot, or the Metagraph card's ‹ ›, selects a network
    // INSIDE the tick (store.tickNet); the explorer follows it one level down.
    const next = syncLedgerPath({ ...CLOSED_PATH, tick: 100 }, view({ snapOrd: 100 }), view({ snapOrd: 100, tickNet: "dor" }));
    expect(next).toEqual({ tick: 100, net: "dor", snap: null, selfResume: false });
    // …and a step to another network moves it.
    expect(syncLedgerPath(next, view({ snapOrd: 100, tickNet: "dor" }), view({ snapOrd: 100, tickNet: "ded" }))).toEqual({ tick: 100, net: "ded", snap: null, selfResume: false });
  });
  it("a deselect leaves the reader where they are", () => {
    expect(syncLedgerPath(open, view({ metaSnap: ms(5, 100), snapOrd: 100 }), view({ snapOrd: 100 }))).toBe(open);
  });
});

describe("syncLedgerPath — the unfiltered live stream", () => {
  it("the heartbeat leaves the path alone: the tick list is the stream", () => {
    expect(syncLedgerPath(CLOSED_PATH, view({ following: true, snapOrd: 120 }), view({ following: true, snapOrd: 121 }))).toBe(CLOSED_PATH);
  });
  it("resuming live closes the path", () => {
    expect(syncLedgerPath(open, view({ snapOrd: 100 }), view({ following: true, snapOrd: 130 }))).toBe(CLOSED_PATH);
  });
  it("…unless the resume is this explorer's own click, which keeps the path and spends the flag", () => {
    const mine = { ...open, selfResume: true };
    expect(syncLedgerPath(mine, view({ snapOrd: 100 }), view({ following: true, snapOrd: 130 }))).toEqual({ ...open, selfResume: false });
  });
  it("pinning the live tip in place opens it (no ordinal changes)", () => {
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
    expect(pathViewChanged(view(), view({ tickNet: "dor" }))).toBe(true);
  });
});
