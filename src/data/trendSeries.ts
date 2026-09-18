import { bucketAt } from "@/src/data/trendWindow";
import type { TrendMetric } from "@/src/store/store";

// THE PER-NETWORK SERIES MATHS — one home (2026-09-18, the 3D trends view). What a per-network
// chart draws for a metric used to live inside `components/docs/TrendsDoc.tsx` as three panel
// builders, in the one directory rule 4's export coverage cannot see. The 3D stack is the
// SECOND reader of exactly that mapping, and two copies of "which stored row is this, does it
// rescale, is it a counter or a gauge" would be two copies of what the app ASSERTS about a
// network — which is the failure rule 10 is about, arriving as a silent divergence between two
// registers of the same reading.
//
// ⚠️ `import type` only. The metric union is a SHAPE, not a channel (the root CLAUDE.md's own
// words) — nothing here reads the store, react or THREE, and the colocated test is the
// specification (rule 4; `dataExportCoverage.test.ts` enforces the sibling).
//
// HONESTY (rule 10) is the whole content of this module:
//   · a null bucket is NOT MEASURED and survives as null — never a zero, never an interpolation;
//   · a division with an absent or zero denominator yields null: a chain that sealed nothing in
//     a bucket has no spacing, and "0 seconds between snapshots" would be a fabricated claim;
//   · a stored value is rescaled only where the stored unit is not the unit a reader is shown
//     (fees in datums, sizes in KB), and the formatter states that unit.

/** What a chart needs from the store for ONE network and ONE metric. */
export interface MetricSeries {
  /** The plotted points, in the unit the formatter states. null = not measured. */
  points: (number | null)[];
  /** COVERAGE, for a DERIVED metric — TrendChart's `sampled`: a null point over a sampled
   *  bucket is "nothing derivable here" (the line breaks, no amber), not an outage. Undefined
   *  where the points are their own coverage. */
  sampled?: (number | null)[];
  /** The chain's own per-bucket WIDEST gap, which scales the amber band to this chain's rhythm
   *  (TrendChart's `gaps`). Continuity only. */
  gaps?: (number | null)[];
}

export interface MetricSpec {
  /** COUNTER = a per-bucket SUM, so the partial edge buckets must go (`trimCounterEdges`) —
   *  a partial sum charted whole reads as a crash. GAUGE = a point sample, complete the moment
   *  it is taken, so nothing is trimmed: the fleet's only current reading lives in the newest
   *  bucket and a trim there would hide it. */
  kind: "counter" | "gauge";
  /** The stored row this metric reads for one network — null where the metric is DERIVED from
   *  more than one row, and so has no single key to hand a readout builder. */
  key: ((id: string) => string) | null;
  /** Stored value → the unit the formatter states. */
  scale: number;
  /** The unit word for the chart head, given the bucket cadence phrase (`perPhrase`). A
   *  quantity that is not a rate ignores it. */
  unit: (per: string) => string;
  /** Undefined = TrendChart's own default number format is right for this metric. */
  format?: (v: number) => string;
}

// THE VALUE FORMATTERS, one home — exported because the DOCUMENT's global (`g.*`) charts read
// the same quantities for the whole network that these rows read per network, and two copies of
// "how many decimals does a fee get" is two answers waiting to diverge.
/** DAG: two decimals under 10, none above — a fee is read at two very different scales. */
export const formatDag = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 2 : 0 })}`;
export const formatMb = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;
export const formatSeconds = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}s`;

const rate = (per: string) => per;

/** One row per stored metric — the whole mapping, readable in one screen. */
export const TREND_METRICS: Record<TrendMetric, MetricSpec> = {
  snapshots: { kind: "counter", key: (id) => `m.${id}.snaps`, scale: 1, unit: rate },
  blocks: { kind: "counter", key: (id) => `m.${id}.blocks`, scale: 1, unit: rate },
  // Stored in DATUMS, the chain's own integer unit; read in DAG.
  fees: { kind: "counter", key: (id) => `m.${id}.fee`, scale: 1e-8, unit: (per) => `DAG ${per}`, format: formatDag },
  // Stored in KB; read in MB, which is the scale a day of anchoring actually reaches.
  kb: { kind: "counter", key: (id) => `m.${id}.kb`, scale: 1 / 1024, unit: rate, format: formatMb },
  // The fleet gauge: sampled live, never backfillable (no historical record of the fleet exists
  // upstream), so its series begins the day the sampler first ran.
  nodes: { kind: "gauge", key: (id) => `f.nodes.${id}`, scale: 1, unit: () => "nodes", format: undefined },
  // MEAN SPACING = gapSum ÷ snaps per bucket. A day÷snaps approximation was rejected: for a
  // batching chain (dozens of snapshots in one tick, then idle) it reads as spacing that never
  // existed. It divides two COUNTER rows, so its edge buckets are exactly as partial as theirs.
  continuity: { kind: "counter", key: null, scale: 1, unit: () => "seconds", format: formatSeconds },
};

/** A metric that IS one stored row — everything but the derived `continuity`. Narrower than
 *  `kind: "counter"` and deliberately so: continuity is counter-TRIMMED (it divides two counter
 *  rows) yet has no row of its own, so the two ideas must not share one name. */
export type StoredMetric = Exclude<TrendMetric, "continuity">;

/** The metrics that are one stored COUNTER row — the four a per-network counter panel can serve.
 *  `nodes` is a gauge and `continuity` is derived, so neither belongs. */
export type CounterMetric = Exclude<StoredMetric, "nodes">;

/** The stored row a metric reads for one network, or null where it is derived from several. The
 *  overload is what lets a caller that already knows it holds a stored metric skip the null
 *  branch instead of asserting it away. */
export function seriesKey(metric: StoredMetric, id: string): string;
export function seriesKey(metric: TrendMetric, id: string): string | null;
export function seriesKey(metric: TrendMetric, id: string): string | null {
  return TREND_METRICS[metric].key?.(id) ?? null;
}

/** The bucket cadence in words. An hourly bucket labelled "per day" misstates every reading by
 *  a factor of 24, so the unit follows the tier rather than the metric. Prose, not the "/day"
 *  glyph — the head reads as a sentence. */
export function perPhrase(stepMs: number): string {
  return stepMs >= 86400000 ? "per day" : stepMs >= 3600000 ? "per hour" : "per 5 min";
}

/** The unit word a chart head carries for this metric at this bucket size. */
export function metricUnit(metric: TrendMetric, stepMs: number): string {
  return TREND_METRICS[metric].unit(perPhrase(stepMs));
}

/** COUNTER charts drop their partial EDGE buckets. A daily window loses both (the cutoff day
 *  starts mid-day; the last IS today, still filling); a sub-daily window loses only the newest,
 *  since stored fine buckets are complete once written. Generic on purpose — the buckets axis
 *  and every line must be cut identically or the axis desyncs from the plot. */
export function trimCounterEdges<T>(arr: readonly T[], stepMs: number): T[] {
  return arr.slice(stepMs >= 86400000 ? 1 : 0, -1);
}

/** What one network's chart draws for one metric — UNTRIMMED, because which trim applies is the
 *  caller's window question (`kind` says which). An unmeasured network yields an empty series
 *  rather than a row of zeros. */
export function metricSeries(
  metric: TrendMetric,
  id: string,
  series: Readonly<Record<string, (number | null)[]>>,
): MetricSeries {
  if (metric === "continuity") {
    const sum = series[`m.${id}.gapSum`] ?? [];
    const snaps = series[`m.${id}.snaps`] ?? [];
    return {
      // null wherever the division is not PROVABLE: no numerator, no denominator, or a bucket
      // in which the chain sealed nothing at all (there is no spacing between zero snapshots).
      points: sum.map((v, i) => {
        const n = snaps[i];
        return v != null && n != null && n > 0 ? v / n : null;
      }),
      // COPIES, like `points`. Every array this returns is the caller's to trim and slice; handing
      // back the payload's own row would let one consumer's cut reach the shared window cache.
      sampled: snaps.slice(),
      gaps: (series[`m.${id}.gapMax`] ?? []).slice(),
    };
  }
  const spec = TREND_METRICS[metric];
  const key = spec.key?.(id);
  const raw = (key != null ? series[key] : undefined) ?? [];
  return { points: spec.scale === 1 ? raw.slice() : raw.map((v) => (v == null ? null : v * spec.scale)) };
}

/** The newest value that was actually MEASURED — the last non-null, which is not the last
 *  bucket: a chain quiet for a week still has a reading, and it is a week old. */
export function lastMeasured(points: readonly (number | null)[]): number | null {
  return points.reduce<number | null>((acc, v) => (v != null ? v : acc), null);
}

/** BUSIEST FIRST, by each id's last measured value; nothing measured sorts last, and ties keep
 *  the order they came in. The vitals band's catalog-order rule guards LIVE charts that would
 *  reshuffle under the reader — a ranking laid out once per reading can be honest instead. */
export function rankByLast(
  ids: readonly string[],
  seriesOf: (id: string) => readonly (number | null)[],
): string[] {
  return ids
    .map((id) => ({ id, last: lastMeasured(seriesOf(id)) }))
    .sort((a, b) => (b.last ?? -1) - (a.last ?? -1))
    .map((x) => x.id);
}

// ── THE OVERVIEW REGISTER (2026-09-18, the vitals band's timeline) ───────────────────────────
// The same six metrics read for the WHOLE NETWORK rather than per chain. The band's timeline
// draws ONE quiet line over the whole measured span — a stack of per-network lines there would be
// a second copy of the scene it sits under — so it needs the global row that ANSWERS THE SAME
// QUESTION the planes above it are answering, and it has to be the same mapping or the overview
// would quietly describe a different quantity than the charts it frames.
//
// It lives beside the per-network table on purpose: the two are one decision read at two scales,
// and a `g.*` mapping kept inside a component is exactly the second home the per-network one was
// pulled out of. The honesty rules are unchanged — a null bucket is a GAP, a rescale states its
// unit, and a division with no provable denominator is null.

/** The stored GLOBAL row a metric reads, and the factor into the unit the formatter states.
 *  `key: null` = derived from more than one row (continuity), exactly as `MetricSpec.key` is. */
export const GLOBAL_METRIC_ROWS: Record<TrendMetric, { key: string | null; scale: number }> = {
  // The whole network's snapshot activity is what it ANCHORED — `g.ticks` counts global
  // snapshots, which is the hypergraph's own cadence, not the chains' production.
  snapshots: { key: "g.anchors", scale: 1 },
  blocks: { key: "g.blocks", scale: 1 },
  fees: { key: "g.feeFloor", scale: 1e-8 },
  kb: { key: "g.kbFloor", scale: 1 / 1024 },
  nodes: { key: "f.nodes", scale: 1 },
  continuity: { key: null, scale: 1 },
};

/** What the overview track draws for one metric across the whole network. Mirrors
 *  `metricSeries` — copies, never aliases, so a consumer's trim cannot reach the shared window
 *  cache — and derives continuity as the MEAN gap (`g.gapSum ÷ g.ticks`), null wherever the
 *  division is not provable: no numerator, no denominator, or a bucket in which the hypergraph
 *  sealed nothing at all. */
export function globalSeries(
  metric: TrendMetric,
  series: Readonly<Record<string, (number | null)[]>>,
): (number | null)[] {
  if (metric === "continuity") {
    const sum = series["g.gapSum"] ?? [];
    const ticks = series["g.ticks"] ?? [];
    return sum.map((v, i) => {
      const n = ticks[i];
      return v != null && n != null && n > 0 ? v / n : null;
    });
  }
  const row = GLOBAL_METRIC_ROWS[metric];
  const raw = (row.key != null ? series[row.key] : undefined) ?? [];
  return row.scale === 1 ? raw.slice() : raw.map((v) => (v == null ? null : v * row.scale));
}

// ── READING THE STACK AT ONE INSTANT (2026-09-19, the History view's cursor card) ────────────
// The rails read every network AT ONE MOMENT — the timeline commits an instant and the facts
// card states what each chain measured there. Three decidable questions, stated here beside the
// series maths they read, because the answers are exactly the sort rule 10 is about: a value
// that was never measured, a rank an unmeasured chain never earned, a zero standing in for a
// hole. The card composes; it decides nothing.

/** The reading in the bucket CONTAINING `ms`, or null.
 *
 *  ⚠️ CONTAINMENT, NEVER THE NEAREST BUCKET (`bucketAt`'s own rule, which this delegates to): an
 *  instant past a bucket's midpoint would otherwise read the NEXT day's number under a cursor the
 *  reader put on this one. Null in three cases, all of them facts rather than failures — outside
 *  the span on screen, a gap bucket (the chain measured nothing there), or a series shorter than
 *  the axis. Never interpolated, never zero-filled. */
export function valueAt(
  points: readonly (number | null)[],
  buckets: readonly number[],
  stepMs: number,
  ms: number,
): number | null {
  const start = bucketAt(buckets, stepMs, ms);
  if (start == null) return null;
  // A scan, not arithmetic: `(start − buckets[0]) / stepMs` assumes a UNIFORM axis, and
  // `monthlySum` builds one that is not. The axis is at most a few hundred buckets and this runs
  // once per network per cursor change.
  const i = buckets.indexOf(start);
  return i < 0 ? null : points[i] ?? null;
}

/** Where one reading stands among the others at the same instant. */
export interface InstantRank {
  /** 1-based, best first. */
  rank: number;
  /** How many networks HAD a reading there — the only honest denominator. */
  of: number;
}

/** `value`'s standing among `readings` (one per roster network, nulls included).
 *
 *  Two rules carry it. Only MEASURED readings count, on both sides: a chain with nothing in that
 *  bucket gets no rank at all (null) and is not in the total either, because a place in an order
 *  built from readings has to be earned by one. And TIES SHARE THE BETTER RANK (competition
 *  ranking, 1·2·2·4) — two chains that measured the same number are not first and second.
 *
 *  Ordered by value DESCENDING, the same direction `rankByLast` ranks the planes by, so "2 of 5"
 *  in the card and the second plane in the stack mean the same kind of thing. */
export function rankAt(readings: readonly (number | null)[], value: number | null): InstantRank | null {
  if (value == null) return null;
  let of = 0;
  let above = 0;
  for (const v of readings) {
    if (v == null) continue;
    of++;
    if (v > value) above++;
  }
  return of === 0 ? null : { rank: above + 1, of };
}

/** The cursor list's order: largest reading first, nothing measured LAST, ties keeping the order
 *  they came in. `rankByLast`'s rule read at one instant instead of at the newest one — a list
 *  that reshuffles is a list nobody can follow, so the tie-break is stability. */
export function orderAt(readings: readonly { id: string; value: number | null }[]): string[] {
  return readings
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => (a.value == null ? 1 : 0) - (b.value == null ? 1 : 0) || (b.value ?? 0) - (a.value ?? 0) || a.i - b.i)
    .map((r) => r.id);
}

/** THE READER'S WORD FOR EACH METRIC — one home, shared by the History view's metric picker and
 *  anything else that names a metric on glass. The document's own vocabulary: `kb` is stored in
 *  KB and read as DATA (nobody picks a unit off a menu), `continuity` is the spacing between a
 *  chain's snapshots. The internal ids stay what they are — one concept, two registers, the
 *  `cohort`/provider rule. */
export const METRIC_LABELS: Record<TrendMetric, string> = {
  snapshots: "Snapshots",
  blocks: "Blocks",
  fees: "Fees",
  kb: "Data",
  nodes: "Nodes",
  continuity: "Continuity",
};
