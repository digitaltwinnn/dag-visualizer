import type { Fact, FactPair } from "@/src/data/noteTypes";
import { formatSeconds, trimCounterEdges } from "@/src/data/trendSeries";
import { UNLISTED_ID } from "@/src/data/unlistedId";

// THE SHARED HELPERS OF EVERY VIEW'S FACTS BUILDER — one home. A builder (History's is
// `noteFactsTrend.ts`) turns measured data into a short list of labelled `Fact`s with the ratios
// and shares already computed; the model writes from those and the honesty gate (`noteHonesty.ts`)
// holds its numbers to them. Three things live here because every builder needs them and two
// copies would be two answers to "how is a fact written":
//   · `fact` — the ONE formatter. `text` is exactly what the model is shown, and the gate reads
//     a written number at the precision it was written to, so a count the model quotes as
//     "12,159" is backed by the fact whose text said so;
//   · `gaugeChange` — what a gauge (the node count) did over a span, read THROUGH outages;
//   · `factsBlock` — the facts as the prompt's lines.
//
// HONESTY (rule 10): nothing here invents a value. A gauge with too few samples, or whose end
// level does not hold, has no stated change (null), never a guess.
//
// Pure: no store, react or I/O (the colocated test is the specification — rule 4).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** A value under 1 is written to 2 SIGNIFICANT digits (0.034, 0.04), never rounded to a "0" that
 *  would state nothing happened: the gate backs a written zero by this text, and a quiet network
 *  anchors a few snapshots a month (0.03 a day), not none. */
function belowOne(v: number): string {
  return v.toLocaleString("en-US", { maximumSignificantDigits: 2 });
}

/** A count is an integer, so it is written whole — except a per-day AVERAGE under ten, which keeps
 *  a decimal (see `belowOne` for a value under 1). */
function countText(v: number): string {
  if (v !== 0 && Math.abs(v) < 1) return belowOne(v);
  return Math.abs(v) >= 10 || Number.isInteger(v)
    ? Math.round(v).toLocaleString("en-US")
    : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

const UNIT_WORDS: Record<string, string> = { s: "second", m: "minute", h: "hour", d: "day" };
const SHORT_DURATION_RE = /(?<![\w.,])(\d+(?:\.\d+)?)([smhd])(?![\w%])/g;

/** A NOTE WRITES ITS UNITS OUT (user, 2026-10-31: "10s spacing"; "use written seconds, minutes,
 *  hours"). A chart's axis stays short, so this belongs to the notes alone: a duration fact reads
 *  this way, and the generator runs it over what the model wrote, which sometimes shortens one anyway. */
export function spellDurations(text: string): string {
  return text.replace(SHORT_DURATION_RE, (_, n: string, u: string) => `${n} ${UNIT_WORDS[u]}${n === "1" ? "" : "s"}`);
}

/** One fact. `kind` picks the notation: count (12,159), amount (one decimal at most, two
 *  significant digits under 1), share (a rounded %), ratio (2 decimals), duration
 *  (`formatSeconds`, written out, seconds in), date (UTC "Oct 19", epoch ms in). `format` replaces an amount's
 *  notation with the chart's own formatter (fees are written by `formatDag`). `pair` marks the fact
 *  as one end of a measured change (`Fact.pair`, R54); a fact with none carries no `pair` key. */
export function fact(
  label: string,
  value: number,
  kind: Fact["kind"],
  format?: (v: number) => string,
  pair?: FactPair,
): Fact {
  let text: string;
  switch (kind) {
    case "count": text = countText(value); break;
    case "amount":
      text = format ? format(value) : value !== 0 && Math.abs(value) < 1 ? belowOne(value) : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
      break;
    case "share": text = `${Math.round(value * 100)}%`; break;
    case "ratio": text = value.toFixed(2); break;
    case "duration": text = spellDurations(formatSeconds(value)); break;
    case "date": {
      const d = new Date(value);
      text = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
      break;
    }
  }
  return pair ? { label, value, kind, text, pair: { ...pair } } : { label, value, kind, text };
}

/** HOW MANY NETWORKS ANCHORED, counting the unlisted ones honestly. `listed` is the catalog networks
 *  that anchored; `series` is the FOLDED payload (`withUnlisted`), whose `m.unlisted.snaps` is the
 *  sum of every chain outside the catalog. Unlisted is at least one chain and how many is unknown,
 *  so measured activity there makes the count a floor: `listed + 1`, `atLeast` true (the label then
 *  says ", at least"). Zero or unmeasured activity leaves the plain count. */
export function networksAnchored(
  listed: number,
  series: Readonly<Record<string, readonly (number | null)[]>>,
  stepMs: number,
): { count: number; atLeast: boolean } {
  const active = trimCounterEdges(series[`m.${UNLISTED_ID}.snaps`] ?? [], stepMs).some((v) => v != null && v > 0);
  return active ? { count: listed + 1, atLeast: true } : { count: listed, atLeast: false };
}

/** How far behind a span's end the sampler may stand and the span still count as read: two of its
 *  15-minute runs, one still to come and one late. */
export const READ_SLACK_MS = 30 * 60_000;

/** When the sampler last read each catalog chain (`read.<id>` in the cursor hash). */
export type ChainReads = Readonly<Record<string, number>>;

/** WHETHER A CHAIN'S SILENCE IS MEASURED (rule 10). The spine says the sampler ran, not that this
 *  chain answered, and the store reads a failed chain and a silent one the same. Past spans stay
 *  whole, since a later read catches them up, so it is the span's end that must be read. No read on
 *  record leaves the store's word standing: the first run that keeps one, or a chain not sampled. */
export function chainReadThrough(reads: ChainReads | null | undefined, id: string, toMs: number): boolean {
  const at = reads?.[id];
  return at == null || at >= toMs - READ_SLACK_MS;
}

/** Whether the spine covered a whole span, apart from the tail the sampler has yet to reach. */
export function spanMeasured(ticks: readonly (number | null)[], stepMs: number): boolean {
  const last = ticks.findLastIndex((v) => v != null);
  if (last < 0 || (ticks.length - 1 - last) * stepMs > READ_SLACK_MS) return false;
  return ticks.slice(0, last).every((v) => v != null);
}

export function median(xs: readonly number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** A LEVEL IS AN OBSERVED SAMPLE (ruling R52): the median of `xs` (non-empty, in SAMPLE ORDER),
 *  but on an even count one of the two middle values rather than their mean, so a held node count
 *  is always a reading the sampler made and a note can never say "17.5 nodes".
 *
 *  WHICH MIDDLE (R55, R61): the one NEARER THE EDGE BEING DESCRIBED. An even split is a gauge
 *  caught between two levels, and the edge says which level it stood at there: at the span's
 *  `end` the value read more recently (its last sample comes later), at its `start` the value read
 *  earlier (its first sample comes sooner). So 0, 0, 0, 5, 5, 5 reads 0 at a start and 5 at an
 *  end: a network that came up in the span's first hours is a change from 0 to 5, and one that
 *  came up in its last hours stands at 5 ("with nodes", ranked, in `setKey`). Either fixed choice
 *  hid one of those (the lower middle, R52's first rule, kept the second at 0 for hours).
 *
 *  Every level a builder STATES goes through this (`heldLevel` and `gaugeChange`'s `to` at the
 *  end, `gaugeChange`'s `from` at the start, Hypergraph's layer and combination ends); a median
 *  used only as a tolerance check (the hold test below, geo's day totals) is not a stated level
 *  and stays the plain median. */
export function observedLevel(xs: readonly number[], edge: "start" | "end"): number {
  const s = xs.slice().sort((a, b) => a - b);
  if (s.length % 2) return s[s.length >> 1]!;
  const lo = s[s.length / 2 - 1]!;
  const hi = s[s.length / 2]!;
  if (edge === "end") return xs.lastIndexOf(hi) > xs.lastIndexOf(lo) ? hi : lo;
  return xs.indexOf(hi) < xs.indexOf(lo) ? hi : lo;
}

/** Samples a level is read from at either end, and the fewest a gauge needs to be read at all. */
const LEVEL_SAMPLES = 6;
const MIN_SAMPLES = 12;
/** The end level must also hold over the final quarter of the span, within this fraction. */
const HOLD_TOLERANCE = 0.1;

/** A GAUGE'S CURRENT LEVEL: the median (`observedLevel`, R52) of its last six MEASURED samples
 *  (`gaugeChange`'s own `to`), so one bad hour — a failed fetch stored as 0 or a partial low count —
 *  never becomes "now". Null when the gauge has no measured sample; with fewer than six it is the
 *  median of those it has. */
export function heldLevel(points: readonly (number | null)[]): number | null {
  const xs = points.filter((v): v is number => v != null);
  return xs.length ? observedLevel(xs.slice(-LEVEL_SAMPLES), "end") : null;
}

/** WHAT A GAUGE DID OVER A SPAN: the level at the start and at the end, each the MEDIAN of the
 *  first / last six measured samples, an observed one (`observedLevel`, R52). A median reads
 *  through an outage (an interior run of low samples never touches either end) and through a
 *  one-sample spike. The end level is stated only if it HOLDS: the median of the final quarter of
 *  the samples must sit within 10% of it, else the span ended mid-move and no honest "to" exists.
 *  Null samples are not measured and are left out; fewer than 12 measured samples is too few to
 *  call a level. `firstIndex` is where the first measured sample sits in `points`: a gauge that
 *  began late (the fleet's series starts the day the sampler first ran) has a `from` that is not
 *  the span's start, and the caller decides. */
export function gaugeChange(points: readonly (number | null)[]): { from: number; to: number; firstIndex: number } | null {
  const xs = points.filter((v): v is number => v != null);
  if (xs.length < MIN_SAMPLES) return null;
  const from = observedLevel(xs.slice(0, LEVEL_SAMPLES), "start");
  const to = heldLevel(points)!;
  const quarter = median(xs.slice(-Math.ceil(xs.length / 4)));
  if (Math.abs(quarter - to) > HOLD_TOLERANCE * Math.abs(to)) return null;
  return { from, to, firstIndex: points.findIndex((v) => v != null) };
}

/** HOW FAR EACH MEASURED CHANGE MOVED, AS A FACT (user, 2026-11-03: "from x to y, up z% can be
 *  shortened by saying just the current value and its increase", and the wording belongs in the
 *  prompt, never in code rewriting the model's answer). For every pair (`Fact.pair`) whose ends
 *  differ by a rounded percent or more, one `share` fact: the change, labelled with the current
 *  figure's own label, what it is measured against and its direction, so the model can write
 *  "fell 6% to 66" without arithmetic and the gate backs the 6% like any other figure. A pair that
 *  rounds to no change gets none: it held. Nor does one that stopped (a current figure of 0: the
 *  prompt's quiet rule says it) or grew more than tenfold from almost nothing (live 2026-11-03:
 *  "up 3551600%"): a percentage there says nothing a reader can use, so the note gives where it
 *  stands. */
/** How far a pair moved, in whole percent, or 0 when it rounds to nothing or has nothing to move from. */
export function pairChange(from: Fact, to: Fact): number {
  return from.value > 0 ? Math.round((to.value / from.value - 1) * 100) : 0;
}

export function withChangeFacts(facts: readonly Fact[]): Fact[] {
  const out = [...facts];
  for (const to of facts) {
    if (to.pair?.end !== "to") continue;
    const from = facts.find((f) => f.pair?.key === to.pair!.key && f.pair.end === "from");
    const pct = from ? pairChange(from, to) : 0;
    if (!from || pct === 0 || to.value === 0 || pct >= 1000) continue;
    out.push(fact(`${to.label}, change against ${againstWords(from.label, to.label)}, ${pct > 0 ? "up" : "down"}`, Math.abs(pct) / 100, "share"));
  }
  return out;
}

/** What a pair's earlier end is measured as, said once: the earlier label less the words it shares
 *  with the current one ("Germany, nodes a week ago" against "Germany, nodes" is "a week ago"). */
function againstWords(fromLabel: string, toLabel: string): string {
  const a = fromLabel.split(" "), b = toLabel.split(" ");
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const rest = a.slice(i).join(" ").replace(/^[,\s]+/, "");
  return rest || fromLabel;
}

/** The facts as the model is shown them: one `label: text` line each, then the ready-made
 *  lines (a builder's network blurbs, "<name> is: <blurb>") verbatim. */
export function factsBlock(facts: readonly Fact[], blurbs: readonly string[] = []): string {
  return [...facts.map((f) => `${f.label}: ${f.text}`), ...blurbs].join("\n");
}
