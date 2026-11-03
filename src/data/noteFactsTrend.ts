import { chainReadThrough, fact, gaugeChange, networksAnchored, type ChainReads } from "@/src/data/noteFacts";
import { NOTABLE_CAPS, rangeNotableCap, NOTABLE_FLOOR, notableDays, rangeExtremes } from "@/src/data/notableDays";
import type { Fact, NotableDay } from "@/src/data/noteTypes";
import { formatDag, globalSeries, lastSeen, METRIC_ORDER, metricLabel, metricSeries, spanAverage, trimCounterEdges, TREND_METRICS, unlistedUnmeasured, withUnlisted } from "@/src/data/trendSeries";
import { LISTED_IDS, UNLISTED_ID } from "@/src/data/unlisted";
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
//   · shares are of what the networks anchored, and the denominator is never smaller than their sum;
//   · THE STORE'S PAYLOAD IS FOLDED HERE (`withUnlisted`): the store holds `g.feeFloor` / `g.kbFloor`
//     and the hypergraph's fee and data totals exist only after the fold. Where a bucket of the
//     trimmed span has no unlisted coverage (`unlistedUnmeasured`), that total is only its catalog
//     floor: the fact is labelled ", at least" and gets no ratio (a floor over a floor is no ratio);
//   · a gauge that began after the span did (the fleet's series starts the day the sampler first
//     ran) states only its current level, never a "start" that is not the span's;
//   · a span SHORTER than a day states counters as the span's total, not "per day" (×288 of five
//     minutes is a rate nobody measured); ratios are the same either way;
//   · A CHANGE IS A PAIR (R54): a gauge's start and end, and a counter's previous span and this
//     span, carry `pair` (`from` / `to`, keyed by the measure's label), so the gate states an
//     earlier figure only beside its own current one (R60). A floor (", at least") is never an end.
//
// WHICH ZOOMS GET NOTABLE DAYS: 7d, 30d, 90d, 1y and all (`NOTABLE_CAPS`), and a brushed range of a
// week or more (`rangeNotableCap`). A 1h, 24h or shorter note describes a stretch too short for "a
// day that stood out".
//
// Pure: no store values, react or I/O (the colocated test is the specification — rule 4).

/** `cur`, `prev` and `daily` are the STORE's payload (what the tile route assembles), UNFOLDED:
 *  `trendFacts` folds each with `withUnlisted` itself. */
export interface TrendFactsInput {
  subject: "dag" | string; // "dag" = the whole hypergraph
  zoom: "1h" | "24h" | "7d" | "30d" | "90d" | "1y" | "all" | "range";
  span: { fromMs: number; toMs: number };
  cur: TrendsWindowData; // the span's own payload (store, unfolded)
  prev: TrendsWindowData | null; // the equal span before it (null for "all"; store, unfolded)
  /** Daily buckets for the notable days: ~30 days of LEAD-IN before the span (they feed each
   *  series' level) through the span's end. Null for 1h / 24h / short ranges. */
  daily: TrendsWindowData | null;
  /** The unlisted set only: the whole daily record, so a silent span can say when the set last
   *  anchored and how many chains ever have (store, unfolded). */
  history?: TrendsWindowData | null;
  /** When the sampler last read each chain, for a silent span (`chainReadThrough`). */
  chainReads?: ChainReads | null;
  /** THE SPAN FACET (`<net>/span`): the span's busiest, quietest and typical day, by those names,
   *  in place of the notable days. Left to pick them out of the notable days the model called a
   *  chain's thin last day the busiest (live 2026-10-30), and the gate checks figures, not meaning. */
  shape?: boolean;
  names: Record<string, string>; // catalog id → display name
  blurbs: Record<string, string>; // catalog id → `blurb` (config.METAGRAPHS)
}

export interface TrendFacts {
  facts: Fact[];
  days: NotableDay[];
  /** EVERY catalog display name, not only those the facts mention: the gate strips and scopes by
   *  these, and a network named in the note but absent from the facts must still count as NAMED
   *  (else it reads as nameless and borrows the hypergraph's own ratio). */
  names: string[];
  /** "<name> is: <blurb>" lines for the networks a first / last day on the hypergraph names. */
  blurbs: string[];
}

const TOP_NETWORKS = 3;
/** A gauge whose first measured sample falls later than this fraction of the span's buckets began
 *  after the span did. */
const LATE_START = 0.1;

/** The words after the label that say what a value is, per measure: a counter's average PER DAY
 *  or, on a span under a day, its TOTAL. */
const UNIT_PHRASE: Record<TrendMetric, { day: string; total: string }> = {
  snapshots: { day: "per day", total: "" },
  globals: { day: "per day", total: "" },
  blocks: { day: "per day", total: "" },
  fees: { day: "DAG per day", total: "DAG" },
  kb: { day: "MB per day", total: "MB" },
  nodes: { day: "", total: "" },
  continuity: { day: "between snapshots", total: "between snapshots" },
};
const DAY_MS = 86_400_000;

const valueKind = (m: TrendMetric): Fact["kind"] => (m === "continuity" ? "duration" : m === "fees" || m === "kb" ? "amount" : "count");
/** A fee is written by the chart's own formatter. */
const valueFormat = (m: TrendMetric): ((v: number) => string) | undefined => (m === "fees" ? formatDag : undefined);

/** One measure of one subject across a window: the points and, for cadence, the weights it was
 *  measured over. The hypergraph reads its global rows, its NODES too: a note on the whole network
 *  counts all of them, though the DAG's plane beside it charts its own (user, 2026-11-02). */
function pointsOf(metric: TrendMetric, id: string, data: TrendsWindowData): { points: (number | null)[]; weights?: (number | null)[] } {
  const dag = id === "dag";
  const points = dag ? globalSeries(metric, data.series) : metricSeries(metric, id, data.series).points;
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

/** A counter's TOTAL over the (edge-trimmed) span: the sum of its buckets. Null unless EVERY
 *  bucket was measured — a sum that skipped a hole would understate and read as the span's. */
function spanTotal(metric: TrendMetric, id: string, data: TrendsWindowData): number | null {
  const pts = trimCounterEdges(pointsOf(metric, id, data).points, data.stepMs);
  if (!pts.length || pts.some((v) => v == null)) return null;
  return pts.reduce<number>((a, v) => a + v!, 0);
}

/** Whether the unlisted channels went unmeasured in any bucket of the trimmed span, which makes
 *  the hypergraph's fee and data totals their catalog floor there. */
function floorOnly(data: TrendsWindowData): boolean {
  return trimCounterEdges(unlistedUnmeasured(data.series), data.stepMs).some(Boolean);
}

/** The unlisted chains, as a note calls them: a SET, never one network. The name the facts carry
 *  and the gate scopes by; the line beside the facts says what the set is. */
const UNLISTED_SET_NAME = "Unlisted networks";
const UNLISTED_SET_BLURB = `${UNLISTED_SET_NAME} are: chains that anchor metagraph snapshots into the hypergraph but are not in this app's catalog, so each is known only by its address and nothing is known of what it is for.`;

/** Quiet this long before the span's end is a stop, not a slow day (the picker's own three). */
const STOPPED_MS = 3 * DAY_MS;

/** Whether a network anchored nothing in a span. Absent reads as zero, the picker's own rule: the
 *  spine measured the span, and the hourly tiers store no key for a network with nothing to say.
 *  That the sampler reached this chain is `chainReadThrough`'s question, not this one's.
 *  The hypergraph is never silent here, and the unlisted set has its own rule below. */
export const trendSilent = (subject: string, cur: TrendsWindowData): boolean =>
  subject !== "dag" && subject !== UNLISTED_ID && !metricSeries("snapshots", subject, cur.series).points.some((v) => (v ?? 0) > 0);

const dayMeasured = (d: NotableDay): Fact["kind"] => (d.kind === "pause" || d.kind === "longest" ? "duration" : d.measure === "fees" || d.measure === "kb" ? "amount" : "count");

export function trendFacts(input: TrendFactsInput): TrendFacts | null {
  const { subject, zoom, span, names: catalog, blurbs: blurbOf } = input;
  const isListed = (id: string) => LISTED_IDS.has(id) || id in catalog;
  const fold = (d: TrendsWindowData): TrendsWindowData => ({ ...d, series: withUnlisted(d.series, isListed, UNLISTED_ID) });
  const cur = fold(input.cur);
  const prev = input.prev && fold(input.prev);
  if (!(cur.series["g.ticks"] ?? []).some((v) => v != null)) return null;
  // Silent by the store, but the sampler never reached the chain: nothing is known of the span, so
  // it stays an instrument state (rule 10). The silence below is a measured one.
  if (trendSilent(subject, cur) && !chainReadThrough(input.chainReads, subject, span.toMs)) return null;
  const perDay = span.toMs - span.fromMs >= DAY_MS;

  const dag = subject === "dag";
  const unlisted = subject === UNLISTED_ID;
  const nameOf = (id: string) => (id === UNLISTED_ID ? UNLISTED_SET_NAME : catalog[id] ?? id);
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
  // A NETWORK'S OWN SNAPSHOTS ARE "METAGRAPH SNAPSHOTS" in a note (user, 2026-11-03: a note said
  // "global snapshot" and a bare "snapshot" side by side, the second meaning a metagraph's). The
  // chart keeps its short "Snapshots anchored"; the facts the model reads name the kind.
  const label = (metric: TrendMetric, id: string): string =>
    metric === "snapshots" ? "Metagraph snapshots anchored" : metricLabel(metric, id);
  const base = (metric: TrendMetric, id: string): string =>
    id === "dag" ? label(metric, "dag") : `${mention(id)} ${label(metric, id).toLowerCase()}`;

  const facts: Fact[] = [];

  for (const metric of METRIC_ORDER) {
    const label = base(metric, subject);
    if (TREND_METRICS[metric].kind === "gauge") {
      // A gauge is a level, not a rate: its start and end, read through outages. No previous-span
      // comparison — the change inside the span is what a level has to say.
      const gauge = pointsOf(metric, subject, cur).points;
      const ch = gaugeChange(gauge);
      if (!ch) continue;
      // A gauge that began well after the span did has no start of the span's: state only where it
      // stands now.
      if (ch.firstIndex > LATE_START * gauge.length) {
        facts.push(fact(`${label} at the end of the span`, ch.to, "count"));
        continue;
      }
      facts.push(fact(`${label} at the start of the span`, ch.from, "count", undefined, { key: label, end: "from" }));
      facts.push(fact(`${label} at the end of the span`, ch.to, "count", undefined, { key: label, end: "to" }));
      if (ch.from > 0 && ch.to !== ch.from) facts.push(fact(`${label}, ratio end to start`, ch.to / ch.from, "ratio"));
      continue;
    }
    const total = !perDay && metric !== "continuity";
    const phrase = metric === "continuity" ? `between ${subject === "dag" ? "global" : "metagraph"} snapshots` : UNIT_PHRASE[metric][total ? "total" : "day"];
    const unit = phrase ? `, ${phrase}` : "";
    const kind = valueKind(metric);
    const format = valueFormat(metric);
    // The hypergraph's fee and data totals are only a floor where the unlisted channels were not measured.
    const isTotalRow = subject === "dag" && (metric === "fees" || metric === "kb");
    const curFloor = isTotalRow && floorOnly(cur);
    const prevFloor = isTotalRow && !!prev && floorOnly(prev);
    const now = spanValue(metric, subject, cur);
    if (now == null) continue;
    const read = (d: TrendsWindowData) => (total ? spanTotal(metric, subject, d) : spanValue(metric, subject, d));
    const shown = read(cur);
    const before = prev ? spanValue(metric, subject, prev) : null;
    const shownBefore = before != null ? read(prev!) : null;
    // ONE CHANGE (R54): the previous span and this one are the `from` and `to` of one quantity
    // when both are stated and neither is a floor (a floor beside a figure is no measured change).
    const paired = shown != null && shownBefore != null && !curFloor && !prevFloor;
    const key = `${label}${unit}`;
    if (shown != null)
      facts.push(fact(`${label}${unit}, this span${curFloor ? ", at least" : ""}`, shown, kind, format, paired ? { key, end: "to", span: true } : undefined));
    if (before == null) continue;
    if (shownBefore != null)
      facts.push(fact(`${label}${unit}, previous span${prevFloor ? ", at least" : ""}`, shownBefore, kind, format, paired ? { key, end: "from", span: true } : undefined));
    if (before > 0 && !curFloor && !prevFloor) facts.push(fact(`${label}, ratio to previous span`, now / before, "ratio"));
  }

  if (dag) {
    // THE NETWORKS BEHIND THE TOTAL: who anchored most, their shares, how many anchored at all.
    const dayWord = perDay ? ", per day" : "";
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
        const own = perDay ? v : spanTotal("snapshots", id, cur);
        if (own != null) facts.push(fact(`${n} metagraph snapshots anchored${dayWord}, this span`, own, "count"));
        facts.push(fact(`${n} share of metagraph snapshots anchored, this span`, v / denom, "share"));
        const before = prev ? spanValue("snapshots", id, prev) : null;
        if (before != null && before > 0) facts.push(fact(`${n} metagraph snapshots anchored, ratio to previous span`, v / before, "ratio"));
      }
      const anchored = networksAnchored(ranked.length, cur.series, cur.stepMs);
      facts.push(fact(`Networks that anchored metagraph snapshots, this span${anchored.atLeast ? ", at least" : ""}`, anchored.count, "count"));
      const [quietId, quietV] = ranked[ranked.length - 1]!;
      const quietOwn = perDay ? quietV : spanTotal("snapshots", quietId, cur);
      if (quietOwn != null) facts.push(fact(`Quietest active network ${mention(quietId)}, metagraph snapshots anchored${dayWord}, this span`, quietOwn, "count"));
    }
  }

  // THE CHAINS BEHIND THE SET: how many anchored and how much the busiest carried. None is named: a
  // chain is an address here, and the catalog has nothing to say about it.
  if (unlisted) {
    const carried = Object.keys(input.cur.series)
      .filter((k) => /^m\.[^.]+\.snaps$/.test(k))
      .map((k) => k.split(".")[1]!)
      .filter((id) => id !== UNLISTED_ID && !isListed(id))
      .map((id) => spanValue("snapshots", id, cur) ?? 0)
      .filter((v) => v > 0)
      .sort((a, b) => b - a);
    // A SILENT SPAN SAYS SO (live 2026-10-30: "0 snapshots, 0 blocks, 0 fees and 0 data"): the rows of
    // zeros go, and what a reader can use takes their place, when the set last anchored and how
    // many chains ever have.
    if (!carried.length) facts.length = 0;
    facts.push(fact("Unlisted chains that anchored metagraph snapshots, this span", carried.length, "count"));
    if (carried.length > 1) {
      const sum = carried.reduce((a, v) => a + v, 0);
      facts.push(fact("Busiest unlisted chain, share of the set's metagraph snapshots anchored, this span", carried[0]! / sum, "share"));
    }
    if (input.history) {
      const h = fold(trimNewestPartial(input.history));
      const last = lastSeen(h.series[`m.${UNLISTED_ID}.snaps`] ?? [], h.buckets);
      // …and a set that stopped well before the span's end says when, active span or not (live: the
      // year's note never said the set went silent in August).
      if (last != null && last < span.toMs - STOPPED_MS) facts.push(fact("Last day an unlisted chain anchored a metagraph snapshot", last, "date"));
      const ever = Object.keys(h.series).filter((k) => {
        const id = /^m\.([^.]+)\.snaps$/.exec(k)?.[1];
        return id != null && id !== UNLISTED_ID && !isListed(id) && h.series[k]!.some((v) => (v ?? 0) > 0);
      }).length;
      if (!carried.length && ever) facts.push(fact("Unlisted chains that anchored metagraph snapshots in all measured history", ever, "count"));
    }
  }

  // A NETWORK'S SILENT SPAN SAYS SO, the set's rule above (user, 2026-11-01: NDT's Aug 23 read
  // "steady", three days past its last day, on facts holding only the span's own dates). The rows
  // of zeros go, a figure that is not zero stays (nodes can outlast the anchoring), and the
  // history says which side of the network's life the span fell on.
  if (trendSilent(subject, cur)) {
    facts.splice(0, facts.length, ...facts.filter((f) => f.value !== 0));
    const name = base("snapshots", subject);
    facts.push(fact(`${name}, this span`, 0, "count"));
    if (input.history) {
      const h = trimNewestPartial(input.history);
      const points = metricSeries("snapshots", subject, h.series).points;
      const seen = h.buckets.filter((_, i) => (points[i] ?? 0) > 0);
      const before = seen.filter((b) => b < span.fromMs).at(-1);
      const after = seen.find((b) => b >= span.toMs);
      const who = mention(subject);
      if (before != null) facts.push(fact(`Last day ${who} anchored a metagraph snapshot${after != null ? " before this span" : ", none since"}`, before, "date"));
      if (after != null) facts.push(fact(`First day ${who} anchored a metagraph snapshot${before != null ? " after this span" : ", none before"}`, after, "date"));
    }
  }

  // NOTABLE DAYS, for the zooms long enough to have one.
  let days: NotableDay[] = [];
  const cap = zoom === "range" ? rangeNotableCap(span.toMs - span.fromMs) : zoom === "7d" || zoom === "30d" || zoom === "90d" || zoom === "1y" || zoom === "all" ? NOTABLE_CAPS[zoom] : 0;
  const blurbs: string[] = [];
  if (cap > 0 && input.daily) {
    // THE UNLISTED SET'S DAYS read the fold, and two things differ from a network's. Its coverage is
    // `u.cov`, not the spine: a day the chains went unread is null in the fold, and the picker reads
    // covered + absent as a measured 0, so against `g.ticks` that day would be a dip. And its folded
    // `gapMax` is one chain's widest gap, not a gap of the set, so it has no pause and no longest gap.
    const raw = trimNewestPartial(input.daily);
    const d = unlisted ? fold(raw) : raw;
    const first = d.buckets.findIndex((b) => b >= span.fromMs);
    const end = d.buckets.findIndex((b) => b >= span.toMs); // a brushed range ends before the record does
    const { [`m.${UNLISTED_ID}.gapMax`]: _setGap, ...noSetGap } = d.series;
    const pick = {
      days: d.buckets,
      covered: d.series[unlisted ? "u.cov" : "g.ticks"] ?? d.buckets.map(() => null),
      series: unlisted ? noSetGap : d.series,
      subject,
      ids,
      cap,
      from: first < 0 ? d.buckets.length : first,
      ...(end >= 0 ? { until: end } : {}),
      floor: NOTABLE_FLOOR,
    };
    if (input.shape) {
      const ext = rangeExtremes(pick);
      for (const [kind, name] of [["peak", "Busiest"], ["trough", "Quietest"]] as const) {
        const day = ext.find((x) => x.kind === kind);
        if (!day) continue;
        facts.push(fact(`${name} day of the span, date`, day.dayMs, "date"));
        facts.push(fact(`${name} day of the span, metagraph snapshots anchored`, day.value, "count"));
      }
      // The snapshots' own median: `ext` also holds a longest gap or a broadest day, each with a level of its own.
      const counted = ext.find((x) => x.kind === "peak" || x.kind === "trough");
      if (counted) facts.push(fact("Typical day of the span, metagraph snapshots anchored", counted.level, "count"));
    }
    days = input.shape ? [] : notableDays(pick);
    // THE DAYS' OWN COUNTS (live 2026-11-03: "Five networks anchored their first metagraph snapshot on
    // the days below" failed the gate, the five being the model's own count of the list): given as
    // facts, a summary of the list is a figure the gate can back.
    for (const [kind, word] of [["first", "first"], ["last", "last"]] as const) {
      const n = days.filter((d) => d.kind === kind).length;
      if (n > 1) facts.push(fact(`Notable days that are a network's ${word} day`, n, "count"));
    }
    days.forEach((day, i) => {
      const n = i + 1;
      const who = day.networkId ? mention(day.networkId) : "";
      // A FIRST OR LAST DAY IS AN EVENT, NOT A COUNT (user, 2026-10-30: "Pacaswap anchored 1
      // snapshot on its last activity" read as if the 1 were the notable fact). The label says what
      // the day is, the last day the network anchored and nothing since (`notableDays`: a `last`
      // needs covered quiet days after it, to the measured record's end), and the prompt's caption
      // rule asks for the event first.
      const what =
        day.kind === "high" ? "spike"
        : day.kind === "low" ? "dip"
        : day.kind === "first" ? `first day ${who} anchored a metagraph snapshot, none before`
        : day.kind === "last" ? `last day ${who} anchored a metagraph snapshot, none since`
        // THE RANGE'S EXTREMES (`NOTABLE_FLOOR`): named as the span's, never as a spike or a dip.
        : day.kind === "peak" ? "busiest day of the span"
        : day.kind === "trough" ? "quietest day of the span"
        : day.kind === "longest" ? "longest gap of the span"
        : day.kind === "broadest" ? "most networks anchoring of the span"
        : "pause";
      const kind = dayMeasured(day);
      const measured =
        // A GAP IN ANCHORING, NOT A "WAIT" (user, 2026-11-03: "wait has no real meaning so I think
        // anchoring is more suitable"): the DAG's is a gap between its global snapshots, a network's
        // a gap in its anchoring.
        day.kind === "pause" || day.kind === "longest" ? (dag ? "longest gap between global snapshots" : "longest gap in anchoring")
        : day.kind === "broadest" ? "networks that anchored that day"
        : day.measure === "globals" ? "global snapshots that day"
        // The whole network's fees and data are read from the stored floors (`notableDays`), which
        // leave out what the unlisted chains paid and wrote.
        : day.measure === "fees" ? `DAG in fees that day${dag ? ", at least" : ""}`
        : day.measure === "kb" ? `MB of data that day${dag ? ", at least" : ""}`
        : "metagraph snapshots anchored that day";
      const metric = day.measure === "fees" || day.measure === "kb" ? TREND_METRICS[day.measure] : null;
      const read = (v: number) => (metric ? v * metric.scale : v);
      const format = metric?.format;
      facts.push(fact(`Notable day ${n} date (${what})`, day.dayMs, "date"));
      facts.push(fact(`Notable day ${n} ${what}, ${measured}`, read(day.value), kind, format));
      // The level beside it: an event's USUAL level (the median before it), an extreme's SPAN median.
      const level =
        day.kind === "high" || day.kind === "low" ? "usual level"
        // THE LEVEL IS A DAY'S LONGEST GAP, never the spacing (user, 2026-11-03: "I don't think it's
        // usually 3.5 minutes"): the median, over the days, of each day's longest gap, so the words
        // name it as that, or a reader takes it for the cadence.
        : day.kind === "pause" ? "longest gap on a typical day"
        : day.kind === "peak" || day.kind === "trough" ? "span median"
        : day.kind === "longest" ? "longest gap on a typical day of the span"
        : day.kind === "broadest" ? "span median networks"
        : null;
      if (level) facts.push(fact(`Notable day ${n} ${what}, ${level}`, read(day.level), kind, format));
      // HOW FAR THE DAY STOOD FROM IT, as a fact (user, 2026-11-03: a figure and its change, in the
      // model's own words rather than appended by code). A count only: a wait is said against its usual.
      const counted = day.kind === "high" || day.kind === "low" || day.kind === "peak" || day.kind === "trough";
      const pct = counted && day.level > 0 ? Math.round((day.value / day.level - 1) * 100) : 0;
      if (level && pct !== 0) facts.push(fact(`Notable day ${n} ${what}, change against the ${level}, ${pct > 0 ? "up" : "down"}`, Math.abs(pct) / 100, "share"));
      if (dag && (day.kind === "first" || day.kind === "last") && day.networkId && blurbOf[day.networkId]) {
        const line = `${nameOf(day.networkId)} is: ${blurbOf[day.networkId]}`;
        if (!blurbs.includes(line)) blurbs.push(line);
      }
    });
  }

  if (unlisted) blurbs.push(UNLISTED_SET_BLURB);
  return { facts, days, names: [...new Set([...Object.values(catalog), ...mentioned])], blurbs };
}
