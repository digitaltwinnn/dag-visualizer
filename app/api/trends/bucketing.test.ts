import { describe, it, expect } from "vitest";
import { addInc, bucketGlobals, bucketMetas, bucketFleet, type IncMap } from "./bucketing";

const ts = (h: number, m: number, s = 0) => new Date(Date.UTC(2026, 8, 6, h, m, s)).toISOString();
const get = (inc: IncMap, key: string, field: string) => inc.get(key)?.get(field);

describe("addInc", () => {
  it("increments fields across all tiers using merge semantics", () => {
    const inc: IncMap = new Map();
    addInc(inc, "mainnet", Date.UTC(2026, 8, 6, 14, 2), "g.ticks", 1);
    addInc(inc, "mainnet", Date.UTC(2026, 8, 6, 14, 2), "g.ticks", 1); // same series in same bucket
    expect(get(inc, "t:mainnet:5m:2026-09-06", "14:00|g.ticks")).toBe(2);
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|g.ticks")).toBe(2);
    expect(get(inc, "t:mainnet:1d:2026", "09-06|g.ticks")).toBe(2);
  });
});

describe("bucketGlobals", () => {
  it("sums ticks/anchors/blocks into every tier and computes gaps incl. the cross-run boundary", () => {
    const inc: IncMap = new Map();
    const prev = Date.UTC(2026, 8, 6, 13, 59, 40); // last tick of the PREVIOUS run
    bucketGlobals(inc, "mainnet", [
      { ordinal: 101, timestamp: ts(14, 0, 8), metagraphSnapshotCount: 3, blocks: [] },
      { ordinal: 102, timestamp: ts(14, 0, 36), metagraphSnapshotCount: 0, blocks: [{}, {}] },
      { ordinal: 103, timestamp: ts(14, 6, 2), metagraphSnapshotCount: 24 },
    ], prev);
    const day = "t:mainnet:5m:2026-09-06";
    expect(get(inc, day, "14:00|g.ticks")).toBe(2);
    expect(get(inc, day, "14:05|g.ticks")).toBe(1);
    expect(get(inc, day, "14:00|g.anchors")).toBe(3);
    expect(get(inc, day, "14:05|g.anchors")).toBe(24);
    expect(get(inc, day, "14:00|g.blocks")).toBe(2);
    // gaps: 28s (prev→101), 28s (101→102) land in 14:00; 326s (102→103) lands in 14:05
    expect(get(inc, day, "14:00|g.gapMax")).toBe(28);
    expect(get(inc, day, "14:00|g.gapSum")).toBe(56);
    expect(get(inc, day, "14:05|g.gapMax")).toBe(326);
    // hourly + daily tiers fold the same sums
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|g.ticks")).toBe(3);
    expect(get(inc, "t:mainnet:1d:2026", "09-06|g.ticks")).toBe(3);
  });
  it("zero-fills g.ticks across the covered range so coverage is distinguishable from absence", () => {
    const inc: IncMap = new Map();
    bucketGlobals(inc, "mainnet", [
      { ordinal: 1, timestamp: ts(14, 1) },
      { ordinal: 2, timestamp: ts(14, 14) }, // nothing lands in 14:05
    ], null);
    const day = "t:mainnet:5m:2026-09-06";
    expect(get(inc, day, "14:05|g.ticks")).toBe(0); // covered, empty — an honest zero
    expect(get(inc, day, "14:10|g.ticks")).toBe(1);
  });
  it("with no prev cursor the first record opens the gap chain without inventing one", () => {
    const inc: IncMap = new Map();
    bucketGlobals(inc, "mainnet", [
      { ordinal: 1, timestamp: ts(14, 0, 0) },
      { ordinal: 2, timestamp: ts(14, 0, 30) },
    ], null);
    expect(get(inc, "t:mainnet:5m:2026-09-06", "14:00|g.gapSum")).toBe(30); // one gap, not two
  });
});

describe("bucketMetas", () => {
  it("sums snaps/fee/kb per metagraph into every tier", () => {
    const inc: IncMap = new Map();
    bucketMetas(inc, "mainnet", "abc", [
      { ordinal: 9, timestamp: ts(14, 2), fee: 400000, sizeInKB: 12.5 },
      { ordinal: 10, timestamp: ts(14, 3), fee: 100000, sizeInKB: 2.5 },
    ]);
    const day = "t:mainnet:5m:2026-09-06";
    expect(get(inc, day, "14:00|m.abc.snaps")).toBe(2);
    expect(get(inc, day, "14:00|m.abc.fee")).toBe(500000);
    expect(get(inc, day, "14:00|m.abc.kb")).toBe(15);
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|m.abc.snaps")).toBe(2);
  });
  it("also feeds the global floors", () => {
    const inc: IncMap = new Map();
    bucketMetas(inc, "mainnet", "abc", [{ ordinal: 9, timestamp: ts(14, 2), fee: 400000, sizeInKB: 12.5 }]);
    expect(get(inc, "t:mainnet:5m:2026-09-06", "14:00|g.feeFloor")).toBe(400000);
    expect(get(inc, "t:mainnet:5m:2026-09-06", "14:00|g.kbFloor")).toBe(12.5);
  });
});

describe("bucketFleet", () => {
  it("writes gauges to hourly+daily only, countries daily only", () => {
    const inc: IncMap = new Map();
    bucketFleet(inc, "mainnet", Date.UTC(2026, 8, 6, 14, 30), {
      total: 195, perNet: { dag: 160, abc: 16 }, layers: { l0: 177, cl1: 150, dl1: 23 },
      countries: { DE: 60, US: 40 },
    });
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|f.nodes")).toBe(195);
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|f.nodes.dag")).toBe(160);
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|f.layer.l0")).toBe(177);
    expect(get(inc, "t:mainnet:1d:2026", "09-06|f.cc.DE")).toBe(60);
    expect(get(inc, "t:mainnet:1h:2026-09", "06-14|f.cc.DE")).toBeUndefined(); // daily only
    expect(inc.get("t:mainnet:5m:2026-09-06")).toBeUndefined(); // no fine-tier gauges
  });
});
