import { describe, it, expect } from "vitest";
import { BLOCK_WINDOW_TICKS, type BlockTick } from "@/src/data/blockWindow";
import { blocksInTick, blocksPerBucket, blocksPerHour, frontierAge, openTipsByChain, BLOCK_BUCKETS } from "@/src/data/blockStats";
import { frontierKey } from "@/src/data/blockReads";
import type { RawMetaSnapshot } from "@/src/data/types";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const tick = (ord: number, min: number, blocks: string[], metaSnaps: BlockTick["metaSnaps"] = {}): BlockTick => ({ ord, ts: ago(min), hash: `h${ord}`, blocks, metaSnaps });
const snap = (blocks: string[]) => ({ ordinal: 1, blocks }) as unknown as RawMetaSnapshot;

describe("blocksInTick", () => {
  it("counts the global's own blocks and every anchored snapshot's token blocks", () => {
    expect(blocksInTick(tick(1, 1, ["a", "b"], { dor: [snap(["c"]), snap(["d", "e"])], x: [snap([])] }))).toBe(5);
  });
});

describe("blocksPerHour", () => {
  it("counts only blocks whose tick is within the last hour of now, DAG and token", () => {
    const ticks = [tick(3, 5, ["a"], { dor: [snap(["t1", "t2"])] }), tick(2, 59, ["b"]), tick(1, 61, ["c", "d"])];
    expect(blocksPerHour(ticks, NOW)).toEqual({ count: 4, floor: false });
  });
  it("is 0, not a floor, for an empty window", () => {
    expect(blocksPerHour([], NOW)).toEqual({ count: 0, floor: false });
  });
  const full = (spanMin: number) => Array.from({ length: BLOCK_WINDOW_TICKS }, (_, i) => tick(100 - i, 1 + (i * (spanMin - 1)) / (BLOCK_WINDOW_TICKS - 1), ["x"]));
  it("is a floor when a FULL window does not reach back an hour", () => {
    expect(blocksPerHour(full(30), NOW)).toEqual({ count: BLOCK_WINDOW_TICKS, floor: true });
  });
  it("is exact when a full window reaches back past an hour", () => {
    expect(blocksPerHour(full(90), NOW).floor).toBe(false);
  });
  it("is exact when a window below the cap spans under an hour (it holds all history)", () => {
    expect(blocksPerHour(full(30).slice(0, 10), NOW).floor).toBe(false);
  });
});

describe("blocksPerBucket", () => {
  it("bins the last hour oldest to newest; a stretch with no tick is zero blocks", () => {
    const ticks = [tick(2, 1, ["a", "b"]), tick(1, 58, ["c"])];
    const v = blocksPerBucket(ticks, NOW);
    expect(v).toHaveLength(BLOCK_BUCKETS);
    expect(v[0]).toBe(1);
    expect(v[BLOCK_BUCKETS - 1]).toBe(2);
    expect(v.slice(1, -1).every((x) => x === 0)).toBe(true);
  });
  it("leaves a gap where a full window no longer reaches back", () => {
    const ticks = Array.from({ length: BLOCK_WINDOW_TICKS }, (_, i) => tick(100 - i, 1 + i * 0.5, ["x"]));
    const v = blocksPerBucket(ticks, NOW);
    const oldest = (BLOCK_WINDOW_TICKS - 1) * 0.5 + 1; // 26.5 minutes
    expect(oldest).toBeLessThan(60);
    expect(v[0]).toBeNull();
    expect(v[BLOCK_BUCKETS - 1]).not.toBeNull();
    // The bin holding the oldest tick (26.5 min ago -> bin 6, spanning 25-30 min) is kept; the bins before it are gaps.
    expect(v[6]).not.toBeNull();
    expect(v[5]).toBeNull();
  });
  it("nulls no bin when the window is below its cap", () => {
    const v = blocksPerBucket([tick(2, 1, ["a"]), tick(1, 20, ["b"])], NOW);
    expect(v.every((x) => x != null)).toBe(true);
  });
});

describe("openTipsByChain", () => {
  const tips = (n: number) => ({ tips: { active: Array.from({ length: n }, (_, i) => ({ hash: `h${i}`, height: i, usage: 0, introducedAt: 0 })), deprecated: [] } });
  it("reads tips.active.length from each chain's frontier read, null where none", () => {
    const out = openTipsByChain({ [frontierKey("dag")]: tips(3), [frontierKey("dor")]: { tips: null }, "dag:5": tips(9) }, ["dag", "dor", "x"]);
    expect(out).toEqual({ dag: 3, dor: null, x: null });
  });
  it("names the chains the reads hold when none are asked for", () => {
    expect(openTipsByChain({ [frontierKey("dag")]: tips(2) })).toEqual({ dag: 2 });
  });
});

describe("frontierAge", () => {
  it("is the ms since the read's snapshot timestamp", () => {
    expect(frontierAge({ ts: ago(2) }, NOW)).toBe(120_000);
  });
  it("is null with no read", () => {
    expect(frontierAge(null, NOW)).toBeNull();
    expect(frontierAge(undefined, NOW)).toBeNull();
  });
});
