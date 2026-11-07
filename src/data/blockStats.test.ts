import { describe, it, expect } from "vitest";
import { BLOCK_WINDOW_TICKS, type BlockTick } from "@/src/data/blockWindow";
import { blockScopeOf, blocksByNetwork, blocksInTick, blocksInWindow, blocksPerHourBins, BLOCK_BINS_MAX, lastBlockAt, movedChainOf, movedInWindow, movedPerHourBins } from "@/src/data/blockStats";
import { blockReadKey } from "@/src/data/blockReads";
import type { BlockRead } from "@/src/engine/domain/blockBraid";
import type { RawMetaSnapshot } from "@/src/data/types";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const H = 60;
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const tick = (ord: number, min: number, blocks: string[], metaSnaps: BlockTick["metaSnaps"] = {}): BlockTick => ({ ord, ts: ago(min), hash: `h${ord}`, blocks, metaSnaps });
const snap = (blocks: string[], ordinal = 1) => ({ ordinal, blocks }) as unknown as RawMetaSnapshot;
/** A full window (the tick budget) spread evenly from 1 minute ago back `spanMin`. */
const full = (spanMin: number) => Array.from({ length: BLOCK_WINDOW_TICKS }, (_, i) => tick(100 - i, 1 + (i * (spanMin - 1)) / (BLOCK_WINDOW_TICKS - 1), ["x"]));
const read = (hash: string, amounts: number[]): BlockRead => ({
  hash, height: 1, parents: [], txCount: amounts.length, amount: amounts.reduce((s, a) => s + a, 0), fee: 0, signers: 3,
  transfers: amounts.map((amount) => ({ from: "a", to: "b", amount, fee: 0 })),
});

describe("blocksInTick", () => {
  it("counts the global's own blocks and every anchored snapshot's token blocks", () => {
    expect(blocksInTick(tick(1, 1, ["a", "b"], { dor: [snap(["c"]), snap(["d", "e"])], x: [snap([])] }))).toBe(5);
  });
  it("or one network's alone: the DAG's on the global, a token chain's on its snapshots", () => {
    const t = tick(3, 5, ["a"], { dor: [snap(["t1", "t2"])], ded: [snap(["e1"])] });
    expect(blocksInTick(t, "dor")).toBe(2);
    expect(blocksInTick(t, "dag")).toBe(1);
    expect(blocksInTick(t, null)).toBe(4);
  });
});

describe("blockScopeOf — which chain's cut makes the window short (D4 carry, D3)", () => {
  it("under All any cut chain does; under a network filter only that network's own", () => {
    expect(blockScopeOf({ chain: null, partial: ["DOR"] })).toEqual({ chain: null, cut: true });
    expect(blockScopeOf({ chain: "USDC", partial: ["DOR"] })).toEqual({ chain: "USDC", cut: false });
    expect(blockScopeOf({ chain: "DOR", partial: ["DOR"] })).toEqual({ chain: "DOR", cut: true });
    expect(blockScopeOf({ chain: "dag", partial: ["DOR"] })).toEqual({ chain: "dag", cut: false });
    expect(blockScopeOf(null)).toEqual({ chain: null, cut: false });
  });
});

describe("blocksInWindow — BLOCKS, the window's count", () => {
  it("counts every block the window holds, DAG and token, however old", () => {
    const ticks = [tick(3, 5, ["a"], { dor: [snap(["t1", "t2"])] }), tick(2, 59, ["b"]), tick(1, 20 * H, ["c", "d"])];
    expect(blocksInWindow(ticks, NOW)).toEqual({ count: 6, floor: false });
  });
  it("or the scope's network's alone", () => {
    const ticks = [tick(3, 5, ["a"], { dor: [snap(["t1", "t2"])] }), tick(2, 70, [], { dor: [snap(["old"])] })];
    expect(blocksInWindow(ticks, NOW, { chain: "dor" })).toEqual({ count: 3, floor: false });
  });
  it("is 0, not a floor, for an empty window", () => {
    expect(blocksInWindow([], NOW)).toEqual({ count: 0, floor: false });
  });
  it("is a floor when a FULL window does not reach back an hour", () => {
    expect(blocksInWindow(full(30), NOW)).toEqual({ count: BLOCK_WINDOW_TICKS, floor: true });
  });
  it("is exact when a full window reaches back past an hour", () => {
    expect(blocksInWindow(full(90), NOW).floor).toBe(false);
  });
  it("is exact when a window below the cap spans under an hour (it holds all history)", () => {
    expect(blocksInWindow(full(30).slice(0, 10), NOW).floor).toBe(false);
  });
  it("a window its walk cut short (`cut`) is read like a full one", () => {
    const short = [tick(2, 1, [], { dor: [snap(["a"])] }), tick(1, 20, [], { dor: [snap(["b"])] })];
    expect(blocksInWindow(short, NOW, { chain: "dor", cut: true })).toEqual({ count: 2, floor: true });
    expect(blocksInWindow(short, NOW, { chain: "dor" }).floor).toBe(false);
  });
});

describe("blocksPerHourBins — the BLOCKS sparkline, per hour across the window's span", () => {
  it("bins whole hours ending at the frame's end, oldest first; an hour with no tick is zero blocks", () => {
    const ticks = [tick(3, 10, ["a", "b"]), tick(2, 70, ["c"]), tick(1, 5 * H + 30, ["d"])];
    const v = blocksPerHourBins(ticks, NOW);
    expect(v).toEqual([1, 0, 0, 0, 1, 2]);
  });
  it("is at least one hour long", () => {
    expect(blocksPerHourBins([tick(1, 10, ["a"])], NOW)).toEqual([1]);
    expect(blocksPerHourBins([], NOW)).toEqual([]);
  });
  it("counts the scope's network alone", () => {
    const ticks = [tick(2, 10, ["a"], { dor: [snap(["t"])] }), tick(1, 70, ["b"])];
    expect(blocksPerHourBins(ticks, NOW, { chain: "dor" })).toEqual([0, 1]);
  });
  it("leaves a bin wholly older than a FULL (or cut) window's oldest tick as a gap, never a zero", () => {
    // A frame stretched past the window's reach (a pinned end after its newest tick does not move
    // the start): the hour the window cannot vouch for is null.
    const ticks = [tick(2, 10, ["a"]), tick(1, 50, ["b"])];
    expect(blocksPerHourBins(ticks, NOW, { cut: true }, 3)).toEqual([null, null, 2]);
    expect(blocksPerHourBins(ticks, NOW, {}, 3)).toEqual([0, 0, 2]);
  });
  it("bounds the frame (`BLOCK_BINS_MAX`) — a quiet network's window reaching back weeks", () => {
    expect(blocksPerHourBins([tick(2, 10, ["a"]), tick(1, 200 * 24 * H, ["b"])], NOW)).toHaveLength(BLOCK_BINS_MAX);
  });
});

describe("movedChainOf — whose amount MOVED states", () => {
  it("the DAG's under All (a mixed-unit sum across tokens is never stated) and under the DAG filter; else the filter's", () => {
    expect(movedChainOf(null)).toBe("dag");
    expect(movedChainOf("dag")).toBe("dag");
    expect(movedChainOf("DOR")).toBe("DOR");
  });
});

describe("movedInWindow — MOVED, the sum of the window's transfer amounts", () => {
  const ticks = [tick(3, 10, ["a"], { dor: [snap(["t1"], 52)] }), tick(2, 70, ["b"]), tick(1, 90, ["c"])];
  const reads = {
    [blockReadKey("dag", 3)]: { blocks: [read("a", [10, 5])] },
    [blockReadKey("dag", 2)]: { blocks: [read("b", [100])] },
    [blockReadKey("DOR", 52)]: { blocks: [read("t1", [7])] },
  };
  it("sums the transfers of the chain's blocks whose read landed, and says how many were read of how many", () => {
    expect(movedInWindow(ticks, reads, "dag")).toEqual({ amount: 115, read: 2, total: 3 });
  });
  it("a token chain's own blocks in its own unit — never the DAG's beside them", () => {
    expect(movedInWindow([tick(3, 10, ["a"], { DOR: [snap(["t1"], 52)] })], reads, "DOR")).toEqual({ amount: 7, read: 1, total: 1 });
  });
  it("is null with no read landed: nothing measured is not zero moved", () => {
    expect(movedInWindow(ticks, {}, "dag")).toEqual({ amount: null, read: 0, total: 3 });
  });
  it("is 0 for a window holding none of the chain's blocks", () => {
    expect(movedInWindow(ticks, reads, "DED")).toEqual({ amount: 0, read: 0, total: 0 });
  });
  it("sums the read's own `amount` (the decoder's transfer sum) — a read cached before `transfers` was carried still counts (M4)", () => {
    const old = { ...read("a", []), amount: 40, transfers: undefined } as unknown as BlockRead;
    const r = { [blockReadKey("dag", 3)]: { blocks: [old] } };
    expect(movedInWindow([tick(3, 10, ["a"])], r, "dag")).toEqual({ amount: 40, read: 1, total: 1 });
    expect(movedPerHourBins([tick(3, 10, ["a"])], r, NOW, "dag")).toEqual([40]);
  });
});

describe("movedPerHourBins — the MOVED sparkline", () => {
  const ticks = [tick(3, 10, ["a"]), tick(2, 70, ["b"]), tick(1, 150, ["c"])];
  const reads = { [blockReadKey("dag", 3)]: { blocks: [read("a", [4])] }, [blockReadKey("dag", 1)]: { blocks: [read("c", [9])] } };
  it("sums each hour's read blocks; an hour holding a block whose read has not landed is a gap, never a floor drawn whole", () => {
    expect(movedPerHourBins(ticks, reads, NOW, "dag")).toEqual([9, null, 4]);
  });
  it("an hour with no block of the chain is zero moved", () => {
    expect(movedPerHourBins([tick(3, 10, ["a"]), tick(1, 150, ["c"])], reads, NOW, "dag")).toEqual([9, 0, 4]);
  });
});

describe("blocksByNetwork — BY NETWORK, the share of the window's blocks", () => {
  const ticks = [tick(2, 10, ["a", "b"], { DOR: [snap(["t1", "t2", "t3"])], USDC: [snap(["u"])] }), tick(1, 70, ["c"])];
  it("one row per network holding a block, the DAG first, then the catalog's order (never the counts')", () => {
    expect(blocksByNetwork(ticks, null, ["DED", "USDC", "DOR"])).toEqual([
      { chain: "dag", count: 3 },
      { chain: "USDC", count: 1 },
      { chain: "DOR", count: 3 },
    ]);
  });
  it("one row under a filter — the filter's network", () => {
    expect(blocksByNetwork(ticks, "DOR", ["USDC", "DOR"])).toEqual([{ chain: "DOR", count: 3 }]);
    expect(blocksByNetwork(ticks, "dag", ["USDC", "DOR"])).toEqual([{ chain: "dag", count: 3 }]);
  });
  it("a network outside the catalog keeps a row, after the catalog's", () => {
    expect(blocksByNetwork([tick(1, 1, [], { X: [snap(["x"])] })], null, ["DOR"])).toEqual([{ chain: "dag", count: 0 }, { chain: "X", count: 1 }]);
  });
});

describe("lastBlockAt — LAST BLOCK", () => {
  it("is the stamp of the window's newest tick holding a block of the scope's network, and its network", () => {
    const ticks = [tick(3, 5, [], { DOR: [snap(["t"])] }), tick(2, 30, ["a"])];
    expect(lastBlockAt(ticks)).toEqual({ ts: ago(5), chain: "DOR" });
    expect(lastBlockAt(ticks, "dag")).toEqual({ ts: ago(30), chain: "dag" });
  });
  it("is null with no such block", () => {
    expect(lastBlockAt([])).toBeNull();
    expect(lastBlockAt([tick(1, 1, ["a"])], "DOR")).toBeNull();
  });
});
