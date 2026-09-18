import { describe, it, expect } from "vitest";
import {
  GLOBAL_METRIC_ROWS,
  TREND_METRICS,
  globalSeries,
  formatDag,
  formatMb,
  formatSeconds,
  lastMeasured,
  metricSeries,
  metricUnit,
  perPhrase,
  rankByLast,
  seriesKey,
  trimCounterEdges,
  METRIC_LABELS,
  orderAt,
  rankAt,
  valueAt,
} from "./trendSeries";

// The per-network series maths, as a specification (rule 4 — dataExportCoverage enforces this
// sibling). Everything here decides what a chart ASSERTS, so the honesty cases are the ones
// worth pinning: a null bucket stays null (a gap, never a zero), and a division whose
// denominator is absent or zero yields null rather than a plausible number.

const DAY = 86400000;

describe("the metric table", () => {
  it("covers every stored metric, and only fees and bytes rescale", () => {
    expect(Object.keys(TREND_METRICS).sort()).toEqual(
      ["blocks", "continuity", "fees", "kb", "nodes", "snapshots"],
    );
    // Fees are stored in datums (1e-8 DAG) and sizes in KB — the two places the stored unit is
    // not the unit a reader is shown.
    expect(TREND_METRICS.fees.scale).toBe(1e-8);
    expect(TREND_METRICS.kb.scale).toBe(1 / 1024);
    expect(TREND_METRICS.snapshots.scale).toBe(1);
  });

  it("names the stored row each metric reads, and continuity has none of its own", () => {
    expect(seriesKey("snapshots", "dor")).toBe("m.dor.snaps");
    expect(seriesKey("blocks", "dor")).toBe("m.dor.blocks");
    expect(seriesKey("fees", "dor")).toBe("m.dor.fee");
    expect(seriesKey("kb", "dor")).toBe("m.dor.kb");
    expect(seriesKey("nodes", "dor")).toBe("f.nodes.dor");
    // Derived from two stored rows, so there is no single key to hand a readout builder.
    expect(seriesKey("continuity", "dor")).toBeNull();
  });

  it("formats only where TrendChart's own default is wrong", () => {
    expect(TREND_METRICS.snapshots.format).toBeUndefined();
    expect(TREND_METRICS.blocks.format).toBeUndefined();
    expect(TREND_METRICS.nodes.format).toBeUndefined();
    expect(formatMb(3.25)).toBe("3.3 MB");
    expect(formatSeconds(42.4)).toBe("42s");
    // Under 10 DAG keeps two decimals, above it none — a fee is read at two very different scales.
    expect(formatDag(1.234)).toBe("1.23");
    expect(formatDag(12.34)).toBe("12");
    // ONE HOME: the document's global charts import these same three, so a row's formatter must
    // BE the exported one rather than a copy that can drift from it.
    expect(TREND_METRICS.kb.format).toBe(formatMb);
    expect(TREND_METRICS.fees.format).toBe(formatDag);
    expect(TREND_METRICS.continuity.format).toBe(formatSeconds);
  });

  it("gauges are untrimmed, counters lose their partial edges", () => {
    expect(TREND_METRICS.nodes.kind).toBe("gauge");
    expect(TREND_METRICS.snapshots.kind).toBe("counter");
    // Continuity divides two counter rows, so its edge buckets are exactly as partial as theirs.
    expect(TREND_METRICS.continuity.kind).toBe("counter");
  });
});

describe("the unit word", () => {
  it("follows the bucket cadence — an hourly bucket labelled per day misstates it 24×", () => {
    expect(perPhrase(DAY)).toBe("per day");
    expect(perPhrase(3600000)).toBe("per hour");
    expect(perPhrase(300000)).toBe("per 5 min");
    expect(metricUnit("snapshots", DAY)).toBe("per day");
    expect(metricUnit("fees", 3600000)).toBe("DAG per hour");
  });

  it("is cadence-free where the quantity is not a rate", () => {
    expect(metricUnit("nodes", DAY)).toBe("nodes");
    expect(metricUnit("continuity", 300000)).toBe("seconds");
  });
});

describe("trimCounterEdges", () => {
  it("drops both edges of a daily window and only the newest of a finer one", () => {
    expect(trimCounterEdges([1, 2, 3, 4], DAY)).toEqual([2, 3]);
    expect(trimCounterEdges([1, 2, 3, 4], 3600000)).toEqual([1, 2, 3]);
  });

  it("trims buckets and points the same way, so an axis can never desync from its line", () => {
    const buckets = [10, 20, 30, 40];
    const points = [null, 5, 6, 7];
    expect(trimCounterEdges(buckets, DAY).length).toBe(trimCounterEdges(points, DAY).length);
  });
});

describe("metricSeries", () => {
  const series = {
    "m.dor.snaps": [null, 10, 20],
    "m.dor.fee": [null, 100000000, 250000000],
    "m.dor.kb": [2048, null, 1024],
    "f.nodes.dor": [3, null, 5],
  };

  it("scales a stored counter and keeps every null a null", () => {
    expect(metricSeries("fees", "dor", series).points).toEqual([null, 1, 2.5]);
    expect(metricSeries("kb", "dor", series).points).toEqual([2, null, 1]);
  });

  it("returns an empty series for a network the store has never measured", () => {
    expect(metricSeries("snapshots", "nope", series).points).toEqual([]);
  });

  it("reads the gauge row for nodes, untouched", () => {
    expect(metricSeries("nodes", "dor", series).points).toEqual([3, null, 5]);
  });

  it("derives continuity as gapSum ÷ snaps, null wherever the division is not provable", () => {
    const s = {
      "m.dor.gapSum": [100, 60, null, 30],
      "m.dor.snaps": [10, 0, 5, null],
      "m.dor.gapMax": [40, null, 9, 9],
    };
    // 100/10 measured; 0 snapshots is a quiet bucket, not a zero-second spacing; a null
    // numerator and a null denominator are each a gap.
    expect(metricSeries("continuity", "dor", s).points).toEqual([10, null, null, null]);
    // COVERAGE rides the chain's own snaps row, and the widest-gap row scales the amber band —
    // both handed through untrimmed, so the caller trims them with the points.
    expect(metricSeries("continuity", "dor", s).sampled).toEqual([10, 0, 5, null]);
    expect(metricSeries("continuity", "dor", s).gaps).toEqual([40, null, 9, 9]);
  });

  it("hands no coverage row for a metric whose points are their own coverage", () => {
    expect(metricSeries("snapshots", "dor", series).sampled).toBeUndefined();
    expect(metricSeries("snapshots", "dor", series).gaps).toBeUndefined();
  });

  it("returns COPIES, never the payload's own rows — a caller's trim must not reach the cache", () => {
    const s = { "m.dor.gapSum": [100], "m.dor.snaps": [10], "m.dor.gapMax": [40] };
    const out = metricSeries("continuity", "dor", s);
    expect(out.sampled).not.toBe(s["m.dor.snaps"]);
    expect(out.gaps).not.toBe(s["m.dor.gapMax"]);
    out.sampled!.length = 0;
    out.gaps!.length = 0;
    expect(s["m.dor.snaps"]).toEqual([10]);
    expect(s["m.dor.gapMax"]).toEqual([40]);
    // The unscaled counter path copies too (scale === 1 takes its own branch).
    const counter = metricSeries("snapshots", "dor", { "m.dor.snaps": s["m.dor.snaps"] });
    expect(counter.points).not.toBe(s["m.dor.snaps"]);
  });
});

describe("the busiest-first ranking", () => {
  it("reads the LAST measured value, not the newest bucket", () => {
    expect(lastMeasured([1, 9, null, null])).toBe(9);
    expect(lastMeasured([null, null])).toBeNull();
    expect(lastMeasured([])).toBeNull();
    // 0 is a measurement, not an absence.
    expect(lastMeasured([5, 0])).toBe(0);
  });

  it("orders descending, with nothing-measured last and ties left in roster order", () => {
    const rows: Record<string, (number | null)[]> = {
      a: [1, 2],
      b: [null, null],
      c: [9],
      d: [2],
    };
    expect(rankByLast(["a", "b", "c", "d"], (id) => rows[id])).toEqual(["c", "a", "d", "b"]);
  });
});

// ── THE OVERVIEW REGISTER (2026-09-18, the band's timeline) ─────────────────────────────────
// The same six metrics read for the WHOLE network rather than per chain. It is the third reader
// of this mapping, so the honesty rules are the same ones and the tests say so: a null bucket is
// a gap, and the derived continuity row divides only where the division is provable.
describe("the global (whole-network) series", () => {
  it("names one stored row per stored metric, with the unit the reader is shown", () => {
    expect(GLOBAL_METRIC_ROWS.snapshots).toEqual({ key: "g.anchors", scale: 1 });
    expect(GLOBAL_METRIC_ROWS.blocks).toEqual({ key: "g.blocks", scale: 1 });
    expect(GLOBAL_METRIC_ROWS.fees).toEqual({ key: "g.feeFloor", scale: 1e-8 });
    expect(GLOBAL_METRIC_ROWS.kb).toEqual({ key: "g.kbFloor", scale: 1 / 1024 });
    expect(GLOBAL_METRIC_ROWS.nodes).toEqual({ key: "f.nodes", scale: 1 });
    // Derived from two rows, so it names none — the same shape TREND_METRICS.continuity has.
    expect(GLOBAL_METRIC_ROWS.continuity.key).toBeNull();
  });

  it("rescales a stored row into the unit the formatter states, and keeps nulls null", () => {
    const series = { "g.feeFloor": [100_000_000, null, 0] };
    expect(globalSeries("fees", series)).toEqual([1, null, 0]);
    expect(globalSeries("kb", { "g.kbFloor": [1024, null] })).toEqual([1, null]);
  });

  it("copies rather than aliasing the payload's own row", () => {
    const row = [1, 2, 3];
    const out = globalSeries("snapshots", { "g.anchors": row });
    expect(out).toEqual([1, 2, 3]);
    expect(out).not.toBe(row);
  });

  it("answers an absent row with an empty series, never a row of zeros", () => {
    expect(globalSeries("blocks", {})).toEqual([]);
  });

  it("derives continuity as the MEAN gap, null wherever the division is not provable", () => {
    const series = {
      "g.gapSum": [100, 100, 100, null, 50],
      "g.ticks": [10, 0, null, 5, 5],
    };
    //            measured   ticks=0   ticks null  sum null  measured
    expect(globalSeries("continuity", series)).toEqual([10, null, null, null, 10]);
  });
});

// ── READING ONE INSTANT (2026-09-19, the History view's cursor card) ─────────────────────────
// The rail reads every network AT ONE MOMENT, so three questions become decidable facts: what
// this network measured in the bucket CONTAINING that instant, where it stands among the others
// there, and in what order the list runs. Every one of them is a place rule 10 could be broken
// invisibly — an interpolated value, a zero standing in for a gap, an unmeasured network given
// a rank it never earned.
describe("valueAt — the reading in the bucket CONTAINING an instant", () => {
  const buckets = [0, DAY, 2 * DAY, 3 * DAY];
  const points = [10, null, 30, 40];

  it("reads the bucket the instant falls in, at either edge", () => {
    expect(valueAt(points, buckets, DAY, 0)).toBe(10);
    expect(valueAt(points, buckets, DAY, DAY - 1)).toBe(10);
    expect(valueAt(points, buckets, DAY, 2 * DAY)).toBe(30);
    expect(valueAt(points, buckets, DAY, 4 * DAY - 1)).toBe(40);
  });

  it("answers null OUTSIDE the span, never the nearest bucket", () => {
    expect(valueAt(points, buckets, DAY, -1)).toBeNull();
    expect(valueAt(points, buckets, DAY, 4 * DAY)).toBeNull();
    expect(valueAt(points, [], DAY, 0)).toBeNull();
  });

  it("answers null for a GAP bucket — never a zero, never an interpolation", () => {
    expect(valueAt(points, buckets, DAY, DAY + 5)).toBeNull();
  });

  it("answers null where the series is shorter than the axis", () => {
    expect(valueAt([10], buckets, DAY, 3 * DAY)).toBeNull();
  });
});

describe("rankAt — where one reading stands among the others at that instant", () => {
  it("counts only the networks that HAVE a reading there", () => {
    expect(rankAt([50, 30, null, 10], 30)).toEqual({ rank: 2, of: 3 });
    expect(rankAt([50, 30, null, 10], 50)).toEqual({ rank: 1, of: 3 });
    expect(rankAt([50, 30, null, 10], 10)).toEqual({ rank: 3, of: 3 });
  });

  it("gives an unmeasured network NO rank — a place in an order built from readings", () => {
    expect(rankAt([50, 30, null], null)).toBeNull();
    expect(rankAt([null, null], null)).toBeNull();
  });

  it("answers null when nothing at all was measured", () => {
    expect(rankAt([], 5)).toBeNull();
  });

  it("ties SHARE the better rank (competition ranking)", () => {
    expect(rankAt([30, 30, 10], 30)).toEqual({ rank: 1, of: 3 });
    expect(rankAt([30, 30, 10], 10)).toEqual({ rank: 3, of: 3 });
  });

  it("ranks a single-network roster first of one", () => {
    expect(rankAt([7], 7)).toEqual({ rank: 1, of: 1 });
  });
});

describe("orderAt — the cursor list's order", () => {
  it("runs largest first, with nothing measured LAST", () => {
    expect(
      orderAt([
        { id: "a", value: 10 },
        { id: "b", value: null },
        { id: "c", value: 40 },
      ]),
    ).toEqual(["c", "a", "b"]);
  });

  it("keeps the incoming order for ties and for a roster of all nulls", () => {
    expect(orderAt([{ id: "a", value: 5 }, { id: "b", value: 5 }])).toEqual(["a", "b"]);
    expect(orderAt([{ id: "a", value: null }, { id: "b", value: null }])).toEqual(["a", "b"]);
  });

  it("answers an empty roster with an empty order", () => {
    expect(orderAt([])).toEqual([]);
  });
});

describe("METRIC_LABELS — the reader's word for each metric", () => {
  it("names every metric, in the document's own vocabulary", () => {
    expect(Object.keys(METRIC_LABELS).sort()).toEqual(Object.keys(TREND_METRICS).sort());
    // `kb` is stored in bytes and read as DATA — the reader's word, never the stored unit.
    expect(METRIC_LABELS.kb).toBe("Data");
    expect(METRIC_LABELS.snapshots).toBe("Snapshots");
  });
});
