import { fact } from "@/src/data/noteFacts";
import type { Fact } from "@/src/data/noteTypes";

// THE COMMON FACTS — what a view's note adds AFTER its own subject (user, 2026-10-29, on a
// Hypergraph note that opened on snapshots: a note "starts from its key view focus, then adds info
// about more app-common topics like snapshots … view specific augmented with common relevant info
// for all views and not yet addressed by that particular view"). Snapshots are the app's common
// currency, so the common reading is ACTIVITY: the subject's global snapshots per day over the last
// week against the weeks before. ONE HOME (convention 8): Hypergraph and Geography both append these
// facts last, so the two views cannot state two activities for one network, and each view's prompt
// asks for them last, in one sentence. Snapshots' own subject IS activity (it reads hours against
// the week, `noteFactsLedger.ts`) and History measures every topic over its span, so neither adds
// them.
//
// HONESTY (rule 10):
//   · "last week" is the per-day mean over the last WEEK_DAYS complete days, measured days only
//     and at least WEEK_MIN_DAYS of them (M7: a per-day rate beside the weeks before must rest on
//     more than a day or two), else nothing at all;
//   · "the weeks before" is the mean over the PRIOR_DAYS complete days before that week, at least
//     PRIOR_MIN_DAYS of them measured, else no comparison; the ratio only when both are above 0
//     and differ. The wording is deliberate: the gate reads "three weeks" as a number (R46);
//   · A CHANGE IS A PAIR (R54): the two readings carry `pair`, keyed by the label, so the gate
//     states the earlier figure only beside its own current one;
//   · the series is the caller's, already cut of its still-filling newest day (`trimNewestPartial`)
//     and read through `anchorSeries` for a network (a pre-2026-10-08 zero is "not measured").
//
// Pure: no store values, react or I/O (the colocated test is the specification — rule 4).

export const WEEK_DAYS = 7;
/** "The weeks before": the complete days before the last week, back to four weeks. */
export const PRIOR_DAYS = 21;
/** The fewest measured days the weeks before are read from at all. */
export const PRIOR_MIN_DAYS = 7;
/** The fewest measured days "last week" is read from at all. */
export const WEEK_MIN_DAYS = 4;

type Points = readonly (number | null)[];

const mean = (xs: readonly number[]): number => xs.reduce((a, v) => a + v, 0) / xs.length;
const measured = (xs: Points): number[] => xs.filter((v): v is number => v != null);

/** Whether a facts list holds the common reading at all — the prompt asks for it only then (a
 *  country has none, and a network short of measured days has none; asked anyway, the model wrote
 *  one from a share ratio: "activity last week was 0.82 global snapshots per day", live 2026-10-29). */
export function hasCommonReading(facts: readonly Fact[]): boolean {
  return facts.some((f) => COMMON_RE.test(f.label));
}
const COMMON_RE = /global snapshots.*per day, last week$/i;

/** The index the last week starts at in a daily series of `n` complete days. */
export function weekStart(n: number): number {
  return Math.max(0, n - WEEK_DAYS);
}

/** The last week's per-day mean of a daily series; null under WEEK_MIN_DAYS measured days. */
export function lastWeekMean(points: Points): number | null {
  const vals = measured(points.slice(weekStart(points.length)));
  return vals.length >= WEEK_MIN_DAYS ? mean(vals) : null;
}

/** The per-day mean over the weeks before the last week; null under PRIOR_MIN_DAYS measured days. */
export function priorWeeksMean(points: Points): number | null {
  const weekFrom = weekStart(points.length);
  const vals = measured(points.slice(Math.max(0, weekFrom - PRIOR_DAYS), weekFrom));
  return vals.length >= PRIOR_MIN_DAYS ? mean(vals) : null;
}

/** `<label>, last week` beside `<label>, the weeks before` and their ratio, as a pair; the last
 *  week alone when the weeks before are short of measured days; nothing when the last week is. */
export function activityFacts(label: string, points: Points): Fact[] {
  const lastWeek = lastWeekMean(points);
  if (lastWeek == null) return [];
  const before = priorWeeksMean(points);
  const facts: Fact[] = [fact(`${label}, last week`, lastWeek, "count", undefined, before == null ? undefined : { key: label, end: "to" })];
  if (before == null) return facts;
  facts.push(fact(`${label}, the weeks before`, before, "count", undefined, { key: label, end: "from" }));
  if (lastWeek > 0 && before > 0 && lastWeek !== before) facts.push(fact(`${label}, ratio last week to the weeks before`, lastWeek / before, "ratio"));
  return facts;
}
