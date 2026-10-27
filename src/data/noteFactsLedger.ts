import { fact } from "@/src/data/noteFacts";
import type { Fact } from "@/src/data/noteTypes";
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
//   · null when `recent` holds no measured bucket: nothing to describe, so no model call.
//
// Pure: no store values, react or I/O (the colocated test is the specification — rule 4).

export interface LedgerFactsInput {
  subject: "all" | "dag" | string; // "all" and "dag" = the whole chamber; else a network's catalog id
  recent: TrendsWindowData; // last 6 hours of the 5m tier (store, unfolded)
  week: TrendsWindowData; // last 7 days of the 1h tier (store, unfolded)
  names: Record<string, string>; // catalog id → display name
}

const HOURS_PER_DAY = 24;

type Points = readonly (number | null)[];

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

export function ledgerFacts(input: LedgerFactsInput): { facts: Fact[]; names: string[] } | null {
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
    facts.push(fact(`${label}, recent`, now, "count"));
    const usual = weekCovered ? perHour(metric, pick(week), week) : null;
    if (usual == null) return;
    facts.push(fact(`${label}, usual`, usual, "count"));
    if (usual > 0) facts.push(fact(ratioLabel, now / usual, "ratio"));
  };

  if (whole) {
    rates("Global snapshots per hour", "Global snapshots per hour, ratio of recent to usual", "globals", (d) => globalSeries("globals", d.series));

    // THE RHYTHM: mean spacing is Σgap ÷ Σsnapshots (`spanAverage` weights it), the longest is the
    // widest single gap measured.
    const spacing = (d: TrendsWindowData) =>
      spanAverage("continuity", trimmed(globalSeries("continuity", d.series), d), d.stepMs, trimmed(d.series["g.ticks"] ?? [], d));
    const mean = spacing(recent);
    if (mean != null) facts.push(fact("Mean spacing between global snapshots, recent", mean, "duration"));
    const usualMean = weekCovered ? spacing(week) : null;
    if (usualMean != null) facts.push(fact("Mean spacing between global snapshots, usual", usualMean, "duration"));
    const widest = longestGap(recent.series["g.gapMax"] ?? [], recent);
    if (widest != null) facts.push(fact("Longest gap between global snapshots, recent", widest, "duration"));

    // WHAT EACH ONE CARRIES: the snapshots anchored per global snapshot, over buckets where both counted.
    const carried = pairedSums(recent.series["g.anchors"] ?? [], recent.series["g.ticks"] ?? [], recent);
    if (carried) facts.push(fact("Snapshots anchored per global snapshot, recent", carried.n / carried.d, "amount"));

    // FEES AND DATA, per hour. The whole totals are only a floor where the unlisted channels were
    // not measured: labelled so, and given no ratio.
    for (const [metric, word, format] of [["fees", "Fees in DAG", formatDag], ["kb", "Data in MB", undefined]] as const) {
      for (const [side, d] of [["recent", recent], ["usual", week]] as const) {
        if (side === "usual" && !weekCovered) continue;
        const v = perHour(metric, globalSeries(metric, d.series), d);
        if (v != null) facts.push(fact(`${word} per hour, ${side}${floorOnly(d) ? ", at least" : ""}`, v, "amount", format));
      }
    }

    // HOW MANY NETWORKS: those of the catalog that created or were carried by a snapshot.
    const active = ids.filter((id) => {
      const snaps = trimmed(metricSeries("snapshots", id, recent.series).points, recent);
      const carriedBy = trimmed(anchorSeries(id, recent.series), recent);
      return [...snaps, ...carriedBy].some((v) => v != null && v > 0);
    });
    facts.push(fact("Networks that anchored snapshots, recent", active.length, "count"));
  } else {
    const name = catalog[subject] ?? subject;
    const own = (d: TrendsWindowData) => metricSeries("snapshots", subject, d.series).points;
    rates(`${name} snapshots anchored per hour`, `${name} snapshots anchored per hour, ratio of recent to usual`, "snapshots", own);

    const spacing = (d: TrendsWindowData) => {
      const s = metricSeries("continuity", subject, d.series);
      return spanAverage("continuity", trimmed(s.points, d), d.stepMs, trimmed(own(d), d));
    };
    const mean = spacing(recent);
    if (mean != null) facts.push(fact(`${name} mean spacing between snapshots, recent`, mean, "duration"));
    const usualMean = weekCovered ? spacing(week) : null;
    if (usualMean != null) facts.push(fact(`${name} mean spacing between snapshots, usual`, usualMean, "duration"));
    const widest = longestGap(metricSeries("continuity", subject, recent.series).gaps ?? [], recent);
    if (widest != null) facts.push(fact(`${name} longest gap between snapshots, recent`, widest, "duration"));

    // WAS PART OF: the global snapshots that carried it, over all of them. The whole is never
    // smaller than the part.
    const part = pairedSums(anchorSeries(subject, recent.series), recent.series["g.ticks"] ?? [], recent);
    if (part) facts.push(fact(`Share of the global snapshots ${name} was part of, recent`, part.n / Math.max(part.d, part.n), "share"));
  }

  if (!facts.length) return null;
  return { facts, names: [...new Set(Object.values(catalog))] };
}
