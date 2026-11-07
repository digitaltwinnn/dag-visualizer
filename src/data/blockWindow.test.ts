import { describe, expect, it } from "vitest";
import { BLOCK_WINDOW_TICKS, blockChainOf, blockWanted, blockWindowContinues, foldBlockWindow, liveWindowRuns, mergeLiveAnswer, newestBlock, tipJoins, trailPath, windowBlocks } from "@/src/data/blockWindow";
import { UNLISTED_ID } from "@/src/data/unlistedId";
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
    // The Snapshots register reads the live window too (D3: the switch states its span), and a pin
    // there never re-centres it; outside the view nothing is wanted.
    expect(blockWanted({ ledger: true, register: "snapshots", pin: 50, held: null, liveNewest: 900 })).toEqual({ kind: "fetch", around: null });
    expect(blockWanted({ ledger: true, register: "snapshots", pin: 50, held: { from: 400, to: 900 }, liveNewest: 900 })).toEqual({ kind: "keep" });
    expect(blockWanted({ ledger: false, register: "blocks", pin: null, held: null, liveNewest: 900 })).toEqual({ kind: "clear" });
  });
  it("while the Briefing runs, the live window is read ahead in any view and register, and held", () => {
    expect(blockWanted({ ledger: false, register: "snapshots", pin: null, held: null, liveNewest: 900, touring: true })).toEqual({ kind: "fetch", around: null });
    expect(blockWanted({ ledger: true, register: "snapshots", pin: 50, held: null, liveNewest: 900, touring: true })).toEqual({ kind: "fetch", around: null });
    expect(blockWanted({ ledger: false, register: "snapshots", pin: null, held: { from: 400, to: 900 }, liveNewest: 900, touring: true })).toEqual({ kind: "keep" });
    // The tour over, a view outside the register lets it go.
    expect(blockWanted({ ledger: false, register: "snapshots", pin: null, held: { from: 400, to: 900 }, liveNewest: 900, touring: false })).toEqual({ kind: "clear" });
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

describe("windowBlocks", () => {
  const tick = (ord: number, blocks: string[], meta: Record<string, RawMetaSnapshot[]> = {}) => ({ ord, ts: new Date(ord * 10_000).toISOString(), hash: "g" + ord, blocks, metaSnaps: meta });
  const snap = (ordinal: number, blocks?: string[]) => ({ ordinal, hash: "m" + ordinal, lastSnapshotHash: "", timestamp: "", blocks }) as unknown as RawMetaSnapshot;
  it("lists every block of the window newest first: a tick's DAG blocks, then its token blocks, each on its accepting snapshot", () => {
    const w = foldBlockWindow({
      ticks: [tick(100, ["d0"]), tick(300, ["d1", "d2"], { dor: [snap(51, ["t1"]), snap(52, ["t2", "t3"])], ded: [snap(9)] }), tick(200, [], { dor: [snap(40, ["t0"])] })],
      chains: ["dag", "dor", "ded"],
    }, {});
    expect(windowBlocks(w).map((b) => `${b.chain}:${b.hash}@${b.ordinal}/${b.anchorOrd}`)).toEqual([
      "dag:d1@300/300", "dag:d2@300/300", "dor:t2@52/300", "dor:t3@52/300", "dor:t1@51/300",
      "dor:t0@40/200",
      "dag:d0@100/100",
    ]);
    // Each carries its accepting tick's time, for the door onto its records.
    expect(windowBlocks(w)[0]!.ts).toBe(new Date(300 * 10_000).toISOString());
  });
  it("an absent window lists nothing", () => {
    expect(windowBlocks(null)).toEqual([]);
  });
});

describe("newestBlock — what LIVE follows in the Blocks register (D3)", () => {
  const tick = (ord: number, blocks: string[], meta: Record<string, RawMetaSnapshot[]> = {}) => ({ ord, ts: new Date(ord * 10_000).toISOString(), hash: "g" + ord, blocks, metaSnaps: meta });
  const snap = (ordinal: number, blocks?: string[]) => ({ ordinal, hash: "m" + ordinal, lastSnapshotHash: "", timestamp: "", blocks }) as unknown as RawMetaSnapshot;
  it("under All: the window's newest block, whatever its chain", () => {
    const w = foldBlockWindow({ ticks: [tick(300, [], { dor: [snap(52, ["t2"])] }), tick(200, ["d1"])], chains: ["dag", "dor"] }, {});
    expect(newestBlock(w)).toEqual({ chain: "dor", hash: "t2", ordinal: 52, anchorOrd: 300, ts: new Date(300 * 10_000).toISOString() });
  });
  it("under a network's window: that network's newest block — the DAG blocks sharing its ticks are the lens's, not the follow's", () => {
    const w = foldBlockWindow({ ticks: [tick(300, ["d2"]), tick(200, ["d1"], { dor: [snap(40, ["t0"])] })], chains: ["dor"], chain: "dor" }, {});
    expect(newestBlock(w)?.hash).toBe("t0");
    const dag = foldBlockWindow({ ticks: [tick(300, [], { dor: [snap(52, ["t2"])] }), tick(200, ["d1"])], chains: ["dag"], chain: "dag" }, {});
    expect(newestBlock(dag)?.hash).toBe("d1");
  });
  it("no window, or a window with no block of its network: nothing to follow", () => {
    expect(newestBlock(null)).toBeNull();
    expect(newestBlock(foldBlockWindow({ ticks: [tick(300, ["d2"])], chains: ["dor"], chain: "dor" }, {}))).toBeNull();
  });
});

describe("mergeLiveAnswer", () => {
  const tick = (ord: number, blocks: string[] = ["b" + ord], metaSnaps: Record<string, RawMetaSnapshot[]> = {}) => ({ ord, ts: `2026-01-01T00:00:${String(ord % 60).padStart(2, "0")}Z`, hash: "h" + ord, blocks, metaSnaps });
  const ans = (...ords: number[]) => ({ ticks: ords.map((o) => tick(o)), chains: [] as string[] });

  it("keeps a held appended tick newer than the answer", () => {
    const r = mergeLiveAnswer(ans(105, 104, 103), ans(104, 103, 102));
    expect(r.ticks.map((t) => t.ord)).toEqual([105, 104, 103, 102]);
  });
  it("takes the answer's version of a tick both hold", () => {
    const rich = { ...tick(105), metaSnaps: { m: [{} as RawMetaSnapshot] } };
    const r = mergeLiveAnswer(ans(105, 104), { ticks: [rich, tick(104)], chains: ["m"] });
    expect(r.ticks[0]).toBe(rich);
    expect(r.ticks).toHaveLength(2);
  });
  it("cuts to the window", () => {
    const held = ans(...Array.from({ length: BLOCK_WINDOW_TICKS }, (_, i) => 1000 - i));
    const answer = ans(...Array.from({ length: BLOCK_WINDOW_TICKS }, (_, i) => 990 - i));
    const r = mergeLiveAnswer(held, answer);
    expect(r.ticks).toHaveLength(BLOCK_WINDOW_TICKS);
    expect(r.ticks[0]!.ord).toBe(1000);
  });
  it("is the answer when nothing held is newer, or nothing is held", () => {
    const a = ans(105, 104);
    expect(mergeLiveAnswer(null, a)).toBe(a);
    expect(mergeLiveAnswer(ans(104, 103), a)).toBe(a);
  });
});

describe("liveWindowRuns", () => {
  const base = { liveWanted: true, touring: false, following: true, pin: null as number | null, held: { from: 400, to: 900 } as { from: number; to: number } | null, heldLive: true };
  it("keeps the live refresh and append running while following, and while the tour reads ahead", () => {
    expect(liveWindowRuns(base)).toBe(true);
    expect(liveWindowRuns({ ...base, following: false, touring: true })).toBe(true);
  });
  it("keeps them running under a pin the held LIVE window covers — the band is the live instrument", () => {
    expect(liveWindowRuns({ ...base, following: false, pin: 500 })).toBe(true);
    expect(liveWindowRuns({ ...base, following: false, pin: 900 })).toBe(true);
  });
  it("stops them for a pin outside the window, or a held window that is a pin's own (a past window)", () => {
    expect(liveWindowRuns({ ...base, following: false, pin: 50 })).toBe(false);
    expect(liveWindowRuns({ ...base, following: false, pin: 500, heldLive: false })).toBe(false);
    expect(liveWindowRuns({ ...base, following: false, pin: 500, held: null })).toBe(false);
  });
  it("stops them outside the register, and with neither a follow nor a pin", () => {
    expect(liveWindowRuns({ ...base, liveWanted: false })).toBe(false);
    expect(liveWindowRuns({ ...base, following: false })).toBe(false);
  });
  it("a pin inside the live window agrees with blockWanted's keep, so the merge refresh is what moves it", () => {
    expect(blockWanted({ ledger: true, register: "blocks", pin: 500, held: base.held, liveNewest: 950 })).toEqual({ kind: "keep" });
    // …and the 30 s refresh it keeps running merges forward, never dropping the newer held ticks.
    const tick = (ord: number) => ({ ord, ts: "t", hash: "h" + ord, blocks: ["b"], metaSnaps: {} });
    const held = { ticks: [tick(905), tick(900), tick(500)], chains: [] };
    expect(mergeLiveAnswer(held, { ticks: [tick(910), tick(900), tick(500)], chains: [] }).ticks.map((t) => t.ord)).toEqual([910, 900, 500]);
  });
});

describe("the window under a network filter (D4)", () => {
  it("the trail is asked for the filter's network; All asks for every network", () => {
    expect(blockChainOf("all")).toBeNull();
    expect(blockChainOf("dag")).toBe("dag");
    expect(blockChainOf("DOR")).toBe("DOR");
    expect(trailPath(null, null)).toBe(`/api/blocks/trail?around=live&n=${BLOCK_WINDOW_TICKS}`);
    expect(trailPath(500, "DAG0x")).toBe(`/api/blocks/trail?around=500&n=${BLOCK_WINDOW_TICKS}&chain=DAG0x`);
  });
  it("a filter change refetches: a held window read for another network is not held", () => {
    const base = { ledger: true, register: "blocks" as const, liveNewest: 900 };
    const held = { from: 400, to: 900, chain: null };
    expect(blockWanted({ ...base, pin: null, held, chain: null })).toEqual({ kind: "keep" });
    expect(blockWanted({ ...base, pin: null, held, chain: "DOR" })).toEqual({ kind: "fetch", around: null });
    expect(blockWanted({ ...base, pin: 500, held, chain: "DOR" })).toEqual({ kind: "fetch", around: 500 });
    expect(blockWanted({ ...base, pin: 500, held: { ...held, chain: "DOR" }, chain: "DOR" })).toEqual({ kind: "keep" });
  });
  it("an unlisted network is not read: the window is the stated floor, never fetched", () => {
    expect(blockWanted({ ledger: true, register: "blocks", pin: null, held: null, liveNewest: 900, chain: UNLISTED_ID })).toEqual({ kind: "unread" });
    expect(blockWanted({ ledger: true, register: "blocks", pin: 50, held: null, liveNewest: 900, chain: UNLISTED_ID })).toEqual({ kind: "unread" });
    // Outside the register nothing is wanted, unlisted or not.
    expect(blockWanted({ ledger: false, register: "blocks", pin: null, held: null, liveNewest: 900, chain: UNLISTED_ID })).toEqual({ kind: "clear" });
  });
  it("a live refresh for another network replaces the window, never merges into it", () => {
    const tick = (ord: number) => ({ ord, ts: "t", hash: "h" + ord, blocks: ["b"], metaSnaps: {} });
    const held = { ticks: [tick(905), tick(900)], chains: [] };
    const dor = { ticks: [tick(700), tick(600)], chains: ["DOR"], chain: "DOR" };
    expect(mergeLiveAnswer(held, dor)).toBe(dor);
    expect(mergeLiveAnswer({ ...dor, ticks: [tick(705), ...dor.ticks] }, dor).ticks.map((t) => t.ord)).toEqual([705, 700, 600]);
  });
  it("the window carries its network and the chains its walk cut short", () => {
    const w = foldBlockWindow({ ticks: [], chains: ["DOR"], chain: "DOR", partial: ["DOR"] }, {});
    expect(w.chain).toBe("DOR");
    expect(w.partial).toEqual(["DOR"]);
    const all = foldBlockWindow({ ticks: [], chains: [] }, {});
    expect(all.chain).toBeNull();
    expect(all.partial).toEqual([]);
  });
  it("the live feed's announced tick (DAG blocks) joins only a window that holds the DAG's own ticks", () => {
    expect(tipJoins(null)).toBe(true);
    expect(tipJoins("dag")).toBe(true);
    expect(tipJoins("DOR")).toBe(false);
  });
});
