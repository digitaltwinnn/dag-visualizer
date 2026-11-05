import { describe, it, expect } from "vitest";
import { sparkPlan, sparkPoints, sparkGeometry } from "./momentSpark";
import { TIER_SINCE, type TrendsWindowData } from "./trendWindow";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const FIVE = 300_000;
// A moment well inside both fine tiers' history.
const T = Date.UTC(2026, 10, 4, 14);

describe("sparkPlan — one step down, where the finer tier holds the measure", () => {
  it("breaks an hour into 5-minute buckets and a day into hours", () => {
    expect(sparkPlan("snapshots", HOUR, T)).toEqual({ tier: "5m", fromMs: T, toMs: T + HOUR });
    const day = Date.UTC(2026, 10, 4);
    expect(sparkPlan("snapshots", DAY, day)).toEqual({ tier: "1h", fromMs: day, toMs: day + DAY });
  });
  it("draws nothing for a 5-minute moment — it is the finest there is", () => {
    expect(sparkPlan("snapshots", FIVE, T)).toBeNull();
  });
  it("a gauge is sampled hourly: its day breaks into hours, its hour into nothing", () => {
    expect(sparkPlan("nodes", HOUR, T)).toBeNull();
    expect(sparkPlan("nodes", DAY, Date.UTC(2026, 10, 4))?.tier).toBe("1h");
  });
  it("draws nothing before the finer tier's history begins", () => {
    expect(sparkPlan("snapshots", HOUR, TIER_SINCE["5m"] - HOUR)).toBeNull();
    expect(sparkPlan("snapshots", DAY, TIER_SINCE["1h"] - DAY)).toBeNull();
    expect(sparkPlan("snapshots", HOUR, TIER_SINCE["5m"])).not.toBeNull();
  });
});

describe("sparkPoints — the lead's own reading, broken down", () => {
  // Three 5-minute buckets before the moment, the moment's twelve, one after.
  const buckets = Array.from({ length: 16 }, (_, i) => T - 3 * FIVE + i * FIVE);
  const data: TrendsWindowData = {
    buckets,
    stepMs: FIVE,
    now: T + 2 * HOUR,
    series: {
      "g.anchors": buckets.map((_, i) => 20 + i),
      "m.dor.snaps": buckets.map((_, i) => (i === 7 ? null : i)),
    },
  };
  const plan = sparkPlan("snapshots", HOUR, T)!;
  it("takes exactly the moment's finer buckets, oldest first", () => {
    expect(sparkPoints("snapshots", null, data, plan)).toEqual([23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34]);
  });
  it("reads the subject network's row when there is one, and keeps an unmeasured bucket as null", () => {
    const pts = sparkPoints("snapshots", "dor", data, plan)!;
    expect(pts).toHaveLength(12);
    expect(pts[4]).toBeNull(); // bucket 7 of the slice is the moment's 5th
    expect(pts[0]).toBe(3);
  });
  it("is null when nothing was measured in the moment — no line rather than a flat one", () => {
    const empty = { ...data, series: { "g.anchors": buckets.map(() => null) } };
    expect(sparkPoints("snapshots", null, empty, plan)).toBeNull();
    expect(sparkPoints("snapshots", "ded", data, plan)).toBeNull(); // no row at all
  });
});

describe("sparkGeometry — stretched to fit, the line alone", () => {
  it("puts the lowest point on the floor and the highest on the ceiling", () => {
    const g = sparkGeometry([26, 30, 28], 100, 20);
    expect(g.path).toBe("M0,20L50,0L100,10");
    expect(g.peak).toEqual({ x: 50, y: 0 });
  });
  it("breaks the line at an unmeasured point instead of dipping to zero", () => {
    expect(sparkGeometry([1, 2, null, 3, 4], 40, 10).path).toBe("M0,10L10,6.67M30,3.33L40,0");
  });
  it("keeps a lone measured point between gaps as a dot of its own", () => {
    expect(sparkGeometry([null, 5, null, 2, 3], 40, 10).dots).toEqual([{ x: 10, y: 0 }]);
  });
  it("sits flat across the middle when every point is equal", () => {
    expect(sparkGeometry([7, 7, 7], 20, 10).path).toBe("M0,5L10,5L20,5");
  });
  it("draws nothing for no measurement", () => {
    expect(sparkGeometry([null, null], 20, 10)).toEqual({ path: "", peak: null, dots: [] });
  });
});
