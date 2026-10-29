import { fact, networksAnchored } from "@/src/data/noteFacts";
import type { Fact, FactPair, NoteLead } from "@/src/data/noteTypes";
import { anchorSeries, formatDag, globalSeries, metricSeries, spanAverage, trimCounterEdges, unlistedUnmeasured, withUnlisted } from "@/src/data/trendSeries";
import type { TrendsWindowData } from "@/src/data/trendWindow";
import { LISTED_IDS, UNLISTED_ID } from "@/src/data/unlisted";

// SNAPSHOTS' FACTS BUILDER — what the Snapshots note's model is shown. The Snapshots view is the
// LIVE instrument of the anchoring chamber, so its note describes the anchoring RHYTHM over the
// recent hours against the usual (the last week): how fast global snapshots arrive, how evenly,
// how much each carries. It reads the store's payloads through the SAME `globalSeries` /
// `metricSeries` / `anchorSeries` / `spanAverage` / `trimCounterEdges` the History rows do, so the
// note and the History chart state one figure (`noteFactsTrend.ts` is the reference builder and
// this one mirrors its idiom).
//
// `recent` is the last six hours of the 5-minute tier and `week` the last seven days of the
// hourly tier, both the STORE's payload, UNFOLDED (`withUnlisted` is applied here).
//
// THE GATE'S INTERFACE (`noteHonesty.ts`): a ratio belongs to a network only by its display name in
// the fact's LABEL. The ratio of the whole chamber names no network; a network's starts with its
// name. `names` is the FULL catalog list.
//
// HONESTY (rule 10):
//   · RECENT AGAINST USUAL is the per-hour rate over `recent` over the per-hour rate over `week`,
//     each over MEASURED buckets only, partial edge buckets trimmed (`trimCounterEdges`). A null
//     bucket is "not measured", never a zero, and a rate is never extrapolated past what was
//     measured: "per hour" is the unit both tiers can state without inventing a day;
//   · a ratio exists only when both sides were measured and the usual is above 0;
//   · the whole chamber's fee and data totals exist only after the fold. Where the unlisted
//     channels went unmeasured inside a window's trimmed span, that side is its catalog floor:
//     labelled ", at least", and fees / data carry no ratio at all;
//   · a spacing is stated only where a bucket held snapshots (no division by an absence);
//   · "was part of" is the network's share of the global snapshots over `recent`, over the buckets
//     where both were measured, and the whole is never smaller than the part;
//   · A CHANGE IS A PAIR (R54): the usual and the recent reading of one rate, spacing, fee or
//     data figure carry `pair` (`from` / `to`, keyed by its label) when both are stated and
//     neither is a floor, so the gate states the usual figure only beside its own recent one
//     (R60);
//   · null when `recent` holds no measured bucket: nothing to describe, so no model call.
//
// WHAT THE NOTE LEADS WITH (R71, user 2026-10-29: "change, else now"). The Snapshots note is the
// one note whose subject is a live rhythm, and most hours it holds: a note made to lead with a
// change then opens on noise ("rose from 1,440 to 1,451"). So the builder says which question the
// prompt asks — `lead` names the pairs whose recent reading departs from the usual one by
// `LEAD_CHANGE` or more ("change", with the keys), else is "now", the reading itself (the rate,
// the spacing, the longest gap, what was part of what). The threshold is the builder's, not the
// model's, so "clearly" is one number here rather than a judgement in the prompt.
//
// Pure: no store values, react or I/O (the colocated test is the specification — rule 4).

export interface LedgerFactsInput {
  subject: "all" | "dag" | string; // "all" and "dag" = the whole chamber; else a network's catalog id
  recent: TrendsWindowData; // last 6 hours of the 5m tier (store, unfolded)
  week: TrendsWindowData; // last 7 days of the 1h tier (store, unfolded)
  names: Record<string, string>; // catalog id → display name
}

const HOURS_PER_DAY = 24;

/** A pair's recent reading this far (as a ratio of its usual one) from 1 is a change worth leading
 *  with; under it, the note leads with the reading itself (R71). */
const LEAD_CHANGE = 0.1;

type Points = readonly (number | null)[];

/** The pairs whose two ends differ by `LEAD_CHANGE` or more, named by key in facts order — a
 *  "change" lead when there are any, else "now". A pair whose usual end is 0 is a change whenever
 *  its recent end is not (a rate that started). The moved pairs are NAMED so the prompt can say
 *  which figures to lead with: told only "lead with change", the model led with a rate that had
 *  moved one percent while the fees had doubled. */
function leadOf(facts: readonly Fact[]): NoteLead {
  const from = new Map<string, number>();
  const to = new Map<string, number>();
  for (const f of facts) if (f.pair) (f.pair.end === "from" ? from : to).set(f.pair.key, f.value);
  const moved: string[] = [];
  for (const [key, a] of from) {
    const b = to.get(key);
    if (b == null) continue;
    if (a === 0 ? b !== 0 : Math.abs(b / a - 1) >= LEAD_CHANGE) moved.push(key);
  }
  return moved.length ? { kind: "change", moved } : { kind: "now" };
}

/** The window with its partial edge buckets cut, every series cut identically. */
const trimmed = (a: Points, d: TrendsWindowData): (number | null)[] => trimCounterEdges(a, d.stepMs);

/** A counter's average PER HOUR over its measured, edge-trimmed buckets. Null where none measured.
 *  (`spanAverage` answers per day; an hour is the unit the 5-minute tier states without inventing
 *  a day, and dividing a measured day-rate by 24 is exact.) */
function perHour(metric: "snapshots" | "globals" | "fees" | "kb", points: Points, d: TrendsWindowData): number | null {
  const v = spanAverage(metric, trimmed(points, d), d.stepMs);
  return v == null ? null : v / HOURS_PER_DAY;
}

/** Whether the unlisted channels went unmeasured in any bucket of the trimmed span, which makes the
 *  whole chamber's fee and data totals their catalog floor there. */
const floorOnly = (d: TrendsWindowData): boolean => trimCounterEdges(unlistedUnmeasured(d.series), d.stepMs).some(Boolean);

/** The widest single gap over the measured, edge-trimmed buckets. Null where none was measured. */
function longestGap(gapMax: Points, d: TrendsWindowData): number | null {
  let max: number | null = null;
  for (const v of trimmed(gapMax, d)) if (v != null && v > 0 && (max == null || v > max)) max = v;
  return max;
}

/** THE PAIR (R54) of one quantity read usual and recent: the ends' `pair` when BOTH were stated,
 *  else none (a lone end is no change). */
const ends = (key: string, both: boolean) => (end: FactPair["end"]): FactPair | undefined => (both ? { key, end } : undefined);

/** Σ numerator ÷ Σ denominator over the buckets where BOTH were measured and the denominator held
 *  something. Null where no bucket qualifies. */
function pairedSums(num: Points, den: Points, d: TrendsWindowData): { n: number; d: number } | null {
  const a = trimmed(num, d);
  const b = trimmed(den, d);
  let n = 0;
  let m = 0;
  let any = false;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x == null || y == null || y <= 0) continue;
    n += x;
    m += y;
    any = true;
  }
  return any ? { n, d: m } : null;
}

export function ledgerFacts(input: LedgerFactsInput): { facts: Fact[]; names: string[]; lead: NoteLead } | null {
  const { subject, names: catalog } = input;
  const isListed = (id: string) => LISTED_IDS.has(id) || id in catalog;
  const fold = (d: TrendsWindowData): TrendsWindowData => ({ ...d, series: withUnlisted(d.series, isListed, UNLISTED_ID) });
  const recent = fold(input.recent);
  const week = fold(input.week);
  // Coverage is the store's one marker, `g.ticks`, over the buckets that are complete.
  if (!trimmed(recent.series["g.ticks"] ?? [], recent).some((v) => v != null)) return null;
  const weekCovered = trimmed(week.series["g.ticks"] ?? [], week).some((v) => v != null);

  const whole = subject === "all" || subject === "dag";
  const ids = Object.keys(catalog).filter((id) => id !== "dag");
  const facts: Fact[] = [];

  /** The recent rate, the usual rate, and their ratio, for one series pair. */
  const rates = (
    label: string,
    ratioLabel: string,
    metric: "snapshots" | "globals",
    pick: (d: TrendsWindowData) => Points,
  ) => {
    const now = perHour(metric, pick(recent), recent);
    if (now == null) return;
    const usual = weekCovered ? perHour(metric, pick(week), week) : null;
    const end = ends(label, usual != null);
    facts.push(fact(`${label}, recent`, now, "count", undefined, end("to")));
    if (usual == null) return;
    facts.push(fact(`${label}, usual`, usual, "count", undefined, end("from")));
    if (usual > 0) facts.push(fact(ratioLabel, now / usual, "ratio"));
  };

  if (whole) {
    rates("Global snapshots per hour", "Global snapshots per hour, ratio of recent to usual", "globals", (d) => globalSeries("globals", d.series));

    // THE RHYTHM: mean spacing is Σgap ÷ Σsnapshots (`spanAverage` weights it), the longest is the
    // widest single gap measured.
    const spacing = (d: TrendsWindowData) =>
      spanAverage("continuity", trimmed(globalSeries("continuity", d.series), d), d.stepMs, trimmed(d.series["g.ticks"] ?? [], d));
    const mean = spacing(recent);
    const usualMean = weekCovered ? spacing(week) : null;
    const spaced = ends("Mean spacing between global snapshots", mean != null && usualMean != null);
    if (mean != null) facts.push(fact("Mean spacing between global snapshots, recent", mean, "duration", undefined, spaced("to")));
    if (usualMean != null) facts.push(fact("Mean spacing between global snapshots, usual", usualMean, "duration", undefined, spaced("from")));
    const widest = longestGap(recent.series["g.gapMax"] ?? [], recent);
    if (widest != null) facts.push(fact("Longest gap between global snapshots, recent", widest, "duration"));

    // WHAT EACH ONE CARRIES: the snapshots anchored per global snapshot, over buckets where both counted.
    const carried = pairedSums(recent.series["g.anchors"] ?? [], recent.series["g.ticks"] ?? [], recent);
    if (carried) facts.push(fact("Snapshots anchored per global snapshot, recent", carried.n / carried.d, "amount"));

    // FEES AND DATA, per hour. The whole totals are only a floor where the unlisted channels were
    // not measured: labelled so, and given no ratio and no pair.
    for (const [metric, word, format] of [["fees", "Fees in DAG", formatDag], ["kb", "Data in MB", undefined]] as const) {
      const label = `${word} per hour`;
      const sides = ([["recent", recent], ["usual", week]] as const)
        .filter(([side]) => side === "recent" || weekCovered)
        .map(([side, d]) => ({ side, v: perHour(metric, globalSeries(metric, d.series), d), floor: floorOnly(d) }));
      const end = ends(label, sides.length === 2 && sides.every((x) => x.v != null && !x.floor));
      for (const { side, v, floor } of sides)
        if (v != null) facts.push(fact(`${label}, ${side}${floor ? ", at least" : ""}`, v, "amount", format, end(side === "recent" ? "to" : "from")));
    }

    // HOW MANY NETWORKS: those of the catalog that created or were carried by a snapshot.
    const active = ids.filter((id) => {
      const snaps = trimmed(metricSeries("snapshots", id, recent.series).points, recent);
      const carriedBy = trimmed(anchorSeries(id, recent.series), recent);
      return [...snaps, ...carriedBy].some((v) => v != null && v > 0);
    });
    const anchored = networksAnchored(active.length, recent.series, recent.stepMs);
    facts.push(fact(`Networks that anchored snapshots, recent${anchored.atLeast ? ", at least" : ""}`, anchored.count, "count"));
  } else {
    const name = catalog[subject] ?? subject;
    const own = (d: TrendsWindowData) => metricSeries("snapshots", subject, d.series).points;
    rates(`${name} snapshots anchored per hour`, `${name} snapshots anchored per hour, ratio of recent to usual`, "snapshots", own);

    const spacing = (d: TrendsWindowData) => {
      const s = metricSeries("continuity", subject, d.series);
      return spanAverage("continuity", trimmed(s.points, d), d.stepMs, trimmed(own(d), d));
    };
    const mean = spacing(recent);
    const usualMean = weekCovered ? spacing(week) : null;
    const spaced = ends(`${name} mean spacing between snapshots`, mean != null && usualMean != null);
    if (mean != null) facts.push(fact(`${name} mean spacing between snapshots, recent`, mean, "duration", undefined, spaced("to")));
    if (usualMean != null) facts.push(fact(`${name} mean spacing between snapshots, usual`, usualMean, "duration", undefined, spaced("from")));
    const widest = longestGap(metricSeries("continuity", subject, recent.series).gaps ?? [], recent);
    if (widest != null) facts.push(fact(`${name} longest gap between snapshots, recent`, widest, "duration"));

    // WAS PART OF: the global snapshots that carried it, over all of them. The whole is never
    // smaller than the part.
    const part = pairedSums(anchorSeries(subject, recent.series), recent.series["g.ticks"] ?? [], recent);
    if (part) facts.push(fact(`Share of the global snapshots ${name} was part of, recent`, part.n / Math.max(part.d, part.n), "share"));
  }

  if (!facts.length) return null;
  return { facts, names: [...new Set(Object.values(catalog))], lead: leadOf(facts) };
}
