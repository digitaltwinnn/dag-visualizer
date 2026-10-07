import { describe, it, expect } from "vitest";
import { headWord, momentPhrase, rangePhrase, sumMeasured, spanAverage, spanWord, typeBands,
  GLOBAL_METRIC_ROWS,
  GLOBAL_READING,
  TREND_METRICS,
  globalSeries,
  formatDag,
  formatMb,
  formatSeconds,
  lastMeasured,
  latestDay,
  metricSeries,
  metricUnit,
  perPhrase,
  rankByLast,
  seriesKey,
  trimCounterEdges,
  METRIC_LABELS,
  METRIC_ORDER,
  holdOrder,
  metricCaption,
  stepMetric,
  orderAt,
  rankAt,
  valueAt,
  instantNote,
  placeInstant,
  sharedCeiling,
  stepFor,
  tierWord,
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

// ── A MOMENT NO CHART DRAWS (2026-09-19) ───────────────────────────────────────
// The band's timeline spans the whole MEASURED history; the planes draw that span minus the
// partial edge buckets a counter must lose (`trimCounterEdges`). So the far right of the track is
// clickable and undrawn at the same time — on the default metric in the default window — and the
// two reasons a cursor finds no chart are completely different facts. Telling them apart is what
// lets the card stop offering "pick a wider window" for a bucket that is excluded because it is
// still filling.
describe("placeInstant — drawn, trimmed at an edge, or outside the window", () => {
  const raw = [0, DAY, 2 * DAY, 3 * DAY, 4 * DAY];
  const drawn = raw.slice(1, -1); // what a daily COUNTER draws: both edges gone

  it("answers `drawn` anywhere the charts actually plot", () => {
    expect(placeInstant(DAY, drawn, raw, DAY)).toBe("drawn");
    expect(placeInstant(3 * DAY - 1, drawn, raw, DAY)).toBe("drawn");
  });

  it("names the NEWEST trimmed bucket, which is the most natural click on the track", () => {
    expect(placeInstant(4 * DAY, drawn, raw, DAY)).toBe("edge-newest");
    expect(placeInstant(5 * DAY - 1, drawn, raw, DAY)).toBe("edge-newest");
  });

  it("names the OLDEST trimmed bucket, which only the daily tier loses", () => {
    expect(placeInstant(0, drawn, raw, DAY)).toBe("edge-oldest");
    expect(placeInstant(DAY - 1, drawn, raw, DAY)).toBe("edge-oldest");
  });

  it("answers `outside` beyond the payload's own span — a real window question", () => {
    expect(placeInstant(-1, drawn, raw, DAY)).toBe("outside");
    expect(placeInstant(5 * DAY, drawn, raw, DAY)).toBe("outside");
  });

  it("is `drawn` everywhere for a GAUGE, whose axis is never trimmed", () => {
    for (const t of [0, 2 * DAY, 4 * DAY]) expect(placeInstant(t, raw, raw, DAY)).toBe("drawn");
  });

  it("calls an empty drawn axis `outside` — nothing is on screen to be at an edge of", () => {
    expect(placeInstant(2 * DAY, [], raw, DAY)).toBe("outside");
    expect(placeInstant(2 * DAY, [], [], DAY)).toBe("outside");
  });
});

describe("instantNote — why no chart draws this moment", () => {
  it("says nothing where there IS a chart", () => {
    expect(instantNote("drawn", DAY)).toBeNull();
  });

  it("names the still-filling edge in the tier's own word, and agrees with itself", () => {
    expect(instantNote("edge-newest", DAY)).toBe("The newest day is still filling, so no chart draws it yet.");
    expect(instantNote("edge-newest", 3_600_000)).toBe("The newest hour is still filling, so no chart draws it yet.");
    expect(instantNote("edge-newest", 300_000)).toBe(
      "The newest five minutes are still filling, so no chart draws them yet.",
    );
  });

  it("names the part-measured oldest edge", () => {
    expect(instantNote("edge-oldest", DAY)).toBe(
      "The oldest day here is only partly measured, so no chart draws it.",
    );
  });

  it("says a genuinely out-of-view moment is outside the charts, with the one route that always works", () => {
    // No "wider window" route: under a range the window buttons are hidden (the tester pass,
    // 2026-10-07). The cursor can always be moved.
    const out = instantNote("outside", DAY)!;
    expect(out).toMatch(/outside the charts/);
    expect(out).toMatch(/Move the cursor/);
  });

  // The app-wide plain-writing rule: two clauses get two sentences, never a dash clause.
  it("carries no dash clause in anything a reader sees", () => {
    for (const place of ["edge-newest", "edge-oldest", "outside"] as const) {
      for (const step of [DAY, 3_600_000, 300_000]) {
        expect(instantNote(place, step)!).not.toMatch(/[—–]|\s-\s/);
      }
    }
  });
});

// ── THE GRAIN A METRIC IS ACTUALLY DRAWN ON (2026-09-19) ────────────────────────────────────
// `nodes` is a GAUGE and therefore an hourly instrument: where the window's main payload is
// finer than an hour, the fleet's own payload stands in and the planes are drawn on ITS buckets
// (`assembleTrendSlice`'s takeover rule). Every surface that quantises, steps or stamps an
// instant has to follow the same grain, or the band quantises at five minutes while the charts
// draw hours: 11 of 12 arrow presses move nothing visible, and the band's stamp and the cursor
// card's title disagree about which bucket is under the cursor. Found live, 2026-09-19.
describe("stepFor — one answer about the grain, for every surface", () => {
  const FINE = { stepMs: 300_000, fStep: 3_600_000 };

  it("a COUNTER metric reads the window's own step", () => {
    for (const m of ["snapshots", "blocks", "fees", "kb", "continuity"] as const) {
      expect(stepFor(FINE, m)).toBe(FINE.stepMs);
    }
  });

  it("the GAUGE reads the fleet's step — the grain its planes are actually drawn on", () => {
    expect(stepFor(FINE, "nodes")).toBe(FINE.fStep);
  });

  it("falls back to the main step where the fleet has not taken over", () => {
    // `assembleTrendSlice` already carries that fallback in `fStep` (an hourly-or-coarser window
    // never hands the gauges a payload of their own), so the honest answer here is the slice's
    // own — this function picks a field, it does not invent a default.
    const DAILY = { stepMs: DAY, fStep: DAY };
    expect(stepFor(DAILY, "nodes")).toBe(DAY);
    expect(stepFor(DAILY, "snapshots")).toBe(DAY);
  });

  it("is the grain the metric's UNIT word is stated at, for every metric", () => {
    // The pairing that makes the bug visible: a unit phrase and a cursor step that disagree is
    // "per hour" printed over buckets the reader is stepping five minutes at a time.
    for (const m of Object.keys(TREND_METRICS) as (keyof typeof TREND_METRICS)[]) {
      expect(metricUnit(m, stepFor(FINE, m))).toBe(TREND_METRICS[m].unit(perPhrase(stepFor(FINE, m))));
    }
    expect(metricUnit("snapshots", stepFor(FINE, "snapshots"))).toBe("per 5 min");
  });
});

// ── THE SHARED CEILING (2026-09-19) ─────────────────────────────────────────────────────────
// Both registers of this rung offer "same scale": one ceiling across a section's panels (the
// document) or across the whole ranked roster (the stack). It is one question, and the two had
// two answers — the document's `Math.max(0, ...flatMap(…))` is the SPREAD the stack already
// replaced, one argument per measured bucket, which is the shape that throws `RangeError:
// Maximum call stack size exceeded` the day the store grows past the engine's argument limit.
describe("sharedCeiling — one ceiling function for both registers", () => {
  it("is the largest measured value across every series", () => {
    expect(sharedCeiling([[1, 9, 3], [4, null, 12], [2]])).toBe(12);
  });

  it("is 0 for no series at all, and for series with nothing measured", () => {
    expect(sharedCeiling([])).toBe(0);
    expect(sharedCeiling([[], []])).toBe(0);
    expect(sharedCeiling([[null, null], [null]])).toBe(0);
  });

  it("never goes below 0 — a ceiling under the baseline is not a scale", () => {
    expect(sharedCeiling([[-5, -2]])).toBe(0);
  });

  it("survives an input far past the engine's ARGUMENT limit (the spread's failure mode)", () => {
    // ~200k buckets: `Math.max(0, ...points)` throws here. A fold does not.
    const big = Array.from({ length: 200_000 }, (_, i) => (i % 7 === 0 ? null : i));
    expect(sharedCeiling([big, [1]])).toBe(199_999);
  });
});

// ── THE TIER'S WORD (2026-09-19) ────────────────────────────────────────────────────────────
// Two surfaces name the bucket tier: the cursor card's aside (a short LABEL) and the document's
// section leads (an adjective INSIDE a sentence). Two spellings of one vocabulary had grown —
// "5 min" against "five-minute" — so it is one table with two forms, and each call site keeps
// its own grammar.
describe("tierWord — one vocabulary, two forms", () => {
  it("labels the three tiers", () => {
    expect(tierWord(DAY, "label")).toBe("daily");
    expect(tierWord(3_600_000, "label")).toBe("hourly");
    expect(tierWord(300_000, "label")).toBe("5 min");
  });

  it("gives the sentence form the adjective a lead reads with", () => {
    expect(tierWord(DAY, "attributive")).toBe("daily");
    expect(tierWord(3_600_000, "attributive")).toBe("hourly");
    expect(tierWord(300_000, "attributive")).toBe("five-minute");
    expect(`Each network's own ${tierWord(300_000, "attributive")} snapshot count.`).toBe(
      "Each network's own five-minute snapshot count.",
    );
  });

  it("classifies on the SAME thresholds the unit phrase does", () => {
    // One tier, one answer — a head reading "per hour" over an aside reading "5 min" is the
    // divergence this table exists to prevent.
    for (const step of [DAY, 7 * DAY, 3_600_000, 7_200_000, 300_000, 60_000]) {
      const per = perPhrase(step);
      const word = tierWord(step, "label");
      expect(per === "per day" ? "daily" : per === "per hour" ? "hourly" : "5 min").toBe(word);
    }
  });
});

describe("stepping the measure from a card", () => {
  it("METRIC_ORDER is the picker's own order — every measure, once", () => {
    expect(METRIC_ORDER).toEqual(Object.keys(METRIC_LABELS));
    expect(new Set(METRIC_ORDER).size).toBe(METRIC_ORDER.length);
  });

  it("steps to the neighbour in either direction", () => {
    expect(stepMetric("snapshots", 1)).toBe("blocks");
    expect(stepMetric("blocks", -1)).toBe("snapshots");
    expect(stepMetric("nodes", 1)).toBe("continuity");
  });

  it("does not wrap: the ends answer null, which is what dims the chevron", () => {
    expect(stepMetric(METRIC_ORDER[0], -1)).toBeNull();
    expect(stepMetric(METRIC_ORDER[METRIC_ORDER.length - 1], 1)).toBeNull();
  });

  it("walking down from the first measure visits every one exactly once", () => {
    const seen = [METRIC_ORDER[0]];
    for (let m = stepMetric(seen[0], 1); m; m = stepMetric(m, 1)) seen.push(m);
    expect(seen).toEqual(METRIC_ORDER);
  });
});

describe("metricCaption — what a card says it is showing", () => {
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  it("reads a bare rate as part of the name, at the tier's own grain", () => {
    expect(metricCaption("snapshots", DAY)).toBe("Snapshots per day");
    expect(metricCaption("blocks", HOUR)).toBe("Blocks per hour");
  });
  it("sets off a unit that carries its own noun", () => {
    expect(metricCaption("fees", DAY)).toBe("Fees in DAG per day");
    expect(metricCaption("continuity", DAY)).toBe("Continuity in seconds");
  });
  it("drops a unit that only repeats the name", () => {
    expect(metricCaption("nodes", DAY)).toBe("Nodes");
  });
});

describe("holdOrder — the stack keeps its order while its plots change", () => {
  it("keeps the order on screen, whatever the new measure wants", () => {
    expect(holdOrder(["a", "b", "c"], ["c", "a", "b"])).toEqual(["a", "b", "c"]);
  });
  it("drops an id the roster no longer has — a hold can never point at a row that is gone", () => {
    expect(holdOrder(["a", "b", "c"], ["c", "a"])).toEqual(["a", "c"]);
  });
  it("appends a newcomer, in the ranking's own order, behind what is held", () => {
    expect(holdOrder(["a", "b"], ["z", "b", "y", "a"])).toEqual(["a", "b", "z", "y"]);
  });
  it("an empty hold adopts the ranking, and an empty ranking empties the hold", () => {
    expect(holdOrder([], ["b", "a"])).toEqual(["b", "a"]);
    expect(holdOrder(["a", "b"], [])).toEqual([]);
  });
  it("never mutates what it was given", () => {
    const held = ["a", "b"], ranked = ["b", "c"];
    holdOrder(held, ranked);
    expect(held).toEqual(["a", "b"]);
    expect(ranked).toEqual(["b", "c"]);
  });
});

// THE ONE HEADLINE READING (user, 2026-09-29: "day should be the standard always"): the newest
// complete DAY of a plane's own series — through the same `metricSeries` / `globalSeries` read
// that draws it, so counters, gauges and continuity all have one.
describe("latestDay", () => {
  const DAY = 86_400_000;
  const daily = { "m.dor.snaps": [10, 20, null], "g.anchors": [3, 4, null] } as Record<string, (number | null)[]>;
  it("reads the daily tier when the charts are finer than a day", () => {
    expect(latestDay("snapshots", "dor", daily, [1, 2, 3], 300_000)).toBe(20);
    expect(latestDay("snapshots", "dag", daily, [1, 2, 3], 300_000)).toBe(4); // the hypergraph plane reads the global row
  });
  it("is the chart's own last point when the chart already IS daily", () => {
    expect(latestDay("snapshots", "dor", undefined, [4, 5, null], DAY)).toBe(5);
  });
  it("is null — never a finer bucket passed off as a day — while the daily tier is still in flight", () => {
    expect(latestDay("snapshots", "dor", undefined, [1, 2, 3], 300_000)).toBeNull();
  });
});

describe("spanAverage", () => {
  it("a counter is its measured mean scaled to a day; holes are left out, not zeros", () => {
    expect(spanAverage("snapshots", [10, null, 30], 3_600_000)).toBe(20 * 24);
    expect(spanAverage("snapshots", [100, 200], 86_400_000)).toBe(150);
  });
  it("a gauge is its plain mean", () => {
    expect(spanAverage("nodes", [10, 20, null], 3_600_000)).toBe(15);
  });
  it("continuity is weighted by the snapshots behind each bucket", () => {
    // 60s over 1 snapshot and 10s over 9: Σgaps 150 ÷ Σsnaps 10.
    expect(spanAverage("continuity", [60, 10, null], 3_600_000, [1, 9, 5])).toBe(15);
    expect(spanAverage("continuity", [60], 3_600_000)).toBeNull();
  });
  it("nothing measured is no reading", () => {
    expect(spanAverage("fees", [null, null], 3_600_000)).toBeNull();
  });
  it("names the average a rate reads as per day, anything else plainly", () => {
    expect(spanWord("snapshots")).toBe("Average per day");
    expect(spanWord("nodes")).toBe("Average");
    expect(spanWord("continuity")).toBe("Average");
  });
});

describe("headWord", () => {
  it("names the head reading: the day, or the span's average", () => {
    expect(headWord("snapshots", "day")).toBe("latest full day");
    expect(headWord("snapshots", "span")).toBe("daily average");
    expect(headWord("nodes", "span")).toBe("average");
  });
});

describe("typeBands", () => {
  const series = {
    "f.type.dor.dl1": [null, 15, 14, null],
    "f.type.dor.l0+cl1+dl1": [null, 3, null, null],
    "f.type.ded.dl1": [9, 9, 9, 9],
    "f.nodes.dor": [18, 18, 17, 17],
  };
  it("a network's types, richest make-up first, in the composition vocabulary", () => {
    const b = typeBands("dor", series);
    expect(b.map((x) => x.key)).toEqual(["l0+cl1+dl1", "dl1"]);
    expect(b[0]).toMatchObject({ label: "Hybrid", codes: ["L0", "cL1", "dL1"] });
    expect(b[1]).toMatchObject({ label: "Data", codes: ["dL1"] });
  });
  it("a missing type in a RECORDED bucket is 0; an unrecorded bucket is null in every band", () => {
    const [hyb, data] = typeBands("dor", series);
    expect(hyb!.points).toEqual([null, 3, 0, null]);
    expect(data!.points).toEqual([null, 15, 14, null]);
  });
  it("no type history at all is no bands, never a fabricated split", () => {
    expect(typeBands("up", series)).toEqual([]);
  });
});

describe("GLOBAL_READING — what the DAG's pinned row is beside the rows below it", () => {
  it("is a total only where it is the networks' rows added up", () => {
    expect(GLOBAL_READING.snapshots).toBe("total");
    expect(GLOBAL_READING.fees).toBe("total");
    expect(GLOBAL_READING.kb).toBe("total");
  });

  it("is the DAG's own figure everywhere else — one distinction, so one tag", () => {
    expect(GLOBAL_READING.nodes).toBe("own");
    expect(GLOBAL_READING.blocks).toBe("own");
    expect(GLOBAL_READING.continuity).toBe("own");
    expect(new Set(Object.values(GLOBAL_READING))).toEqual(new Set(["total", "own"]));
  });

  it("answers for every measure the explorer can pick", () => {
    expect(Object.keys(GLOBAL_READING).sort()).toEqual([...METRIC_ORDER].sort());
  });
});

describe("the DAG's own nodes are a stored series, like any network's", () => {
  it("reads f.nodes.dag through metricSeries — never the fleet total", () => {
    const series = { "f.nodes": [167], "f.nodes.dag": [135], "f.nodes.dor": [17] };
    expect(metricSeries("nodes", "dag", series).points).toEqual([135]);
    expect(globalSeries("nodes", series)).toEqual([167]);
  });
});

describe("momentPhrase — a moment's reading as a sentence about its network (user, 2026-10-07)", () => {
  const say = (m: Parameters<typeof momentPhrase>[0], step: number, v: string) => {
    const p = momentPhrase(m, step);
    return `DED ${p.verb} ${v} ${p.rest}`.trim();
  };
  // A moment is one bucket: what the network DID inside it, never a rate.
  it("says what the network did in the moment's bucket", () => {
    expect(say("snapshots", 300_000, "7")).toBe("DED anchored 7 snapshots in those 5 minutes");
    expect(say("blocks", 3_600_000, "120")).toBe("DED produced 120 blocks in that hour");
    expect(say("fees", DAY, "0.42")).toBe("DED paid 0.42 DAG in fees on that day");
  });
  it("leaves the noun to a formatter that carries it, and a gauge to what stood", () => {
    expect(say("kb", DAY, "1.2 MB")).toBe("DED anchored 1.2 MB of data on that day");
    expect(say("nodes", DAY, "12")).toBe("DED ran 12 nodes");
    expect(say("continuity", DAY, "28s")).toBe("DED anchored a snapshot every 28s on that day");
  });
});

describe("rangePhrase — a range's reading as a sentence about its network (2026-10-07)", () => {
  // The span itself is the card's Start / End / Length rows (user: "Start and end date should be in
  // the card"), so the sentence says "in this range" rather than restating the length.
  const say = (m: Parameters<typeof rangePhrase>[0], v: string, partial = false) => {
    const p = rangePhrase(m, partial);
    return `DED ${p.verb} ${v} ${p.rest}`;
  };
  it("a counter is the TOTAL over the range", () => {
    expect(say("snapshots", "52,140")).toBe("DED anchored 52,140 snapshots in this range");
    expect(say("fees", "3.2")).toBe("DED paid 3.2 DAG in fees in this range");
    expect(say("kb", "40 MB")).toBe("DED anchored 40 MB of data in this range");
  });
  it("a total with unmeasured buckets is said as a floor", () => {
    expect(say("snapshots", "52,140", true)).toBe("DED anchored at least 52,140 snapshots in this range");
  });
  it("a gauge and the spacing are averages, and say so", () => {
    expect(say("nodes", "12")).toBe("DED ran 12 nodes on average");
    expect(say("continuity", "28s")).toBe("DED anchored a snapshot every 28s on average");
  });
});

describe("sumMeasured — a counter's total over a span", () => {
  it("adds what was measured and says whether any bucket was not", () => {
    expect(sumMeasured([1, 2, 3])).toEqual({ sum: 6, partial: false });
    expect(sumMeasured([1, null, 3])).toEqual({ sum: 4, partial: true });
  });
  it("nothing measured is no total, never a zero", () => {
    expect(sumMeasured([null, null])).toBeNull();
    expect(sumMeasured([])).toBeNull();
  });
});
