import type { Fact } from "@/src/data/noteTypes";
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

/** One fact. `kind` picks the notation: count (12,159), amount (one decimal at most, two
 *  significant digits under 1), share (a rounded %), ratio (2 decimals), duration
 *  (`formatSeconds`, seconds in), date (UTC "Oct 19", epoch ms in). `format` replaces an amount's
 *  notation with the chart's own formatter (fees are written by `formatDag`). */
export function fact(label: string, value: number, kind: Fact["kind"], format?: (v: number) => string): Fact {
  let text: string;
  switch (kind) {
    case "count": text = countText(value); break;
    case "amount":
      text = format ? format(value) : value !== 0 && Math.abs(value) < 1 ? belowOne(value) : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
      break;
    case "share": text = `${Math.round(value * 100)}%`; break;
    case "ratio": text = value.toFixed(2); break;
    case "duration": text = formatSeconds(value); break;
    case "date": {
      const d = new Date(value);
      text = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
      break;
    }
  }
  return { label, value, kind, text };
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

function median(xs: readonly number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Samples a level is read from at either end, and the fewest a gauge needs to be read at all. */
const LEVEL_SAMPLES = 6;
const MIN_SAMPLES = 12;
/** The end level must also hold over the final quarter of the span, within this fraction. */
const HOLD_TOLERANCE = 0.1;

/** A GAUGE'S CURRENT LEVEL: the median of its last six MEASURED samples (`gaugeChange`'s own `to`),
 *  so one bad hour — a failed fetch stored as 0 or a partial low count — never becomes "now". Null
 *  when the gauge has no measured sample; with fewer than six it is the median of those it has. */
export function heldLevel(points: readonly (number | null)[]): number | null {
  const xs = points.filter((v): v is number => v != null);
  return xs.length ? median(xs.slice(-LEVEL_SAMPLES)) : null;
}

/** WHAT A GAUGE DID OVER A SPAN: the level at the start and at the end, each the MEDIAN of the
 *  first / last six measured samples. A median reads through an outage (an interior run of low
 *  samples never touches either end) and through a one-sample spike. The end level is stated only
 *  if it HOLDS: the median of the final quarter of the samples must sit within 10% of it, else
 *  the span ended mid-move and no honest "to" exists. Null samples are not measured and are left
 *  out; fewer than 12 measured samples is too few to call a level. `firstIndex` is where the first
 *  measured sample sits in `points`: a gauge that began late (the fleet's series starts the day the
 *  sampler first ran) has a `from` that is not the span's start, and the caller decides. */
export function gaugeChange(points: readonly (number | null)[]): { from: number; to: number; firstIndex: number } | null {
  const xs = points.filter((v): v is number => v != null);
  if (xs.length < MIN_SAMPLES) return null;
  const from = median(xs.slice(0, LEVEL_SAMPLES));
  const to = heldLevel(points)!;
  const quarter = median(xs.slice(-Math.ceil(xs.length / 4)));
  if (Math.abs(quarter - to) > HOLD_TOLERANCE * Math.abs(to)) return null;
  return { from, to, firstIndex: points.findIndex((v) => v != null) };
}

/** The facts as the model is shown them: one `label: text` line each, then the ready-made
 *  lines (a builder's network blurbs, "<name> is: <blurb>") verbatim. */
export function factsBlock(facts: readonly Fact[], blurbs: readonly string[] = []): string {
  return [...facts.map((f) => `${f.label}: ${f.text}`), ...blurbs].join("\n");
}
