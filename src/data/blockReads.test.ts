import { describe, expect, it } from "vitest";
import { blockReadKey, wantedBlockReads, windowBlockKeys } from "@/src/data/blockReads";
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
