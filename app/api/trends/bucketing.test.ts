import { describe, it, expect } from "vitest";
import { addInc, bucketGlobals, bucketMetas, bucketFleet, type IncMap } from "./bucketing";
import { slotOf, fieldOf } from "./keys";

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
  it("computes per-network gap stats only when a chain is opted in", () => {
    const inc: IncMap = new Map();
    const prev = Date.UTC(2026, 8, 6, 13, 59, 30);
    bucketMetas(inc, "mainnet", "abc", [
      { ordinal: 9, timestamp: ts(14, 0, 0), fee: 0, sizeInKB: 0 },
      { ordinal: 10, timestamp: ts(14, 0, 45), fee: 0, sizeInKB: 0 },
    ], prev);
    const day = "t:mainnet:5m:2026-09-06";
    expect(get(inc, day, "14:00|m.abc.gapSum")).toBe(75); // 30 (prev→9) + 45 (9→10)
    expect(get(inc, day, "14:00|m.abc.gapMax")).toBe(45);
    // no opt-in → no gap series, no invented values
    const inc2: IncMap = new Map();
    bucketMetas(inc2, "mainnet", "abc", [{ ordinal: 9, timestamp: ts(14, 0), fee: 0, sizeInKB: 0 }]);
    expect(get(inc2, day, "14:00|m.abc.gapSum")).toBeUndefined();
    // null opens a fresh chain: the first record contributes no gap
    const inc3: IncMap = new Map();
    bucketMetas(inc3, "mainnet", "abc", [
      { ordinal: 9, timestamp: ts(14, 0, 0), fee: 0, sizeInKB: 0 },
      { ordinal: 10, timestamp: ts(14, 0, 20), fee: 0, sizeInKB: 0 },
    ], null);
    expect(get(inc3, day, "14:00|m.abc.gapSum")).toBe(20);
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

// The Sep 8 2026 find: a real 4-hour global stall (consecutive ordinals, 10:40 → 14:47 UTC)
// must read as MEASURED SILENCE in every tier — the hourly/daily coverage zero-fill is what
// keeps a 7D window from painting a chain stall in the not-sampled gray.
describe("coverage zero-fill reaches every tier", () => {
  it("a batch bracketing hours of silence marks the empty hourly buckets with g.ticks 0", () => {
    const inc: IncMap = new Map();
    bucketGlobals(inc, "mainnet", [
      { ordinal: 1, timestamp: "2026-09-08T10:40:00Z", metagraphSnapshotCount: 0, blocks: [] },
      { ordinal: 2, timestamp: "2026-09-08T14:47:00Z", metagraphSnapshotCount: 0, blocks: [] },
    ], null);
    const hourKey = slotOf("mainnet", "1h", Date.parse("2026-09-08T12:00:00Z"));
    const hourField = fieldOf(hourKey.bucket, "g.ticks");
    expect(inc.get(hourKey.key)?.get(hourField)).toBe(0);
    // both records share this DAY, so its bucket holds their real count — the daily
    // zero-fill only speaks when a batch brackets a wholly-silent day
    const dayKey = slotOf("mainnet", "1d", Date.parse("2026-09-08T12:00:00Z"));
    expect(inc.get(dayKey.key)?.get(fieldOf(dayKey.bucket, "g.ticks"))).toBe(2);
    // the record-bearing hours carry real counts, not zeros
    const h1 = slotOf("mainnet", "1h", Date.parse("2026-09-08T10:40:00Z"));
    expect(inc.get(h1.key)?.get(fieldOf(h1.bucket, "g.ticks"))).toBe(1);
  });
  it("the fill starts at the cross-run boundary: a stall straddling two runs is covered by the SECOND run's batch (Sep 10's 13.5-min stall read gray because neither batch spanned it)", () => {
    const inc: IncMap = new Map();
    // previous run ended at 10:22; this run's first record is 10:35 — the silent buckets
    // between belong to THIS run's measurement
    bucketGlobals(inc, "mainnet", [
      { ordinal: 2, timestamp: "2026-09-10T10:35:58Z", metagraphSnapshotCount: 0, blocks: [] },
    ], Date.parse("2026-09-10T10:22:25Z"));
    for (const hhmm of ["10:25", "10:30"]) {
      const k = slotOf("mainnet", "5m", Date.parse(`2026-09-10T${hhmm}:00Z`));
      expect(inc.get(k.key)?.get(fieldOf(k.bucket, "g.ticks"))).toBe(0);
    }
    // and a single-record batch with NO boundary still fills nothing (cold cursor rule)
    const inc2: IncMap = new Map();
    bucketGlobals(inc2, "mainnet", [
      { ordinal: 2, timestamp: "2026-09-10T10:35:58Z", metagraphSnapshotCount: 0, blocks: [] },
    ], null);
    const k2 = slotOf("mainnet", "5m", Date.parse("2026-09-10T10:25:00Z"));
    expect(inc2.get(k2.key)?.get(fieldOf(k2.bucket, "g.ticks"))).toBeUndefined();
  });
});
