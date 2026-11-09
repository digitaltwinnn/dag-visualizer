// THE MOMENT'S SPARKLINE (user, 2026-11-05: "in the moment view, can we add a small chart (hairline)
// when the range permits it … like when moment is 1hr range we can show 5min datapoint chart?" — to
// see "if it was a straight line or with ups and downs"). The Moment card states ONE bucket's
// reading; this is the same reading broken into the next finer buckets inside it, drawn as a
// hairline under the lead sentence. Agreed with the user in the brainstorm the same day:
//
//  - ONE STEP DOWN: a 1-hour moment shows its twelve 5-minute points, a 1-day moment its 24 hourly
//    points. A 5-minute moment is the finest there is and draws nothing.
//  - STRETCHED TO FIT, THE LINE ALONE: the lowest point on the floor, the highest on the ceiling,
//    no axes and no range figures — it answers "steady or up and down", the lead states how much.
//
// The decisions are pure and live here; `components/inspector/MomentSpark.tsx` only fetches and draws.
// Honesty (rule 10) is in the data, not the drawing: a finer bucket that was not measured is a
// BREAK in the line, never a dip to zero, and a moment with no finer measurement draws nothing.
import { globalSeries, metricSeries, TREND_METRICS } from "./trendSeries";
import { TIER_SINCE, type TrendsWindowData } from "./trendWindow";
import type { TrendMetric } from "@/src/store/store";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** The finer slice a moment breaks into: which tile tier to read, over which span. */
export interface SparkPlan {
  tier: "5m" | "1h";
  fromMs: number;
  toMs: number;
}

/** Which finer buckets a moment can show, or null where there are none. A COUNTER is stored in
 *  every tier, so an hour breaks into 5-minute buckets and a day into hours; a GAUGE (nodes) is
 *  sampled hourly and stored only from the hourly tier up, so only its day breaks down. A fine
 *  tier's history starts later than the daily one (`TIER_SINCE`), and a moment before it has
 *  nothing finer to show. */
export function sparkPlan(metric: TrendMetric, stepMs: number, bucket: number): SparkPlan | null {
  const gauge = TREND_METRICS[metric].kind === "gauge";
  const tier = stepMs === DAY_MS ? "1h" : stepMs === HOUR_MS && !gauge ? "5m" : null;
  if (tier == null || bucket < TIER_SINCE[tier]) return null;
  return { tier, fromMs: bucket, toMs: bucket + stepMs };
}

/** The finer readings inside the moment, oldest first — the subject network's series, else the
 *  whole network's: the SAME two reads the card's lead sentence states (`metricSeries` /
 *  `globalSeries`), so the line is the lead's figure broken down. Null when the slice measured
 *  nothing in the moment (no line is drawn rather than a flat one). */
export function sparkPoints(
  metric: TrendMetric,
  subject: string | null,
  data: TrendsWindowData,
  plan: SparkPlan,
): (number | null)[] | null {
  const row = subject ? metricSeries(metric, subject, data.series).points : globalSeries(metric, data.series);
  const out: (number | null)[] = [];
  data.buckets.forEach((b, i) => {
    if (b >= plan.fromMs && b < plan.toMs) out.push(row[i] ?? null);
  });
  return out.some((v) => v != null) ? out : null;
}

/** The drawing, as plain geometry in a `w × h` box: one path (`M`/`L`, a new `M` after every
 *  unmeasured point — the break), and where the busiest point sits for its dot. STRETCHED: the
 *  lowest measured point on the floor, the highest on the ceiling; a moment whose points are all
 *  equal sits flat across the middle. A point measured alone between two gaps has no segment, so
 *  it is drawn as a dot of its own (`dots`) rather than silently vanishing. */
export interface SparkGeometry {
  path: string;
  peak: { x: number; y: number } | null;
  dots: { x: number; y: number }[];
}

export function sparkGeometry(
  points: readonly (number | null)[],
  w: number,
  h: number,
  /** A SHARED SCALE, for two lines drawn as one (the Range card's in-range and context parts,
   *  `rangeSpark.ts`): they stretch against the whole frame, while the peak stays this line's own. */
  scale?: { lo: number; hi: number },
): SparkGeometry {
  const vals = points.filter((v): v is number => v != null);
  if (!vals.length) return { path: "", peak: null, dots: [] };
  const top = Math.max(...vals);
  const lo = scale?.lo ?? Math.min(...vals);
  const hi = scale?.hi ?? top;
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * w : w / 2);
  const y = (v: number) => (hi === lo ? h / 2 : h - ((v - lo) / (hi - lo)) * h);
  const r = (n: number) => Math.round(n * 100) / 100;
  let path = "";
  const dots: { x: number; y: number }[] = [];
  let peak: { x: number; y: number } | null = null;
  points.forEach((v, i) => {
    if (v == null) return;
    const px = r(x(i));
    const py = r(y(v));
    path += `${i > 0 && points[i - 1] != null ? "L" : "M"}${px},${py}`;
    if ((i === 0 || points[i - 1] == null) && (i === points.length - 1 || points[i + 1] == null)) dots.push({ x: px, y: py });
    if (peak == null && v === top) peak = { x: px, y: py };
  });
  return { path, peak, dots };
}
