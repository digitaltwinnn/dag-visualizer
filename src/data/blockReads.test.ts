import { describe, expect, it } from "vitest";
import { BLOCK_FRONTIER, blockChildren, blockReadKey, blockReadOf, frontierKey, isFrontierKey, wantedBlockReads, windowBlockKeys } from "@/src/data/blockReads";
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

describe("one block's read and its children", () => {
  const b = (hash: string, parents: string[]): BlockRead => ({ hash, height: 1, parents: parents.map((p) => ({ hash: p, height: 0 })), txCount: 1, amount: 1, fee: 0, signers: 3 });
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
