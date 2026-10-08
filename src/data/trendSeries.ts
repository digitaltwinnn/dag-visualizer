import { bucketAt } from "@/src/data/trendWindow";
import { roleKeyLabel } from "@/src/data/composition";
import type { TrendMetric } from "@/src/store/store";
import { compactDag } from "@/src/util/format";

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
export const formatDag = (v: number) => compactDag(v); // "0.05", "12", "4.3K" (user, 2026-10-07)
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

/** ONE CEILING FOR A SET OF SERIES — what "same scale" means, in both registers (2026-09-19).
 *
 *  The largest MEASURED value across every series handed in, floored at 0 (a ceiling under the
 *  baseline is not a scale, and an all-null set has no peak to state). Nulls are holes, never
 *  zeros, so they contribute nothing either way.
 *
 *  ⚠️ A FOLD, NEVER `Math.max(0, ...points)`. The spread puts one argument on the stack per
 *  measured bucket, and a long window across a full roster is tens of thousands of them — the
 *  shape that throws `RangeError: Maximum call stack size exceeded` the day the store grows past
 *  the engine's argument limit. The stack had already replaced its spread; the document had not,
 *  which is exactly why this is a function and not a line in each. */
export function sharedCeiling(series: readonly (readonly (number | null)[])[]): number {
  let max = 0;
  for (const points of series) {
    for (const v of points) if (v != null && v > max) max = v;
  }
  return max;
}

/** The bucket TIER, as one classification — the thresholds `perPhrase` reads, named. */
type Tier = "day" | "hour" | "fine";
const tierOf = (stepMs: number): Tier => (stepMs >= 86400000 ? "day" : stepMs >= 3600000 ? "hour" : "fine");

/** THE TIER'S WORD, IN THE TWO FORMS A READER MEETS IT IN (2026-09-19). ONE table, because it is
 *  one vocabulary: the cursor card's aside is a short LABEL beside a title ("5 min"), while a
 *  document section's lead needs the ADJECTIVE that reads inside a sentence ("Each network's own
 *  five-minute snapshot count"). Two spellings had grown in two components, which is how one app
 *  comes to call the same tier two things on two surfaces. */
export function tierWord(stepMs: number, form: "label" | "attributive"): string {
  const tier = tierOf(stepMs);
  if (tier === "day") return "daily";
  if (tier === "hour") return "hourly";
  return form === "label" ? "5 min" : "five-minute";
}

/** THE GRAIN A METRIC IS ACTUALLY DRAWN ON — one answer, for every surface (2026-09-19).
 *
 *  A GAUGE is an hourly instrument: where the window's main payload is finer than an hour the
 *  fleet's own hourly payload stands in, and `assembleTrendSlice` publishes that as `fStep` (which
 *  already mirrors `stepMs` wherever no takeover happened, so there is no default to invent here).
 *  Everything a reader touches follows the buckets ON SCREEN — the unit phrase, the cursor's
 *  quantisation, the arrow-key step, the stamp's precision — so they all have to ask this one
 *  question the same way.
 *
 *  ⚠️ THE BUG IT CLOSES: the band's timeline read `slice.stepMs` while the planes and the cursor
 *  card read the roster's gauge-aware step. With metric = Nodes and a fine window the band
 *  quantised, stepped and stamped at five minutes over charts drawn in hours — 11 of 12 ArrowRight
 *  presses moved nothing visible, the scrub wrote twelve times per drawn bucket, and the band read
 *  "13:45 UTC" beside a card titled "13:00 UTC". Two readings of the same window is the whole
 *  defect, so this is a function rather than a line in each consumer. */
export function stepFor(slice: { stepMs: number; fStep: number }, metric: TrendMetric): number {
  return TREND_METRICS[metric].kind === "gauge" ? slice.fStep : slice.stepMs;
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

/** THE HEAD READING: a plane's newest complete DAY (user, 2026-09-29: "a latest 5 min is less
 *  easy to understand than a last day … day should be the standard always"). Read through the SAME
 *  `metricSeries` / `globalSeries` the plane is drawn from, so a counter, a gauge and continuity
 *  all answer — over the DAILY tier (`TrendSlice.daily`, still-filling day already trimmed) where
 *  the charts are finer than a day, or the chart's own last point where it already is daily.
 *  Null while the daily tier is in flight: a finer bucket is never passed off as a day. */
export function latestDay(
  metric: TrendMetric,
  id: string,
  daily: Readonly<Record<string, (number | null)[]>> | undefined,
  chartPoints: readonly (number | null)[],
  stepMs: number,
): number | null {
  if (stepMs >= 86_400_000) return lastMeasured(chartPoints);
  if (!daily) return null;
  return lastMeasured(id === "dag" ? globalSeries(metric, daily) : metricSeries(metric, id, daily).points);
}

/** THE SPAN READING — the roster's `head` over a window of a day or more (user, 2026-09-29,
 *  design A: "the explorer follows the range"). One number per network for the whole window on screen, so the list and
 *  the range selector answer the same question:
 *    · a COUNTER (a per-bucket sum) → its AVERAGE PER DAY: the mean of the MEASURED buckets,
 *      scaled from the bucket to a day. Unmeasured buckets are left out, never counted as zeros;
 *    · a GAUGE (the fleet) → the plain mean of its measured samples;
 *    · CONTINUITY (mean spacing) → weighted by the snapshots each bucket's spacing was measured
 *      over (`weights`), which is Σgaps ÷ Σsnaps over the span. A plain mean of per-bucket means
 *      would let an hour with two snapshots count as much as one with two hundred.
 *  Null where nothing in the span was measured (rule 10: no reading is not a zero). */
export function spanAverage(
  metric: TrendMetric,
  points: readonly (number | null)[],
  stepMs: number,
  weights?: readonly (number | null)[],
): number | null {
  if (metric === "continuity") {
    let num = 0;
    let den = 0;
    for (let i = 0; i < points.length; i++) {
      const v = points[i];
      const w = weights?.[i];
      if (v != null && w != null && w > 0) {
        num += v * w;
        den += w;
      }
    }
    return den > 0 ? num / den : null;
  }
  let sum = 0;
  let n = 0;
  for (const v of points) {
    if (v != null) {
      sum += v;
      n++;
    }
  }
  if (n === 0) return null;
  const mean = sum / n;
  return TREND_METRICS[metric].kind === "counter" ? mean * (86_400_000 / stepMs) : mean;
}

/** The short word beside a HEAD reading, the same on the plane's headline and in the list's
 *  hover: the latest full day, or the span's average. */
export function headWord(metric: TrendMetric, kind: "span" | "day"): string {
  if (kind === "day") return "latest full day";
  // Whole words, and no leading mark: the word is a LABEL that precedes its number
  // ("daily average 26,573") — it was "avg per day" after a mid-dot (user, 2026-10-03).
  return spanWord(metric) === "Average per day" ? "daily average" : "average";
}

/** The words a span reading carries: a rate is an average PER DAY, anything else an average. */
export function spanWord(metric: TrendMetric): string {
  return TREND_METRICS[metric].kind === "counter" && metric !== "continuity" ? "Average per day" : "Average";
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
  // The WHOLE totals (`withUnlisted`): the catalog floor plus the unlisted chains where measured.
  fees: { key: "g.fee", scale: 1e-8 },
  kb: { key: "g.kb", scale: 1 / 1024 },
  nodes: { key: "f.nodes", scale: 1 },
  continuity: { key: null, scale: 1 },
};

/** WHAT THE DAG'S PINNED ROW IS, NEXT TO THE NETWORKS BELOW IT (2026-10-03 — the History
 *  explorer; user: "show that it's the totals of the rows below", then, after three rounds of
 *  tags: "make it consistent where possible, it's too random"). ONE distinction, and so one tag:
 *    · `total` — the rows below, added up: what the networks anchored, paid and wrote. The row
 *      is tagged "total".
 *    · `own`   — the DAG's own figure, the same kind of reading every row below states for
 *      itself (its nodes, its blocks, its cadence). No tag: an untagged row is a network's own.
 *  The row never claims a sum it is not (rule 10). NODES are the one measure whose global series
 *  is not the DAG's own: `f.nodes` is the whole fleet, and beside rows that each state their own
 *  nodes it read as one more "all nodes" — the pinned row reads `f.nodes.dag`, the DAG's stored
 *  count, through the same `metricSeries` every row uses. */
export const GLOBAL_READING: Record<TrendMetric, "total" | "own"> = {
  snapshots: "total",
  fees: "total",
  kb: "total",
  nodes: "own",
  blocks: "own",
  continuity: "own",
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

/** THE MEASURES' ONE ORDER — the explorer heading's list top-to-bottom and the cards' ↑/↓ keys
 *  are the same sequence, read from here, so stepping down from the third entry always lands on
 *  the fourth. */
export const METRIC_ORDER = Object.keys(METRIC_LABELS) as TrendMetric[];

/** The measure one step from `metric` (`+1` = the next in `METRIC_ORDER`, `-1` = the previous),
 *  or `null` at either end. It does NOT wrap: six measures are a short list with a first and a
 *  last, and the app's steppers say "this direction is exhausted" by going inactive (the rail
 *  plank's rule) rather than by looping — a loop hides where you are in the list. */
export function stepMetric(metric: TrendMetric, dir: -1 | 1): TrendMetric | null {
  const i = METRIC_ORDER.indexOf(metric);
  if (i < 0) return null;
  return METRIC_ORDER[i + dir] ?? null;
}

/** THE ORDER A STACK KEEPS WHILE ITS CONTENT IS CHANGING (2026-09-19). A measure change re-ranks
 *  the stack (busiest first, per measure), and doing that in the same beat as the plots swapping
 *  is two motions fighting: every chart redraws while every card flies to a new slot. So the stack
 *  HOLDS its order until the new plots have landed and only then re-orders. `held` is the order on
 *  screen, `ranked` the order the new measure wants: keep every held id that still exists, in held
 *  order, and append anything new in ranked order — so a roster that changes underneath the hold (a
 *  filter commit, a network appearing) can never leave the stack pointing at a row that is gone. */
export function holdOrder(held: readonly string[], ranked: readonly string[]): string[] {
  const want = new Set(ranked);
  const kept = held.filter((id) => want.has(id));
  const have = new Set(kept);
  return [...kept, ...ranked.filter((id) => !have.has(id))];
}

/** A MOMENT'S READING AS A SENTENCE ABOUT ITS NETWORK (user, 2026-10-07: "7 per 5 min … not very
 *  clear", then "what does 'per 5 minutes' mean to the metagraph? — that's what the section is
 *  for, relation to parent"). The lead says what the network above DID in the moment, so the reading
 *  is a verb and its object around the number: "DED anchored 7 snapshots in those 5 minutes". A moment
 *  IS one bucket, so the reading is what happened inside it, never a rate; the card's title says
 *  which bucket and the closing words how wide it is. The caller writes the subject and the number;
 *  this says the rest. Where the formatter already carries the noun ("1.2 MB") the object is "of
 *  data"; a gauge is what stood, so it carries no bucket. The verb is ANCHORED, the app's word for
 *  what a network does with a snapshot (user, same day: "sealed or anchored?") — except the SPACING,
 *  which is CREATED (user, 2026-10-08: "I think they created one every 3s, but anchored it to global
 *  only occurs ~30sec"): the gap is between the chain's own snapshots, not between the global
 *  snapshots that carried them, and the anchoring cadence is not a stored series. */
export function momentPhrase(metric: TrendMetric, stepMs: number): { verb: string; rest: string } {
  const inBucket = stepMs >= 86400000 ? "on that day" : stepMs >= 3600000 ? "in that hour" : "in those 5 minutes";
  switch (metric) {
    case "snapshots": return { verb: "anchored", rest: `snapshots ${inBucket}` };
    case "blocks": return { verb: "produced", rest: `blocks ${inBucket}` };
    case "fees": return { verb: "paid", rest: `DAG in fees ${inBucket}` };
    case "kb": return { verb: "anchored", rest: `of data ${inBucket}` };
    case "nodes": return { verb: "ran", rest: "nodes" };
    case "continuity": return { verb: "created a snapshot every", rest: inBucket };
  }
}

/** HOW MANY GLOBAL SNAPSHOTS CARRIED A CHAIN, per bucket (`m.<id>.ticks`, sampled since
 *  2026-10-08 — the user: "I think they created one every 3s, but anchored it to global only
 *  ~30sec, so both are relevant"). Creating and anchoring are two cadences: a fast chain seals many
 *  snapshots between two global ticks, and each tick carries the batch. A COPY, untrimmed like
 *  `metricSeries`; empty where the store never measured it (null per bucket, never a zero). */
export function anchorSeries(id: string, series: Readonly<Record<string, (number | null)[]>>): (number | null)[] {
  // ⚠️ A ZERO BESIDE SNAPSHOTS IS "NOT MEASURED", NOT NONE. The read route fills a covered bucket's
  // absent counter with an honest 0 (assemble.ts), which is right for a field the sampler always
  // wrote — but this one began on 2026-10-08, so every older bucket arrives as 0. A chain that
  // created snapshots in a bucket was anchored at least once in it (a snapshot carries its
  // global's stamp), so 0 there can only be the field's absence (rule 10: null, never a zero).
  const snaps = series[`m.${id}.snaps`] ?? [];
  return (series[`m.${id}.ticks`] ?? []).map((a, i) => (a === 0 && (snaps[i] ?? 0) > 0 ? null : a));
}

/** The Moment lead's second clause, beside the creation spacing: "and anchored {n} times". */
export function anchorClause(n: number): { before: string; after: string } {
  return { before: "and anchored", after: n === 1 ? "time" : "times" };
}

/** A RANGE'S READING AS A SENTENCE ABOUT ITS NETWORK (2026-10-07 — the Range card, the Moment's
 *  parent; `momentPhrase`'s sibling). A counter is the TOTAL over the span ("DED anchored 52,140
 *  snapshots in this range") — what a reader asks of a range — and a total that skipped an
 *  unmeasured bucket is a floor and says so ("at least", rule 10). A gauge and the spacing have no
 *  total, so they are the span's average and say that instead. */
export function rangePhrase(metric: TrendMetric, partial: boolean): { verb: string; rest: string } {
  // The span is the card's own Start / End / Length rows, so the sentence points at it.
  const over = "in this range";
  const floor = partial ? " at least" : "";
  switch (metric) {
    case "snapshots": return { verb: `anchored${floor}`, rest: `snapshots ${over}` };
    case "blocks": return { verb: `produced${floor}`, rest: `blocks ${over}` };
    case "fees": return { verb: `paid${floor}`, rest: `DAG in fees ${over}` };
    case "kb": return { verb: `anchored${floor}`, rest: `of data ${over}` };
    case "nodes": return { verb: "ran", rest: "nodes on average" };
    case "continuity": return { verb: "created a snapshot every", rest: "on average" };
  }
}

/** A counter's total over a span: the measured buckets added, and whether any was not measured
 *  (the total is then a floor). Nothing measured at all is no total — null, never a zero. */
export function sumMeasured(points: readonly (number | null)[]): { sum: number; partial: boolean } | null {
  let sum = 0;
  let measured = 0;
  for (const p of points) if (p != null) { sum += p; measured++; }
  return measured === 0 ? null : { sum, partial: measured < points.length };
}

/** What a History card says it is showing: the measure's name with its unit, in one phrase.
 *  The card's head used to carry the unit alone ("per day"), which was enough while the measure
 *  could only change in the rail's picker; once it can be stepped FROM the card (2026-09-19) the
 *  card has to name what it turned into. A bare rate reads as part of the name ("Snapshots per
 *  day"); a unit with its own noun is joined by "in" ("Fees in DAG per day" — it was set off with a
 *  mid-dot until 2026-10-03, the separator the user asked out of reader copy); and a unit that only repeats
 *  the name is dropped ("Nodes", never "Nodes · nodes"). */
export function metricCaption(metric: TrendMetric, stepMs: number): string {
  const label = METRIC_LABELS[metric];
  const unit = metricUnit(metric, stepMs);
  if (!unit || unit.toLowerCase() === label.toLowerCase()) return label;
  // Asked of the SPEC, not sniffed off the string: a unit is a bare rate exactly when its row uses
  // this module's own `rate`, and the words "per …" are that function's business, not this one's.
  return TREND_METRICS[metric].unit === rate ? `${label} ${unit}` : `${label} in ${unit}`;
}

// ── WHY A MOMENT HAS NO CHART (2026-09-19) ──────────────────────────────────────────────────
// The band's timeline spans the whole MEASURED history; the planes draw that span minus the edge
// buckets a counter must lose (`trimCounterEdges` — a partial sum drawn whole reads as a crash).
// So on the default metric in the default window the far RIGHT of the track is clickable and
// undrawn at the same time, and it is the most natural click there is: "what is happening now?".
//
// The card used to answer every undrawn instant with "pick a wider window", which for that click
// is advice that cannot work — there is no wider window, the bucket is excluded because it is
// STILL FILLING. Two different facts, so two different sentences, decided here rather than in the
// component: the classification is span arithmetic and the wording follows the TIER, which is the
// same rule `perPhrase` above already answers to.

/** Where an instant falls relative to what the charts actually DRAW. */
export type InstantPlace = "drawn" | "edge-newest" | "edge-oldest" | "outside";

/** Classify `ms` against the DRAWN axis and the payload's own (untrimmed) one.
 *
 *  A gauge passes the same array twice and is therefore always `drawn` or `outside`, which is
 *  correct: nothing is trimmed from a point sample. An EMPTY drawn axis is `outside` rather than
 *  an edge — with nothing on screen there is no edge to be just past. */
export function placeInstant(
  ms: number,
  drawn: readonly number[],
  raw: readonly number[],
  stepMs: number,
): InstantPlace {
  if (bucketAt(drawn, stepMs, ms) != null) return "drawn";
  const b = bucketAt(raw, stepMs, ms);
  if (b == null || drawn.length === 0) return "outside";
  // `drawn` is a contiguous slice of `raw`, so a raw bucket that is not drawn is on one side or
  // the other and there is nothing in between to get wrong.
  return b < drawn[0] ? "edge-oldest" : "edge-newest";
}

/** The tier's own word, with the agreement that word forces. Five minutes are plural; a day and
 *  an hour are not, and a sentence that gets that wrong reads as machine copy. */
const TIER_WORDS = (stepMs: number): { n: string; is: string; it: string } => {
  const tier = tierOf(stepMs); // the same classifier `tierWord` reads — one set of thresholds
  if (tier === "day") return { n: "day", is: "is", it: "it" };
  if (tier === "hour") return { n: "hour", is: "is", it: "it" };
  return { n: "five minutes", is: "are", it: "them" };
};

/** What the card says about an instant it cannot chart, or null where it can.
 *
 *  ⚠️ ONLY THE `outside` CASE OFFERS A ROUTE, and that is the distinction this function exists
 *  for: a wider window really does reach an instant the current one excludes, and nothing reaches
 *  a bucket that has not finished happening. Stating a fact and inviting a gesture that cannot
 *  work are different things, and the second is the failure rule 10 is about. */
export function instantNote(place: InstantPlace, stepMs: number): string | null {
  if (place === "drawn") return null;
  if (place === "outside") {
    // No route that a range would hide (the tester pass, 2026-10-07: "pick a wider window" while
    // the window buttons were hidden under a range) — the cursor is always movable.
    return "This moment is outside the charts on screen. Move the cursor onto them.";
  }
  const { n, is, it } = TIER_WORDS(stepMs);
  return place === "edge-newest"
    ? `The newest ${n} ${is} still filling, so no chart draws ${it} yet.`
    : `The oldest ${n} here ${is} only partly measured, so no chart draws ${it}.`;
}

/** One node TYPE's band in a network's stacked node chart. */
export interface TypeBand {
  /** The stored key (`roleKey`) — stable, so the band keeps its colour step as counts move. */
  key: string;
  /** The composition vocabulary's words for it ("Hybrid", ["L0", "cL1"]). */
  label: string;
  codes: string[];
  points: (number | null)[];
}

/** THE NODE-TYPE STACK for one network (2026-09-29 — user: "if nodes and L0, cL1 etc don't add
 *  up, what is the best way to present it?"). The role tallies overlap (a hybrid counts once for
 *  every layer it runs); TYPES partition the nodes, so these bands sum to the network's total.
 *
 *  HONESTY (rule 10): the sampler writes only the types PRESENT, so within a bucket that recorded
 *  ANY type for this network, a missing type is a measured 0 — and a bucket that recorded none
 *  (every hour before the type sampler existed, or an unsampled hour) is null in every band, so
 *  the stack leaves a gap there rather than inventing a split. Ordered richest make-up first (most
 *  layers), then by the vocabulary, so a hybrid sits at the stack's base in every chart. */
export function typeBands(id: string, series: Readonly<Record<string, (number | null)[]>>): TypeBand[] {
  const prefix = `f.type.${id}.`;
  const keys = Object.keys(series)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
  if (!keys.length) return [];
  const order = ["l0", "cl1", "dl1"];
  const rank = (k: string) => (k === "none" ? [99, 99] : [-k.split("+").length, order.indexOf(k.split("+")[0]!)]);
  keys.sort((a, b) => {
    const [a0, a1] = rank(a);
    const [b0, b1] = rank(b);
    return a0! - b0! || a1! - b1! || a.localeCompare(b);
  });
  const cols = keys.map((k) => series[prefix + k]!);
  const n = Math.max(...cols.map((c) => c.length));
  const recorded = Array.from({ length: n }, (_, i) => cols.some((c) => c[i] != null));
  return keys.map((key, j) => {
    const { label, codes } = roleKeyLabel(key);
    return { key, label, codes, points: recorded.map((r, i) => (r ? (cols[j]![i] ?? 0) : null)) };
  });
}

/** THE UNLISTED CHANNELS AS ONE NETWORK, AND THE TOTALS MADE WHOLE (2026-10-08 — the user: "why is
 *  this different, doesn't have to be different"). The sampler measures every unlisted chain under
 *  its own address (`m.<address>.*`, every field a catalog chain has), marking the buckets it read
 *  them all in with `u.cov`. This folds them into ONE synthetic network, `m.<id>.*` — `id` is the
 *  app's unlisted id — so every reader that handles a network (metricSeries, the planes, the
 *  explorer rows, the Moment and Range cards) handles them with no special case: snapshots, fees,
 *  size, blocks, spacing and anchorings alike. A bucket without the marker reads NULL, never zero.
 *
 *  It also writes the WHOLE totals, `g.fee` and `g.kb`: the catalog floor (`g.feeFloor`/`g.kbFloor`)
 *  plus the unlisted chains' measured amounts wherever they were measured — the floor alone where
 *  they were not (the reader may say so). They replace "anchors minus every listed network", which an
 *  explorer timestamp skew broke (2026-09-29: 38 phantom unlisted snapshots).
 *
 *  `isListed` is the catalog's judgement (current and former ids), passed in so this stays pure. */
const UNLISTED_FIELDS = ["snaps", "fee", "kb", "blocks", "gapSum", "gapMax", "ticks"] as const;

export function withUnlisted(
  series: Readonly<Record<string, (number | null)[]>>,
  isListed: (id: string) => boolean,
  id: string,
): Record<string, (number | null)[]> {
  const out: Record<string, (number | null)[]> = { ...series };
  const cov = series["u.cov"];
  const n = (series["g.ticks"] ?? cov ?? []).length;
  const chains = [...new Set(Object.keys(series).filter((k) => k.startsWith("m.")).map((k) => k.split(".")[1]!))].filter(
    (a) => a !== id && !isListed(a),
  );
  for (const f of UNLISTED_FIELDS) {
    const cols = chains.map((a) => series[`m.${a}.${f}`]).filter((c): c is (number | null)[] => !!c);
    out[`m.${id}.${f}`] = Array.from({ length: n }, (_, i) => {
      if (cov?.[i] == null) return null;
      let v = 0;
      for (const c of cols) v = f === "gapMax" ? Math.max(v, c[i] ?? 0) : v + (c[i] ?? 0);
      return v;
    });
  }
  for (const [total, floor, f] of [["g.fee", "g.feeFloor", "fee"], ["g.kb", "g.kbFloor", "kb"]] as const) {
    const fl = series[floor];
    if (!fl) continue;
    const unl = out[`m.${id}.${f}`]!;
    out[total] = fl.map((v, i) => (v == null ? null : v + (unl[i] ?? 0)));
  }
  return out;
}

/** The buckets in which the unlisted channels were NOT measured although the spine was — where a
 *  whole total (`g.fee`) is only its catalog floor. */
export function unlistedUnmeasured(series: Readonly<Record<string, readonly (number | null)[]>>): boolean[] {
  const cov = series["u.cov"];
  return (series["g.ticks"] ?? []).map((t, i) => t != null && cov?.[i] == null);
}

/** The newest bucket a series measured something above zero in, or null. */
export function lastSeen(points: readonly (number | null)[], buckets: readonly number[]): number | null {
  for (let i = points.length - 1; i >= 0; i--) if ((points[i] ?? 0) > 0) return buckets[i] ?? null;
  return null;
}
