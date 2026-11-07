import { describe, expect, it } from "vitest";
import { BLOCK_FRONTIER, blockChildren, blockReadKey, blockReadOf, frontierAdvances, frontierChains, frontierKey, isFrontierKey, unstampedFrontiers, wantedBlockReads, wantedExactReads, windowBlockKeys } from "@/src/data/blockReads";
import type { BlockRead } from "@/src/engine/domain/blockBraid";
import { foldBlockWindow } from "@/src/data/blockWindow";
import type { RawMetaSnapshot } from "@/src/data/types";

const meta = (ordinal: number, blocks: string[]) => ({ ordinal, hash: "m" + ordinal, lastSnapshotHash: "", timestamp: "", blocks }) as unknown as RawMetaSnapshot;
const tick = (ord: number, blocks: string[], m: Record<string, RawMetaSnapshot[]> = {}) => ({ ord, ts: new Date(ord * 10_000).toISOString(), hash: "g" + ord, blocks, metaSnaps: m });
const w = foldBlockWindow({
  ticks: [tick(100, ["d0"]), tick(300, ["d1"], { DOR: [meta(51, ["t1"])] }), tick(200, [], { DOR: [meta(40, [])] })],
  chains: ["dag", "DOR"],
}, {});

describe("block reads wanted by a window", () => {
  it("keys a read chain:ordinal", () => {
    expect(blockReadKey("dag", 7)).toBe("dag:7");
  });
  it("newest tick first: the DAG read, then each block-bearing metagraph snapshot; none for an empty one", () => {
    expect(wantedBlockReads(w, {}, {}).map((x) => x.key)).toEqual(["dag:300", "DOR:51", "dag:100"]);
    expect(wantedBlockReads(w, {}, {})[1]).toEqual({ key: "DOR:51", chain: "DOR", ordinal: 51 });
  });
  it("skips what is held; a missed token read is not asked again, a missed DAG read still is", () => {
    expect(wantedBlockReads(w, { "dag:300": {} }, { "dag:100": true }).map((x) => x.key)).toEqual(["DOR:51", "dag:100"]);
    expect(wantedBlockReads(w, {}, { "DOR:51": true }).map((x) => x.key)).toEqual(["dag:300", "dag:100"]);
  });
  it("asks the exact read of EVERY window tick, a token-only tick too, newest first, leaving out what landed", () => {
    expect(wantedExactReads(w, {})).toEqual([300, 200, 100]);
    expect(wantedExactReads(w, { 200: {} })).toEqual([300, 100]);
    expect(wantedExactReads(null, {})).toEqual([]);
  });
  it("windowBlockKeys holds every key the window could want", () => {
    expect([...windowBlockKeys(w)].sort()).toEqual(["DOR:51", "dag:100", "dag:300"]);
  });
});

describe("the frontier key", () => {
  it("sits beside a chain's block reads and is told apart from them", () => {
    expect(frontierKey("dag")).toBe(`dag:${BLOCK_FRONTIER}`);
    expect(isFrontierKey(frontierKey("DAG0x"))).toBe(true);
    expect(isFrontierKey(blockReadKey("dag", 7241523))).toBe(false);
  });
});

describe("the token chains whose frontier is read", () => {
  it("are the listed chains holding a block in the window, never the DAG (its frontier is the live exact read)", () => {
    expect(frontierChains(w, ["dag", "DOR"])).toEqual(["DOR"]);
  });
  it("leave out a chain the trail did not list, and a chain whose snapshots in the window carry no block", () => {
    expect(frontierChains(w, ["dag"])).toEqual([]);
    const quiet = foldBlockWindow({ ticks: [tick(200, ["d0"], { DOR: [meta(40, [])], USDC: [meta(9, ["u1"])] })], chains: ["dag", "DOR", "USDC"] }, {});
    expect(frontierChains(quiet, ["dag", "DOR", "USDC"])).toEqual(["USDC"]);
  });
  it("are none with no window", () => {
    expect(frontierChains(null, ["DOR"])).toEqual([]);
  });
});

describe("one block's read and its children", () => {
  const b = (hash: string, parents: string[]): BlockRead => ({ hash, height: 1, parents: parents.map((p) => ({ hash: p, height: 0 })), txCount: 1, amount: 1, fee: 0, signers: 3, transfers: [] });
  const reads = {
    [blockReadKey("dag", 300)]: { blocks: [b("d1", ["d0", "x"]), b("d2", ["d0", "d1"])], tips: null },
    [blockReadKey("dag", 100)]: { blocks: [b("d0", ["y", "z"])], tips: null },
    [blockReadKey("dor", 52)]: { blocks: [b("t1", ["d0", "q"])], tips: null },
    [frontierKey("dag")]: { blocks: [b("f", ["d0", "d1"])], tips: null },
  };
  it("finds the block in its accepting snapshot's read, or nothing before it lands", () => {
    expect(blockReadOf(reads, { chain: "dag", hash: "d2", ordinal: 300 })?.parents.map((p) => p.hash)).toEqual(["d0", "d1"]);
    expect(blockReadOf(reads, { chain: "dag", hash: "d9", ordinal: 300 })).toBeNull();
    expect(blockReadOf(reads, { chain: "dag", hash: "d0", ordinal: 999 })).toBeNull();
  });
  it("counts the blocks of its own chain's block reads built on it — never another chain's, never the frontier", () => {
    expect(blockChildren(reads, "dag", "d0")).toBe(2);
    expect(blockChildren(reads, "dag", "d1")).toBe(1);
    expect(blockChildren(reads, "dag", "d2")).toBe(0);
  });
});

describe("a frontier's honesty", () => {
  it("is written only forward: an older answer never replaces a newer one", () => {
    expect(frontierAdvances(null, 10)).toBe(true);
    expect(frontierAdvances({}, 10)).toBe(true);
    expect(frontierAdvances({ ordinal: 10 }, 11)).toBe(true);
    expect(frontierAdvances({ ordinal: 10 }, 10)).toBe(true);
    expect(frontierAdvances({ ordinal: 10 }, 9)).toBe(false);
  });
  it("names the token frontiers with no stamp, never the DAG's or a block read", () => {
    const reads = {
      [frontierKey("dag")]: { ts: undefined },
      [frontierKey("DOR")]: {},
      [frontierKey("USDC")]: { ts: "2026-11-06T12:00:00Z" },
      [blockReadKey("DOR", 4)]: {},
    };
    expect(unstampedFrontiers(reads)).toEqual([frontierKey("DOR")]);
  });
});
