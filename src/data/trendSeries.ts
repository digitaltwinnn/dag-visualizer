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

/** The stored row a metric reads for one network, or null where it is derived from several. */
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
      points: sum.map((v, i) => (v != null && snaps[i] != null && snaps[i]! > 0 ? v / snaps[i]! : null)),
      sampled: snaps,
      gaps: series[`m.${id}.gapMax`] ?? [],
    };
  }
  const spec = TREND_METRICS[metric];
  const raw = series[spec.key!(id)] ?? [];
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
