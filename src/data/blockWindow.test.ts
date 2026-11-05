import { describe, expect, it } from "vitest";
import { BLOCK_WINDOW_TICKS, blockWanted, blockWindowContinues, foldBlockWindow } from "@/src/data/blockWindow";
import type { RawMetaSnapshot, SnapshotExact } from "@/src/data/types";

describe("foldBlockWindow", () => {
  const tick = (ord: number, blocks: string[], meta: Record<string, RawMetaSnapshot[]> = {}) => ({ ord, ts: new Date(ord * 10_000).toISOString(), hash: "g" + ord, blocks, metaSnaps: meta });
  const dor = (ordinal: number, blocks: string[]) => ({ ordinal, hash: "m" + ordinal, lastSnapshotHash: "", timestamp: "", blocks }) as unknown as RawMetaSnapshot;
  it("one slot for a global that holds a DAG block AND an anchored token block", () => {
    const w = foldBlockWindow({ ticks: [tick(200, ["d1"], { dor: [dor(5, ["t1"])] }), tick(100, ["d0"])], chains: ["dag", "dor"] }, {});
    expect(w.globalSnapshots.map((g) => g.ordinal)).toEqual([100, 200]);
    expect(w.blockTick(200)?.blocks).toEqual(["d1"]);
    expect(w.metaSnaps.get("dor")?.[0].blockHashes).toEqual(["t1"]);
    expect(w.holds(200)).toBe(true); expect(w.holds(150)).toBe(false);
  });
  it("anchors read the exact fold where it landed, else the block-bearing floor", () => {
    const w = foldBlockWindow({ ticks: [tick(200, [], { dor: [dor(5, ["t1"]), dor(6, ["t2"])] })], chains: ["dag", "dor"] },
      { 200: { ordinal: 200, perMeta: { dor: { count: 13, fee: 0, bytes: 0 } } } as unknown as SnapshotExact });
    expect(w.getAnchor(w.globalSnapshots[0].timestamp)?.metaCounts.get("dor")).toBe(13);
    const floor = foldBlockWindow({ ticks: [tick(200, [], { dor: [dor(5, ["t1"]), dor(6, ["t2"])] })], chains: ["dag", "dor"] }, {});
    const a = floor.getAnchor(floor.globalSnapshots[0].timestamp);
    expect(a?.metaCounts.get("dor")).toBe(2);
    expect(a?.touched).toBe(0);
  });
  it("holds the live buffer's 52 ticks", () => {
    expect(BLOCK_WINDOW_TICKS).toBe(52);
  });
});
describe("blockWanted", () => {
  it("fetches around the live edge on entering the register, keeps a held window that holds the pin, re-centres on a pin outside it", () => {
    expect(blockWanted({ ledger: true, register: "blocks", pin: null, held: null, liveNewest: 900 })).toEqual({ kind: "fetch", around: null });
    expect(blockWanted({ ledger: true, register: "blocks", pin: 500, held: { from: 400, to: 900 }, liveNewest: 900 })).toEqual({ kind: "keep" });
    expect(blockWanted({ ledger: true, register: "blocks", pin: 50, held: { from: 400, to: 900 }, liveNewest: 900 })).toEqual({ kind: "fetch", around: 50 });
    expect(blockWanted({ ledger: true, register: "snapshots", pin: 50, held: null, liveNewest: 900 })).toEqual({ kind: "clear" });
    expect(blockWanted({ ledger: false, register: "blocks", pin: null, held: null, liveNewest: 900 })).toEqual({ kind: "clear" });
  });
});

describe("blockWindowContinues", () => {
  const tick = (ord: number) => ({ ord, ts: new Date(ord * 10_000).toISOString(), hash: "g" + ord, blocks: ["b" + ord], metaSnaps: {} });
  const win = (...ords: number[]) => foldBlockWindow({ ticks: ords.map(tick), chains: ["dag"] }, {});
  it("a window that keeps the newest tick and gains at most one advances the trail", () => {
    expect(blockWindowContinues(300, win(100, 200, 300))).toBe(true); // a refold of the same ticks
    expect(blockWindowContinues(300, win(200, 300, 400))).toBe(true); // one new block tick at the front
  });
  it("anything else is another stretch: none before, none now, a lost tick, a jump", () => {
    expect(blockWindowContinues(null, win(100))).toBe(false);
    expect(blockWindowContinues(300, null)).toBe(false);
    expect(blockWindowContinues(300, win(10, 20, 30))).toBe(false);
    expect(blockWindowContinues(300, win(300, 400, 500))).toBe(false);
  });
});
