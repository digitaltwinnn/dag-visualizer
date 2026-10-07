// The specification for the trends window transforms (rule 4): every honesty cut is pinned
// here — the review found these rules shipping untested from components/, with a divergent
// second copy in TrendsDoc, and three edge-case bugs nothing could catch (findIndex -1 read
// as "no leading gap"; the client clock judging a CDN-cached payload's newest bucket; the
// leading partial month drawn whole while the trailing one was trimmed).
import { describe, expect, it } from "vitest";
import { assembleTrendSlice, bucketAt, heldZoom, spanPhrase, cursorFraction, cutRange, leadingTrim, monthlySum, pickRangeTier, planTrendFetch, rangeBuckets, sliceWindow, stitchWindows, TIER_SINCE, tilesFor, trimNewestPartial, windowSpan, ZOOMS, type TrendsWindowData } from "./trendWindow";

const HOUR = 3_600_000;
const DAY = 86_400_000;

function win(startMs: number, stepMs: number, ticks: (number | null)[], now?: number): TrendsWindowData {
  return {
    buckets: ticks.map((_, i) => startMs + i * stepMs),
    stepMs,
    series: { "g.ticks": ticks, "m.x.snaps": ticks.map((v) => (v == null ? null : v * 2)) },
    now: now ?? startMs + ticks.length * stepMs,
  };
}

describe("trimNewestPartial", () => {
  it("drops the bucket the payload's own now still falls inside", () => {
    const w = win(0, HOUR, [1, 2, 3], 2 * HOUR + 1); // now inside bucket 2
    expect(trimNewestPartial(w).buckets).toEqual([0, HOUR]);
  });
  it("keeps a complete newest bucket — and judges by payload time, never the client clock", () => {
    const w = win(0, HOUR, [1, 2, 3], 3 * HOUR); // assembled exactly at the boundary
    expect(trimNewestPartial(w).buckets.length).toBe(3);
  });
  it("is a no-op on an empty window", () => {
    expect(trimNewestPartial(win(0, HOUR, [])).buckets).toEqual([]);
  });
});

describe("sliceWindow", () => {
  it("keeps the newest span, measured from the payload's newest bucket", () => {
    const w = win(0, HOUR, new Array<number>(48).fill(1));
    const s = sliceWindow(w, 24 * HOUR);
    expect(s.buckets.length).toBe(24);
    expect(s.buckets[0]).toBe(24 * HOUR);
    expect(s.series["m.x.snaps"].length).toBe(24);
  });
  it("returns the whole window when the span covers it", () => {
    const w = win(0, HOUR, [1, 2]);
    expect(sliceWindow(w, DAY).buckets.length).toBe(2);
  });
});

describe("leadingTrim", () => {
  it("drops the unmeasured prefix, keeping interior holes", () => {
    const w = win(0, DAY, [null, null, 5, null, 7]);
    const t = leadingTrim(w);
    expect(t.buckets[0]).toBe(2 * DAY);
    expect(t.series["g.ticks"]).toEqual([5, null, 7]);
  });
  it("trims a fully-unmeasured window to EMPTY — -1 is not 'no leading gap'", () => {
    const t = leadingTrim(win(0, DAY, [null, null, null]));
    expect(t.buckets).toEqual([]);
    expect(t.series["g.ticks"]).toEqual([]);
  });
  it("trims a payload with NO coverage marker to EMPTY — a never-sampled network measured nothing", () => {
    const bare = { ...win(0, DAY, [1, 2, 3]), series: {} };
    const t = leadingTrim(bare);
    expect(t.buckets).toEqual([]);
  });

  it("is identity when measurement starts at the first bucket", () => {
    const w = win(0, DAY, [1, 2]);
    expect(leadingTrim(w)).toEqual(w);
  });
});

describe("monthlySum", () => {
  const jan1 = Date.UTC(2026, 0, 1);
  it("sums counters per calendar month and keeps unmeasured months null", () => {
    const ticks: (number | null)[] = new Array(59).fill(1); // Jan (31) + Feb (28), complete
    const w = win(jan1, DAY, ticks, Date.UTC(2026, 3, 15)); // assembled mid-April
    const m = monthlySum(w);
    expect(m.buckets).toEqual([Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1)]);
    expect(m.series["g.ticks"]).toEqual([31, 28]);
  });
  it("trims the forming trailing month (payload assembled inside it)", () => {
    const ticks: (number | null)[] = new Array(40).fill(1); // Jan + early Feb
    const m = monthlySum(win(jan1, DAY, ticks, Date.UTC(2026, 1, 10)));
    expect(m.buckets).toEqual([Date.UTC(2026, 0, 1)]);
  });
  it("trims a partial LEADING month — the partial-edge rule reaches both ends", () => {
    const jan15 = Date.UTC(2026, 0, 15);
    const ticks: (number | null)[] = new Array(17 + 28).fill(1); // Jan 15-31 + all of Feb
    const m = monthlySum(win(jan15, DAY, ticks, Date.UTC(2026, 2, 5)));
    expect(m.buckets).toEqual([Date.UTC(2026, 1, 1)]);
    expect(m.series["g.ticks"]).toEqual([28]);
  });
});

describe("cutRange", () => {
  const t0 = Date.UTC(2026, 8, 1);
  it("keeps every bucket the range intersects, mid-bucket edges included", () => {
    const w = win(t0, HOUR, [1, 2, 3, 4, 5, 6]);
    // from inside bucket 1, to inside bucket 4 — both partial-touched buckets stay
    const c = cutRange(w, t0 + HOUR + 60_000, t0 + 4 * HOUR + 60_000);
    expect(c.buckets).toEqual([t0 + HOUR, t0 + 2 * HOUR, t0 + 3 * HOUR, t0 + 4 * HOUR]);
    expect(c.series["g.ticks"]).toEqual([2, 3, 4, 5]);
  });
  it("cuts to empty on a non-overlapping or inverted range instead of throwing", () => {
    const w = win(t0, HOUR, [1, 2, 3]);
    expect(cutRange(w, t0 + 10 * HOUR, t0 + 12 * HOUR).buckets).toEqual([]);
    expect(cutRange(w, t0 + 2 * HOUR, t0).buckets).toEqual([]);
  });
  it("is the whole window when the range covers it", () => {
    const w = win(t0, HOUR, [1, 2, 3]);
    expect(cutRange(w, t0 - HOUR, t0 + 10 * HOUR).buckets.length).toBe(3);
  });
});

describe("pickRangeTier", () => {
  const d5 = TIER_SINCE["5m"];
  it("goes finest only where the tier's history floor allows", () => {
    expect(pickRangeTier(d5 + DAY, d5 + 2 * DAY)).toBe("5m");
    // both fine floors share one date since the clean-sheet walk (2026-09-11), so any range
    // opening before it is daily-only regardless of span — there is no between-floors rung
    expect(pickRangeTier(d5 - 3 * DAY, d5 - DAY)).toBe("1d");
    expect(pickRangeTier(d5 - 30 * DAY, d5 - DAY)).toBe("1d");
  });
  it("widens the tier with the span", () => {
    expect(pickRangeTier(d5, d5 + 30 * DAY)).toBe("1h");
    expect(pickRangeTier(d5, d5 + 90 * DAY)).toBe("1d");
  });
});

describe("tilesFor", () => {
  it("day units for 5m, months for 1h, spanning the whole range", () => {
    expect(tilesFor("5m", Date.UTC(2026, 8, 8, 14), Date.UTC(2026, 8, 10, 2))).toEqual([
      "2026-09-08", "2026-09-09", "2026-09-10",
    ]);
    expect(tilesFor("1h", Date.UTC(2026, 6, 20), Date.UTC(2026, 8, 2))).toEqual([
      "2026-07", "2026-08", "2026-09",
    ]);
  });
  it("crosses year boundaries and stays bounded", () => {
    expect(tilesFor("1h", Date.UTC(2026, 11, 20), Date.UTC(2027, 0, 5))).toEqual(["2026-12", "2027-01"]);
    expect(tilesFor("5m", 0, 1e15).length).toBe(64);
  });
});

describe("stitchWindows", () => {
  it("concatenates in time order and null-fills series a tile never carried", () => {
    const a = win(Date.UTC(2026, 8, 8), HOUR, [1, 2]);
    const b: TrendsWindowData = {
      buckets: [Date.UTC(2026, 8, 9)],
      stepMs: HOUR,
      series: { "g.ticks": [7], "m.y.snaps": [3] },
      now: Date.UTC(2026, 8, 9, 12),
    };
    const s2 = stitchWindows([b, a]);
    expect(s2.buckets).toEqual([Date.UTC(2026, 8, 8), Date.UTC(2026, 8, 8) + HOUR, Date.UTC(2026, 8, 9)]);
    expect(s2.series["g.ticks"]).toEqual([1, 2, 7]);
    expect(s2.series["m.y.snaps"]).toEqual([null, null, 3]);
    expect(s2.series["m.x.snaps"]).toEqual([2, 4, null]);
    expect(s2.now).toBe(Date.UTC(2026, 8, 9, 12));
  });
  it("is empty-safe", () => {
    expect(stitchWindows([]).buckets).toEqual([]);
  });
});

// The shared time cursor's bucket lookup (2026-09-18). `store.trendCursorMs` is ONE instant and
// every chart plane has to mark the bucket that CONTAINS it — a mark placed on the nearest bucket
// instead would misstate which day the reader is being shown, which is rule 10 in the one place a
// reader would never catch it. Buckets are ascending START instants, `stepMs` wide, half-open
// [start, start + stepMs) — the same interval `cutRange` already treats them as. Ascending is a
// CONTRACT of every TrendsWindowData in the app (the API assembles them in order, `stitchWindows`
// sorts), so an unsorted array is not a case this is required to answer.
describe("bucketAt", () => {
  const B = [0, HOUR, 2 * HOUR];

  it("returns the bucket START of the bucket containing the instant", () => {
    expect(bucketAt(B, HOUR, HOUR + 1)).toBe(HOUR);
    expect(bucketAt(B, HOUR, 2 * HOUR + HOUR - 1)).toBe(2 * HOUR);
  });

  it("is half-open: a bucket's own start is inside it, the next start is not", () => {
    expect(bucketAt(B, HOUR, HOUR)).toBe(HOUR);
    expect(bucketAt(B, HOUR, 2 * HOUR)).toBe(2 * HOUR);
  });

  it("returns null before the first bucket", () => {
    expect(bucketAt(B, HOUR, -1)).toBe(null);
  });

  it("returns null at and after the span's exclusive end (last + stepMs)", () => {
    expect(bucketAt(B, HOUR, 3 * HOUR)).toBe(null);
    expect(bucketAt(B, HOUR, 3 * HOUR + 1)).toBe(null);
    expect(bucketAt(B, HOUR, 2 * HOUR + HOUR - 1)).toBe(2 * HOUR); // the last instant inside
  });

  it("is empty-safe — no buckets is no span, so nothing contains anything", () => {
    expect(bucketAt([], HOUR, 0)).toBe(null);
  });

  it("finds a DAILY bucket from an instant partway through it", () => {
    const days = [Date.UTC(2026, 8, 1), Date.UTC(2026, 8, 2), Date.UTC(2026, 8, 3)];
    expect(bucketAt(days, DAY, Date.UTC(2026, 8, 2, 13, 47))).toBe(Date.UTC(2026, 8, 2));
  });
});

// ---- WHERE THE CURSOR SITS ON THE PLOT (2026-09-19) -------------------------------
// The shared cursor used to be a recharts `ReferenceLine`, which meant every cursor write
// re-rendered the whole chart — five of them per bucket, which measured at 3-4 FPS across a
// scrub. It is a lightweight DOM overlay now, and this is the only maths that move moved out of
// recharts: WHERE, as a fraction of the plot box, the chart's own numeric XAxis puts a bucket.
//
// The axis is `type="number"`, `domain={["dataMin", "dataMax"]}` — so the OLDEST bucket sits at
// the left edge of the plot box and the NEWEST at the right, linearly between. That is the whole
// rule, and expressing it as a fraction is what lets the overlay be pure CSS `calc()` over a
// percentage of that box: no measurement, no ResizeObserver, and it rides the 3D plane's own
// scale for free.
//
// ⚠️ IT TAKES A BUCKET, NOT AN INSTANT. `bucketAt` above is still the containment rule — the
// overlay marks the bucket that CONTAINS the instant or nothing at all (rule 10) — and this
// function answers only "where is that bucket". A value that is not one of the axis's own
// buckets has no place on it and gets `null` rather than an interpolated position.
describe("cursorFraction", () => {
  const B = [0, HOUR, 2 * HOUR, 3 * HOUR];

  it("puts the first bucket at the plot's left edge", () => {
    expect(cursorFraction(B, 0)).toBe(0);
  });

  it("puts the last bucket at the plot's right edge", () => {
    expect(cursorFraction(B, 3 * HOUR)).toBe(1);
  });

  it("is linear in between — the axis is numeric, not categorical", () => {
    expect(cursorFraction(B, HOUR)).toBeCloseTo(1 / 3, 12);
    expect(cursorFraction(B, 2 * HOUR)).toBeCloseTo(2 / 3, 12);
  });

  it("spaces by TIME, not by index — an irregular axis is still linear in ms", () => {
    expect(cursorFraction([0, HOUR, 4 * HOUR], HOUR)).toBeCloseTo(0.25, 12);
  });

  it("puts a single-bucket axis at the left edge — dataMin IS dataMax, and 0/0 is not a position", () => {
    expect(cursorFraction([HOUR], HOUR)).toBe(0);
    expect(cursorFraction([HOUR], 0)).toBe(null);
  });

  it("returns null for a bucket the axis does not carry", () => {
    expect(cursorFraction(B, HOUR + 1)).toBe(null);
    expect(cursorFraction(B, -HOUR)).toBe(null);
    expect(cursorFraction(B, 9 * HOUR)).toBe(null);
  });

  it("returns null for no cursor at all, so the caller needs no second guard", () => {
    expect(cursorFraction(B, null)).toBe(null);
  });

  it("is empty-safe — no axis is no position", () => {
    expect(cursorFraction([], 0)).toBe(null);
  });
});

// ---- THE WINDOW/RANGE DATA PATH (2026-09-18) --------------------------------------
// The document and the 3D stack are TWO REGISTERS OF ONE RUNG, so the decision "which payloads
// does this window need, and how is each cut" belongs to neither component. These tests ARE that
// decision: the plan table below is what both surfaces fetch, and the assembler is every honesty
// cut composed in one order. A divergence here is the bug class the whole task exists to close —
// two surfaces reading the same rung through different windows.
describe("planTrendFetch", () => {
  it("1H rides the 24h payload, sliced to the newest hour — a window is not always an API window", () => {
    const plan = planTrendFetch("1h", null);
    expect(plan.main.window).toBe("24h");
    expect(plan.main.tiles).toBe(null);
    expect(plan.main.cut).toEqual({ kind: "slice", ms: HOUR });
  });

  it("every other zoom IS its own API window, uncut", () => {
    for (const z of ["24h", "7d", "30d", "1y", "all"] as const) {
      const plan = planTrendFetch(z, null);
      expect(plan.main.window).toBe(z);
      expect(plan.main.cut).toEqual({ kind: "none" });
      expect(plan.main.tiles).toBe(null);
    }
  });

  it("the FLEET rides the 7d hourly payload at the two fine zooms, sliced to the picked span", () => {
    expect(planTrendFetch("1h", null).fleet).toEqual({ window: "7d", tiles: null, cut: { kind: "slice", ms: HOUR } });
    expect(planTrendFetch("24h", null).fleet).toEqual({ window: "7d", tiles: null, cut: { kind: "slice", ms: 24 * HOUR } });
  });

  it("the fleet needs no payload of its own at the hourly and daily zooms — the main one carries it", () => {
    for (const z of ["7d", "30d", "1y", "all"] as const) {
      expect(planTrendFetch(z, null).fleet).toEqual({ window: null, tiles: null, cut: { kind: "none" } });
    }
  });

  // "LATEST FULL DAY" IS THE ONE READOUT (user, 2026-09-29: "a latest 5 min is less easy to
  // understand than a last day … day should be the standard always"). So the daily tier rides
  // along wherever the charts' own grain is finer than a day; at 1Y/ALL the chart IS daily.
  it("the DAILY readout payload is the 90d window wherever the charts are finer than a day", () => {
    for (const z of ["1h", "24h", "7d", "30d"] as const) expect(planTrendFetch(z, null).daily).toBe("90d");
    for (const z of ["1y", "all"] as const) expect(planTrendFetch(z, null).daily).toBe(null);
  });

  it("a DAILY-tier range rides the one `all` payload, cut to the range", () => {
    const from = Date.UTC(2025, 8, 1);
    const to = Date.UTC(2026, 0, 1);
    const plan = planTrendFetch("all", { fromMs: from, toMs: to });
    expect(plan.tier).toBe("1d");
    expect(plan.main.window).toBe("all");
    expect(plan.main.tiles).toBe(null);
    expect(plan.main.cut).toEqual({ kind: "range", fromMs: from, toMs: to });
  });

  it("a 5m-tier range fetches 5m TILES, and the fleet its own hourly tiles", () => {
    const from = Date.UTC(2026, 8, 17, 6);
    const to = Date.UTC(2026, 8, 17, 12);
    const plan = planTrendFetch("all", { fromMs: from, toMs: to });
    expect(plan.tier).toBe("5m");
    expect(plan.main.window).toBe(null);
    expect(plan.main.tiles).toEqual({ tier: "5m", fromMs: from, toMs: to });
    expect(plan.fleet.tiles).toEqual({ tier: "1h", fromMs: from, toMs: to });
    expect(plan.fleet.cut).toEqual({ kind: "range", fromMs: from, toMs: to });
  });

  it("an HOURLY-tier range fetches hourly tiles and NO fleet leg — those buckets already are hourly", () => {
    const from = Date.UTC(2026, 7, 1);
    const to = Date.UTC(2026, 7, 20);
    const plan = planTrendFetch("all", { fromMs: from, toMs: to });
    expect(plan.tier).toBe("1h");
    expect(plan.main.tiles).toEqual({ tier: "1h", fromMs: from, toMs: to });
    expect(plan.fleet).toEqual({ window: null, tiles: null, cut: { kind: "none" } });
  });

  it("a range carries the daily leg exactly when ITS tier is finer than a day", () => {
    const short = planTrendFetch("all", { fromMs: Date.UTC(2026, 7, 1), toMs: Date.UTC(2026, 7, 1, 6) });
    expect(short.tier).not.toBe("1d");
    expect(short.daily).toBe("90d");
    const long = planTrendFetch("7d", { fromMs: Date.UTC(2025, 7, 1), toMs: Date.UTC(2026, 7, 20) });
    expect(long.tier).toBe("1d");
    expect(long.daily).toBe(null);
  });

  it("a null zoom fetches NOTHING — the consumer is not showing charts", () => {
    const plan = planTrendFetch(null, { fromMs: 0, toMs: DAY });
    expect(plan).toEqual({
      main: { window: null, tiles: null, cut: { kind: "none" } },
      fleet: { window: null, tiles: null, cut: { kind: "none" } },
      daily: null,
      tier: null,
    });
  });
});

describe("ZOOMS", () => {
  it("is the one window vocabulary both registers read, coarsest last", () => {
    expect(ZOOMS.map((z) => z.id)).toEqual(["1h", "24h", "7d", "30d", "1y", "all"]);
    expect(ZOOMS.map((z) => z.label)).toEqual(["1H", "24H", "7D", "30D", "1Y", "All"]);
  });
});

describe("assembleTrendSlice", () => {
  const fleetWin = (startMs: number, stepMs: number, n: number): TrendsWindowData => ({
    buckets: Array.from({ length: n }, (_, i) => startMs + i * stepMs),
    stepMs,
    series: { "g.ticks": Array.from({ length: n }, () => 1), "f.nodes": Array.from({ length: n }, (_, i) => 100 + i) },
    now: startMs + n * stepMs,
  });

  it("cuts, leading-trims and reports the main window", () => {
    const plan = planTrendFetch("all", null);
    const s = assembleTrendSlice(plan, { main: win(0, DAY, [null, 1, 2]) });
    expect(s.buckets).toEqual([DAY, 2 * DAY]);
    expect(s.stepMs).toBe(DAY);
    expect(s.p?.series["g.ticks"]).toEqual([1, 2]);
  });

  it("1H slices the 24h payload to its newest hour", () => {
    const plan = planTrendFetch("1h", null);
    const s = assembleTrendSlice(plan, { main: win(0, HOUR / 12, new Array<number>(288).fill(1)) });
    expect(s.buckets.length).toBe(12);
    expect(s.stepMs).toBe(HOUR / 12);
  });

  it("NULLS SURVIVE — an unmeasured bucket is a gap, never a zero", () => {
    const plan = planTrendFetch("all", null);
    const s = assembleTrendSlice(plan, { main: win(0, DAY, [1, null, 3]) });
    expect(s.p?.series["g.ticks"]).toEqual([1, null, 3]);
    expect(s.p?.series["m.x.snaps"]).toEqual([2, null, 6]);
  });

  it("an ABSENT main payload yields undefined pieces, not an empty fabricated window", () => {
    const s = assembleTrendSlice(planTrendFetch("all", null), {});
    expect(s.p).toBeUndefined();
    expect(s.pF).toBeUndefined();
    expect(s.daily).toBeUndefined();
    expect(s.buckets).toEqual([]);
    expect(s.stepMs).toBe(DAY);
    expect(s.fleetPending).toBe(false);
  });

  it("the FLEET's own hourly payload takes over when the main window is finer than an hour", () => {
    const plan = planTrendFetch("24h", null);
    const s = assembleTrendSlice(plan, {
      main: win(0, HOUR / 12, new Array<number>(288).fill(1)),
      fleet: fleetWin(0, HOUR, 168),
    });
    expect(s.fStep).toBe(HOUR);
    expect(s.fBuckets.length).toBe(24);
    expect(s.pF).not.toBe(s.p);
    expect(s.fleetPending).toBe(false);
  });

  it("while that payload is in flight the gauges are PENDING, and say so rather than drawing nothing", () => {
    const plan = planTrendFetch("24h", null);
    const s = assembleTrendSlice(plan, { main: win(0, HOUR / 12, new Array<number>(288).fill(1)) });
    expect(s.fleetPending).toBe(true);
    expect(s.pF).toBe(s.p);
    expect(s.fStep).toBe(HOUR / 12);
  });

  it("at an hourly-or-coarser window the gauges ride the MAIN payload and never pend", () => {
    const plan = planTrendFetch("7d", null);
    const s = assembleTrendSlice(plan, { main: win(0, HOUR, [1, 2, 3]), fleet: fleetWin(0, HOUR, 168) });
    expect(s.pF).toBe(s.p);
    expect(s.fBuckets).toBe(s.buckets);
    expect(s.fStep).toBe(HOUR);
    expect(s.fleetPending).toBe(false);
  });

  it("the daily-readout payload arrives with its still-filling newest day trimmed", () => {
    const plan = planTrendFetch("7d", null);
    const daily = win(0, DAY, [1, 2, 3], 2 * DAY + 1);
    const s = assembleTrendSlice(plan, { main: win(0, HOUR, [1]), daily });
    expect(s.daily?.buckets).toEqual([0, DAY]);
  });

  it("a committed range cuts the payload it was planned against", () => {
    const from = Date.UTC(2025, 8, 3);
    const to = Date.UTC(2025, 8, 5);
    const plan = planTrendFetch("all", { fromMs: from, toMs: to });
    const s = assembleTrendSlice(plan, { main: win(Date.UTC(2025, 8, 1), DAY, [1, 2, 3, 4, 5, 6]) });
    expect(s.buckets).toEqual([from, Date.UTC(2025, 8, 4), to]);
  });
});

describe("heldZoom", () => {
  it("maps the target span over the whole plot", () => {
    // Axis 0..100, target 75..100 → start at 3/4, stretched 4×.
    expect(heldZoom(0, 100, { fromMs: 75, toMs: 100 })).toEqual({ f0: 0.75, s: 4 });
  });
  it("zooming out shrinks the held plot into its place on the wider axis", () => {
    expect(heldZoom(50, 100, { fromMs: 0, toMs: 100 })).toEqual({ f0: -1, s: 0.5 });
  });
  it("declines a target the held axis never covered, a degenerate span, and a no-op", () => {
    expect(heldZoom(0, 100, { fromMs: 200, toMs: 300 })).toBeNull();
    expect(heldZoom(0, 0, { fromMs: 0, toMs: 10 })).toBeNull();
    expect(heldZoom(0, 100, { fromMs: 5, toMs: 5 })).toBeNull();
    expect(heldZoom(0, 100, { fromMs: 1, toMs: 101 })).toBeNull();
  });
});

describe("spanPhrase", () => {
  it("a pill says its own span; a brushed range names its UTC days, end exclusive", () => {
    // A day-only label is a UTC day for every reader, so a shared screenshot says one thing.
    expect(spanPhrase("7d", null)).toBe("last 7 days");
    expect(spanPhrase("all", null)).toBe("all measured");
    const d = (s: string) => Date.parse(s);
    expect(spanPhrase("30d", { fromMs: d("2026-09-20T00:00Z"), toMs: d("2026-09-27T00:00Z") })).toBe("Sep 20 – Sep 26");
    expect(spanPhrase("30d", { fromMs: d("2026-09-20T03:00Z"), toMs: d("2026-09-20T09:00Z") })).toBe("Sep 20");
  });
});

// HISTORY'S RAW IS THE RECORDS (user, 2026-10-07): RAW opens the anchor log for the span on screen —
// a brushed range when one stands, else the window's trailing span ending now.
describe("windowSpan — the span the History view has on screen", () => {
  const now = Date.UTC(2026, 9, 7, 12);
  it("a brushed range wins", () => {
    expect(windowSpan("30d", { fromMs: 1, toMs: 2 }, now)).toEqual({ fromMs: 1, toMs: 2 });
  });
  it("else the window's trailing span, ending now", () => {
    expect(windowSpan("1h", null, now)).toEqual({ fromMs: now - 3_600_000, toMs: now });
    expect(windowSpan("24h", null, now)).toEqual({ fromMs: now - 86_400_000, toMs: now });
    expect(windowSpan("7d", null, now)).toEqual({ fromMs: now - 7 * 86_400_000, toMs: now });
    expect(windowSpan("30d", null, now)).toEqual({ fromMs: now - 30 * 86_400_000, toMs: now });
    expect(windowSpan("1y", null, now)).toEqual({ fromMs: now - 365 * 86_400_000, toMs: now });
  });
  it("ALL has no span to hand over — the log opens on its newest page", () => {
    expect(windowSpan("all", null, now)).toBeNull();
  });
});

describe("rangeBuckets — the moments a range holds (the Moment card's pager under a Range, 2026-10-07)", () => {
  const D = 86_400_000;
  const H = 3_600_000;
  it("lists the WHOLE buckets inside the range, at the tier its charts are cut in", () => {
    // A brush starting mid-hour: the part-hour at either edge is no moment (the charts trim it).
    const from = Date.UTC(2026, 8, 10, 6, 30);
    const r = rangeBuckets({ fromMs: from, toMs: from + 3 * D });
    expect(r.stepMs).toBe(H);
    expect(r.buckets[0]).toBe(Date.UTC(2026, 8, 10, 7));
    expect(r.buckets.at(-1)).toBe(Date.UTC(2026, 8, 13, 5));
    expect(r.buckets.length).toBe(71);
  });
  it("a range on bucket boundaries keeps every bucket", () => {
    const from = Date.UTC(2026, 8, 10);
    expect(rangeBuckets({ fromMs: from, toMs: from + 3 * D }).buckets.length).toBe(72);
  });
  it("a long range steps in days, aligned to UTC midnight", () => {
    const r = rangeBuckets({ fromMs: Date.UTC(2026, 0, 1, 12), toMs: Date.UTC(2026, 5, 1) });
    expect(r.stepMs).toBe(D);
    expect(r.buckets[0]).toBe(Date.UTC(2026, 0, 2));
    expect(r.buckets.every((b) => b % D === 0)).toBe(true);
  });
});
