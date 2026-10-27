import { fact, gaugeChange } from "@/src/data/noteFacts";
import { NOTABLE_CAPS, notableDays } from "@/src/data/notableDays";
import type { Fact, NotableDay } from "@/src/data/noteTypes";
import { globalSeries, METRIC_ORDER, metricLabel, metricSeries, spanAverage, trimCounterEdges, TREND_METRICS } from "@/src/data/trendSeries";
import { trimNewestPartial, type TrendsWindowData } from "@/src/data/trendWindow";
import type { TrendMetric } from "@/src/store/store";

// HISTORY'S FACTS BUILDER — what the History note's model is shown. It turns the trends store's
// payloads (`TrendsWindowData`) into labelled `Fact`s with every ratio and share already worked
// out, so the model never divides and the honesty gate (`noteHonesty.ts`) has a number to match.
// It reads through the SAME `metricSeries` / `globalSeries` / `spanAverage` / `trimCounterEdges`
// the History explorer's rows do, so the note and the chart beside it state one figure.
//
// THE GATE'S INTERFACE (the load-bearing part, `noteHonesty.ts`): a ratio fact belongs to a network
// ONLY by that network's display name appearing in its LABEL, and `names` (returned here) is what
// the gate strips and scopes by. So every per-network ratio label starts with the network's name,
// every ratio of the WHOLE hypergraph names no network, and `names` lists every name a fact or
// blurb mentions.
//
// HONESTY (rule 10):
//   · a null is not measured: a measure is stated only when its side was measured, and a ratio
//     only when BOTH sides were and the previous one is above 0 (no division by an absence);
//   · counters are read as an average PER DAY over the measured buckets, partial edge buckets
//     trimmed (`trimCounterEdges`); the nodes are a gauge and go through `gaugeChange`;
//   · a payload with no covered bucket (`g.ticks`, the store's one coverage marker) yields null;
//   · the still-filling newest day never reaches `notableDays` (`trimNewestPartial`);
//   · shares are of what the networks anchored, and the denominator is never smaller than their sum.
//
// WHICH ZOOMS GET NOTABLE DAYS: 7d, 30d, 1y and all (`NOTABLE_CAPS`). A 1h, 24h or custom-range
// note describes a stretch too short for "a day that stood out".
//
// Pure: no store values, react or I/O (the colocated test is the specification — rule 4).

export interface TrendFactsInput {
  subject: "dag" | string; // "dag" = the whole hypergraph
  zoom: "1h" | "24h" | "7d" | "30d" | "1y" | "all" | "range";
  span: { fromMs: number; toMs: number };
  cur: TrendsWindowData; // the span's own payload
  prev: TrendsWindowData | null; // the equal span before it (null for "all")
  /** Daily buckets for the notable days: ~30 days of LEAD-IN before the span (they feed each
   *  series' level) through the span's end. Null for 1h / 24h / short ranges. */
  daily: TrendsWindowData | null;
  names: Record<string, string>; // catalog id → display name
  blurbs: Record<string, string>; // catalog id → `blurb` (config.METAGRAPHS)
}

export interface TrendFacts {
  facts: Fact[];
  days: NotableDay[];
  /** Every display name a fact or blurb mentions — what the gate strips and scopes by. */
  names: string[];
  /** "<name> is: <blurb>" lines for the networks a first / last day on the hypergraph names. */
  blurbs: string[];
}

const TOP_NETWORKS = 3;

/** The words after the label that say what a value is, per measure. */
const UNIT_PHRASE: Record<TrendMetric, string> = {
  snapshots: "per day",
  globals: "per day",
  blocks: "per day",
  fees: "DAG per day",
  kb: "MB per day",
  nodes: "",
  continuity: "between snapshots",
};

const valueKind = (m: TrendMetric): Fact["kind"] => (m === "continuity" ? "duration" : m === "fees" || m === "kb" ? "amount" : "count");

/** One measure of one subject across a window: the points and, for cadence, the weights it was
 *  measured over. The hypergraph reads its global rows — except its NODES, which are its own
 *  (`f.nodes.dag`), as the History roster's pinned row reads them. */
function pointsOf(metric: TrendMetric, id: string, data: TrendsWindowData): { points: (number | null)[]; weights?: (number | null)[] } {
  const dag = id === "dag";
  const points = dag && metric !== "nodes" ? globalSeries(metric, data.series) : metricSeries(metric, id, data.series).points;
  if (metric !== "continuity") return { points };
  return { points, weights: dag ? globalSeries("globals", data.series) : metricSeries("snapshots", id, data.series).points };
}

/** The span's value for a measure: a counter's average per day, cadence weighted by its snapshots.
 *  Null where nothing in the span was measured. */
function spanValue(metric: TrendMetric, id: string, data: TrendsWindowData): number | null {
  const { points, weights } = pointsOf(metric, id, data);
  if (TREND_METRICS[metric].kind === "gauge") return spanAverage(metric, points, data.stepMs);
  const cut = <T,>(a: readonly T[]) => trimCounterEdges(a, data.stepMs);
  return spanAverage(metric, cut(points), data.stepMs, weights && cut(weights));
}

const dayMeasured = (d: NotableDay): "count" | "duration" => (d.kind === "pause" ? "duration" : "count");

export function trendFacts(input: TrendFactsInput): TrendFacts | null {
  const { subject, zoom, span, cur, prev, names: catalog, blurbs: blurbOf } = input;
  if (!(cur.series["g.ticks"] ?? []).some((v) => v != null)) return null;

  const dag = subject === "dag";
  const nameOf = (id: string) => catalog[id] ?? id;
  const ids = Object.keys(catalog).filter((id) => id !== "dag");
  const mentioned = new Set<string>();
  const mention = (id: string): string => {
    const n = nameOf(id);
    mentioned.add(n);
    return n;
  };
  if (!dag) mention(subject);

  /** A measure's label as seen from a subject: the hypergraph's is the bare measure, a network's
   *  starts with its name (the gate attributes a ratio by it). */
  const base = (metric: TrendMetric, id: string): string =>
    id === "dag" ? metricLabel(metric, "dag") : `${mention(id)} ${metricLabel(metric, id).toLowerCase()}`;

  const facts: Fact[] = [];

  for (const metric of METRIC_ORDER) {
    const label = base(metric, subject);
    if (TREND_METRICS[metric].kind === "gauge") {
      // A gauge is a level, not a rate: its start and end, read through outages. No previous-span
      // comparison — the change inside the span is what a level has to say.
      const ch = gaugeChange(pointsOf(metric, subject, cur).points);
      if (!ch) continue;
      facts.push(fact(`${label} at the start of the span`, ch.from, "count"));
      facts.push(fact(`${label} at the end of the span`, ch.to, "count"));
      if (ch.from > 0 && ch.to !== ch.from) facts.push(fact(`${label}, ratio end to start`, ch.to / ch.from, "ratio"));
      continue;
    }
    const now = spanValue(metric, subject, cur);
    if (now == null) continue;
    const unit = UNIT_PHRASE[metric];
    const kind = valueKind(metric);
    facts.push(fact(`${label}, ${unit}, this span`, now, kind));
    const before = prev ? spanValue(metric, subject, prev) : null;
    if (before == null) continue;
    facts.push(fact(`${label}, ${unit}, previous span`, before, kind));
    if (before > 0) facts.push(fact(`${label}, ratio to previous span`, now / before, "ratio"));
  }

  if (dag) {
    // THE NETWORKS BEHIND THE TOTAL: who anchored most, their shares, how many anchored at all.
    const avg = new Map<string, number>();
    for (const id of ids) {
      const v = spanValue("snapshots", id, cur);
      if (v != null && v > 0) avg.set(id, v);
    }
    const ranked = [...avg].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length) {
      const sum = ranked.reduce((a, [, v]) => a + v, 0);
      // The whole is what the hypergraph anchored — never less than its networks added up.
      const denom = Math.max(spanValue("snapshots", "dag", cur) ?? 0, sum);
      for (const [id, v] of ranked.slice(0, TOP_NETWORKS)) {
        const n = mention(id);
        facts.push(fact(`${n} snapshots anchored, per day, this span`, v, "count"));
        facts.push(fact(`${n} share of snapshots anchored, this span`, v / denom, "share"));
        const before = prev ? spanValue("snapshots", id, prev) : null;
        if (before != null && before > 0) facts.push(fact(`${n} snapshots anchored, ratio to previous span`, v / before, "ratio"));
      }
      facts.push(fact("Networks that anchored snapshots, this span", ranked.length, "count"));
      const [quietId, quietV] = ranked[ranked.length - 1]!;
      facts.push(fact(`Quietest active network ${mention(quietId)}, snapshots anchored per day, this span`, quietV, "count"));
    }
  }

  // NOTABLE DAYS, for the zooms long enough to have one.
  let days: NotableDay[] = [];
  const cap = zoom === "7d" || zoom === "30d" || zoom === "1y" || zoom === "all" ? NOTABLE_CAPS[zoom] : 0;
  const blurbs: string[] = [];
  if (cap > 0 && input.daily) {
    const d = trimNewestPartial(input.daily);
    const first = d.buckets.findIndex((b) => b >= span.fromMs);
    days = notableDays({
      days: d.buckets,
      covered: d.series["g.ticks"] ?? d.buckets.map(() => null),
      series: d.series,
      subject,
      ids,
      cap,
      from: first < 0 ? d.buckets.length : first,
    });
    days.forEach((day, i) => {
      const n = i + 1;
      const who = day.networkId ? mention(day.networkId) : "";
      const what =
        day.kind === "high" ? "spike"
        : day.kind === "low" ? "dip"
        : day.kind === "first" ? `first activity of ${who}`
        : day.kind === "last" ? `last activity of ${who}`
        : "pause";
      const kind = dayMeasured(day);
      const measured = day.kind === "pause" ? "longest wait between snapshots" : "snapshots anchored that day";
      facts.push(fact(`Notable day ${n} date (${what})`, day.dayMs, "date"));
      facts.push(fact(`Notable day ${n} ${what}, ${measured}`, day.value, kind));
      if (day.kind === "high" || day.kind === "low" || day.kind === "pause")
        facts.push(fact(`Notable day ${n} ${what}, ${day.kind === "pause" ? "usual longest wait" : "usual level"}`, day.level, kind));
      if (dag && (day.kind === "first" || day.kind === "last") && day.networkId && blurbOf[day.networkId]) {
        const line = `${nameOf(day.networkId)} is: ${blurbOf[day.networkId]}`;
        if (!blurbs.includes(line)) blurbs.push(line);
      }
    });
  }

  return { facts, days, names: [...mentioned], blurbs };
}
