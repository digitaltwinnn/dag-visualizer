import { median } from "@/src/data/noteFacts";
import type { NotableDay } from "@/src/data/noteTypes";

// NOTABLE DAYS — which days of the measured history deserve a line of their own. Code decides, a
// model only WRITES each day's caption afterwards (Task 3 onward), so the days are the same on
// every run for the same buckets: a pure function of the daily rows, no clock, no randomness.
//
// HONESTY (rule 10), in the three places it bites:
//   · a day the sampler did not measure (`covered[i] === null`) is never notable and never counts —
//     not toward a median, not toward the "quiet days" a first or last needs. An outage is not a low;
//   · on a COVERED day an absent counter is a measured 0. That is the read route's own rule
//     (`app/api/trends/assemble.ts`: covered + absent counter → 0, "the sampler looked, nothing was
//     there"), and `withUnlisted` folds with the same `?? 0`. So `null` in a covered slot is read
//     as 0 here, exactly as the charts read it;
//   · a series' LEVEL is its own: built only from days at or after its first activity, and no high
//     or low is read after its last — a network waking up or going quiet is a `first` / `last`,
//     not a run of spikes and dips against a baseline of its own silence;
//   · LEAD-IN (`from`): days before the first reportable one feed the levels but are never reported;
//   · a STOP is one event: a run of QUIET_DAYS+ measured zeros inside a series' activity is a
//     break — its first day may be a low, the rest of the run is not judged, and the days after a
//     resume read their level from the resumed days alone (their own LEVEL_MIN of them);
//   · consecutive days of one kind for one series are ONE notable day, the strongest;
//   · a gap of 0 seconds is NOT a measurement: `gapMax` is 0 on a day the chain sealed nothing, and
//     a median that counted those would sink to 0 and make every ordinary gap a "pause". The pause
//     level is the median of the covered days that HAD a widest gap.
//
// ⚠️ Nothing here reads the store, react or THREE; the colocated test is the specification (rule 4).

/** How many notable days each History pill keeps. */
export const NOTABLE_CAPS: Record<"7d" | "30d" | "90d" | "1y" | "all", number> = { "7d": 3, "30d": 5, "90d": 6, "1y": 10, all: 10 };

/** THE FLOOR (user, 2026-10-30: "I've not seen more than 1 notable day, can we have at least 3? If
 *  nothing really notable changed, call out the highs/lows of the network during that range"). A
 *  range whose thresholded events fall short of this is filled with the range's own EXTREMES, each
 *  named as such (`peak`, `trough`, then `longest` for a network's widest gap or `broadest` for the
 *  day the most networks anchored on the hypergraph), never as a spike, a dip or a pause: an
 *  extreme is the range's business, a spike is the level's. Fills score 0, never displace an
 *  event, never repeat a day, and are read on covered reportable days only, inside a network's own
 *  activity. The caller asks for it (`NotableInput.floor`); the default is none. */
export const NOTABLE_FLOOR = 3;

/** A brushed range's cap: the pill of its length's, and none under a week, too short for a day to
 *  stand out (the pills' own rule). */
export function rangeNotableCap(ms: number): number {
  const days = ms / 86_400_000;
  return days >= 365 ? NOTABLE_CAPS["1y"] : days >= 90 ? NOTABLE_CAPS["90d"] : days >= 30 ? NOTABLE_CAPS["30d"] : days >= 7 ? NOTABLE_CAPS["7d"] : 0;
}

/** The covered days before a day that its level (their median) is read from, and the fewest of
 *  them a day needs before it can be called high or low at all. */
const LEVEL_DAYS = 14;
const LEVEL_MIN = 7;
/** A high is at least this many times the level, a low at most this fraction of it. */
const HIGH_RATIO = 2;
const LOW_RATIO = 0.4;
/** A high under this is a handful of snapshots, not a spike, however large the ratio. */
const HIGH_FLOOR = 10;
/** Covered quiet days a beginning needs before it, and an ending needs after it. */
const QUIET_DAYS = 3;
/** A pause: this many times the network's median widest gap, and at least this many seconds. */
const PAUSE_RATIO = 6;
const PAUSE_FLOOR_S = 3600;
/** The fewest of a measure, in its stored unit, that can be high or the usual a low stands against:
 *  a DAG in fees, a MB of data. Under these a ratio is noise. */
const FEE_FLOOR = 1e8;
const KB_FLOOR = 1024;

/** Whether a widest gap is a pause against a chain's usual one. */
export const isPause = (value: number, level: number): boolean => value >= PAUSE_FLOOR_S && value >= PAUSE_RATIO * level;

export interface NotableInput {
  /** UTC-midnight starts, oldest first. */
  days: number[];
  /** `g.ticks` per day; null = the day was not measured. */
  covered: (number | null)[];
  /** The daily rows: `g.anchors`, `g.ticks`, `m.<id>.snaps`, `m.<id>.gapMax`. */
  series: Record<string, (number | null)[]>;
  /** "dag" for the whole network, else a network id. */
  subject: "dag" | string;
  /** Every network id — the DAG subject reads each one's first and last day. */
  ids: readonly string[];
  cap: number;
  /** Index into `days` of the first REPORTABLE day (default 0). Earlier days are lead-in: they feed
   *  levels, the quiet-day counts and the pause median, but are never reported. A `first` is
   *  reported only when the series' first activity in the WHOLE input falls at or after `from`
   *  (otherwise the network resumed, it did not begin); a `last` only when its day does. */
  from?: number;
  /** Index into `days` of the first day past the reportable ones (default: none). A brushed range
   *  ends before the record does, and the days after it still say whether a network really stopped
   *  (a `last` needs quiet days after it, wherever the range happens to end). */
  until?: number;
  /** Fill up to this many days with the range's extremes when the events fall short (default 0). */
  floor?: number;
}

/** The reading on day `i`: null when uncovered, else the stored value with an absent counter
 *  read as the measured 0 it is (see the header). */
function reading(row: readonly (number | null)[], covered: readonly (number | null)[], i: number): number | null {
  return covered[i] == null ? null : row[i] ?? 0;
}

/** A series' first and last day with activity (> 0 on a covered day), over the whole input
 *  (lead-in included), or null when it never reads above 0. */
function activity(row: readonly (number | null)[], input: NotableInput): { first: number; last: number } | null {
  let first = -1;
  let last = -1;
  for (let i = 0; i < input.days.length; i++) {
    if ((reading(row, input.covered, i) ?? 0) > 0) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return first < 0 ? null : { first, last };
}

/** |ln(value / level)|, with the value floored at 1 so a day that read 0 scores finitely (a count
 *  is an integer; ln(0) would rank every dropout above every real spike). */
const scoreOf = (value: number, level: number): number => Math.abs(Math.log(Math.max(value, 1) / level));

/** ONE EVENT PER RUN: consecutive days of the same kind for the same series (a three-day spike,
 *  a two-day dip, a pause read on two days) are one notable day, the strongest (ties keep the
 *  earlier). A day the sampler did not measure neither joins nor splits a run; a measured day of
 *  another kind, or of none, ends it. */
function runKeeper(out: NotableDay[]) {
  let held: NotableDay | null = null;
  const flush = () => {
    if (held) out.push(held);
    held = null;
  };
  return {
    /** A measured day: its notable reading, or null for an ordinary (or unjudgeable) one. */
    day(d: NotableDay | null): void {
      if (!d) return flush();
      if (held && held.kind === d.kind) {
        if (d.score > held.score) held = d;
        return;
      }
      flush();
      held = d;
    },
    flush,
  };
}

/** SERIES BREAKS: runs of at least QUIET_DAYS measured zeros inside a series' activity, as
 *  [first zero, last zero] index pairs. Unmeasured days inside a run neither end nor count. */
function breaksOf(row: readonly (number | null)[], covered: readonly (number | null)[], first: number, last: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  let end = -1;
  let zeros = 0;
  for (let i = first; i <= last + 1; i++) {
    const v = i <= last ? reading(row, covered, i) : 1; // a sentinel ends the last run
    if (v == null) continue;
    if (v === 0) {
      if (start < 0) start = i;
      end = i;
      zeros++;
      continue;
    }
    if (zeros >= QUIET_DAYS) out.push([start, end]);
    start = -1;
    zeros = 0;
  }
  return out;
}

function highLow(
  row: readonly (number | null)[],
  input: NotableInput,
  networkId: string | null,
  out: NotableDay[],
  measure?: NotableDay["measure"],
  min: { high: number; low: number } = { high: HIGH_FLOOR, low: 0 },
): void {
  const { days, covered } = input;
  const act = activity(row, input);
  if (!act) return;
  // A STOP AND A RESUME: a run of QUIET_DAYS or more measured zeros is a break in the series. Its
  // first day is judged (the stop is a low, once); the rest of the run is the same event and is
  // not judged again; and the days after it read their level from the resumed days ALONE, needing
  // their own LEVEL_MIN of them — never against a median the silence dragged down, which turned a
  // plain resume into a "high".
  const breaks = breaksOf(row, covered, act.first, act.last);
  const keep = runKeeper(out);
  // THE SERIES' OWN LEVEL: only days from its first activity on are its history (a network
  // waking up must not read its own quiet lead-in as a baseline), and nothing after its last
  // activity is a low — the quiet tail is the `last`'s business, not a run of lows.
  for (let i = Math.max(act.first, input.from ?? 0); i <= act.last; i++) {
    const value = reading(row, covered, i);
    if (value == null) continue;
    if (breaks.some(([a, b]) => i > a && i <= b)) continue; // inside a stop: its first day spoke
    let lo = act.first;
    for (const [, b] of breaks) if (b < i) lo = Math.max(lo, b + 1);
    const before: number[] = [];
    for (let j = i - 1; j >= lo && before.length < LEVEL_DAYS; j--) {
      const v = reading(row, covered, j);
      if (v != null) before.push(v);
    }
    const level = before.length >= LEVEL_MIN ? median(before) : 0;
    if (!(level > 0)) {
      keep.day(null); // no level, no ratio — a network waking up is a `first`, not a high
      continue;
    }
    const kind = value >= HIGH_RATIO * level && value >= min.high ? "high" : value <= LOW_RATIO * level && level >= min.low ? "low" : null;
    keep.day(kind ? { dayMs: days[i]!, kind, networkId, ...(measure ? { measure } : {}), value, level, score: scoreOf(value, level) } : null);
  }
  keep.flush();
}

function firstLast(row: readonly (number | null)[], input: NotableInput, networkId: string, out: NotableDay[]): void {
  const { days, covered } = input;
  const act = activity(row, input);
  if (!act) return;
  const from = input.from ?? 0;
  const coveredIn = (lo: number, hi: number): number => {
    let n = 0;
    for (let i = lo; i < hi; i++) if (covered[i] != null) n++;
    return n;
  };
  // Every covered day before the first activity read 0, by definition of "first". The count
  // spans the lead-in too; a first activity inside the lead-in is a network that was already
  // running when the window began, so it has no beginning to report.
  if (act.first >= from && coveredIn(0, act.first) >= QUIET_DAYS) {
    out.push({ dayMs: days[act.first]!, kind: "first", networkId, value: reading(row, covered, act.first)!, level: 0, score: Infinity });
  }
  if (act.last >= from && coveredIn(act.last + 1, days.length) >= QUIET_DAYS) {
    out.push({ dayMs: days[act.last]!, kind: "last", networkId, value: reading(row, covered, act.last)!, level: 0, score: Infinity });
  }
}

function pauses(gap: readonly (number | null)[], input: NotableInput, networkId: string | null, out: NotableDay[]): void {
  const { days, covered } = input;
  const had: number[] = [];
  for (let i = 0; i < days.length; i++) {
    const v = reading(gap, covered, i);
    if (v != null && v > 0) had.push(v);
  }
  if (!had.length) return;
  // DETECTED AGAINST THE LONG RUN, STATED AGAINST THE SPAN (user, 2026-11-03: "I don't think it's
  // usually 3.5 minutes, based on what data is that?"). The lead-in steadies the detection, but a
  // caption says "a typical day's longest gap", and over a span that sped up the lead-in's slower
  // days held that figure at 3.5 minutes while the span's own days ran 1.8. So the level a day is
  // reported against is the span's own median, once the span holds LEVEL_MIN days that had a gap.
  const level = median(had);
  const from = Math.max(0, input.from ?? 0);
  const inSpan: number[] = [];
  for (let i = from; i < days.length; i++) {
    const v = reading(gap, covered, i);
    if (v != null && v > 0) inSpan.push(v);
  }
  const stated = inSpan.length >= LEVEL_MIN ? median(inSpan) : level;
  const keep = runKeeper(out);
  for (let i = from; i < days.length; i++) {
    const value = reading(gap, covered, i);
    if (value == null) continue;
    keep.day(isPause(value, level) ? { dayMs: days[i]!, kind: "pause", networkId, value, level: stated, score: scoreOf(value, level) } : null);
  }
  keep.flush();
}

/** THE RANGE'S EXTREMES, in fill order (see `NOTABLE_FLOOR`): the busiest and quietest day of the
 *  subject's own series, then a network's longest gap or the hypergraph's broadest day. Read on
 *  covered days from `from` on, and for a network inside its own activity (the quiet tail after
 *  its last day is the `last`'s business). An extreme exists only when its day stands off the
 *  range's usual level, compared rounded as a caption states them (live 2026-10-31: "5 networks
 *  anchoring, usually 5"; one quiet day elsewhere made every ordinary day the broadest), so a range
 *  can stay short of the floor. Ties keep the earlier day; `level` is the range's median, so a
 *  caption can place the day against the range. */
export function rangeExtremes(input: NotableInput): NotableDay[] {
  const { days, covered, series, subject, ids } = input;
  const from = input.from ?? 0;
  const networkId = subject === "dag" ? null : subject;
  const own = subject === "dag" ? series["g.anchors"] : series[`m.${subject}.snaps`];
  if (!own) return [];
  let lo = from;
  let hi = (input.until ?? days.length) - 1;
  if (subject !== "dag") {
    const act = activity(own, input);
    if (!act) return [];
    lo = Math.max(lo, act.first);
    hi = Math.min(hi, act.last);
  }
  /** The covered readings of a row over [lo, hi] as (index, value) pairs. */
  const readings = (row: readonly (number | null)[], keep: (v: number) => boolean = () => true): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = lo; i <= hi; i++) {
      const v = reading(row, covered, i);
      if (v != null && keep(v)) out.push([i, v]);
    }
    return out;
  };
  const pick = (xs: [number, number][], kind: NotableDay["kind"], better: (a: number, b: number) => boolean): NotableDay | null => {
    if (xs.length < 2) return null;
    const values = xs.map(([, v]) => v);
    if (Math.min(...values) === Math.max(...values)) return null;
    let best = xs[0]!;
    for (const x of xs) if (better(x[1], best[1])) best = x;
    const level = median(values);
    if (Math.round(best[1]) === Math.round(level)) return null;
    return { dayMs: days[best[0]]!, kind, networkId, value: best[1], level, score: 0 };
  };
  const counts = readings(own);
  const out: (NotableDay | null)[] = [pick(counts, "peak", (a, b) => a > b), pick(counts, "trough", (a, b) => a < b)];
  if (subject === "dag") {
    // The day the most networks anchored: how many ids read above 0 on each covered day.
    const rows = ids.map((id) => series[`m.${id}.snaps`]).filter((r): r is (number | null)[] => !!r);
    const breadth: (number | null)[] = days.map((_, i) => (covered[i] == null ? null : rows.filter((r) => (r[i] ?? 0) > 0).length));
    out.push(pick(readings(breadth), "broadest", (a, b) => a > b));
  } else {
    const gap = series[`m.${subject}.gapMax`];
    if (gap) out.push(pick(readings(gap, (v) => v > 0), "longest", (a, b) => a > b)); // a 0 gap is no measurement (header)
  }
  return out.filter((d): d is NotableDay => d != null);
}

/** The notable days of a subject, best first, at most `cap`. Highest score wins; first/last
 *  (+Infinity) outrank any ratio; ties keep the earlier day, then the network id, then the kind,
 *  so the order never depends on how the engine sorts equal keys. Short of `floor`, the range's
 *  extremes follow (`rangeExtremes`), never on a day already taken. */
export function notableDays(input: NotableInput): NotableDay[] {
  const { days, series, subject, ids, cap } = input;
  const out: NotableDay[] = [];
  /** A further measure's days, one event a day: what is already told keeps its day. */
  const also = (row: readonly (number | null)[] | undefined, networkId: string | null, measure: NotableDay["measure"], min?: { high: number; low: number }) => {
    if (!row) return;
    const taken = new Set(out.map((d) => d.dayMs));
    const more: NotableDay[] = [];
    highLow(row, input, networkId, more, measure, min);
    out.push(...more.filter((d) => !taken.has(d.dayMs)));
  };
  // A day's CADENCE is its snapshot count inverted, so a spike or dip in it is already the count's;
  // a gap is the pause. Fees and data can move on their own. Blocks are not read: an ordinary day
  // swings them twofold, and live they took four of a span's five rows.
  const rest = (fee: string, kb: string, networkId: string | null) => {
    also(series[fee], networkId, "fees", { high: FEE_FLOOR, low: FEE_FLOOR });
    also(series[kb], networkId, "kb", { high: KB_FLOOR, low: KB_FLOOR });
  };
  if (subject === "dag") {
    // TWO MEASURES (user, 2026-11-01): the total anchored barely moves, so a year found one day of
    // it, and the network's own pace, a stall or a step up in global snapshots, went unread. A
    // stall is the pause first (user, 2026-11-02): that is the day's story, not its low count.
    const gap = series["g.gapMax"];
    if (gap) pauses(gap, input, null, out);
    also(series["g.anchors"], null, undefined);
    also(series["g.ticks"], null, "globals");
    rest("g.feeFloor", "g.kbFloor", null);
    for (const id of ids) {
      const snaps = series[`m.${id}.snaps`];
      if (snaps) firstLast(snaps, input, id, out);
    }
  } else {
    const snaps = series[`m.${subject}.snaps`];
    if (snaps) {
      highLow(snaps, input, subject, out);
      firstLast(snaps, input, subject, out);
    }
    const gap = series[`m.${subject}.gapMax`];
    if (gap) pauses(gap, input, subject, out);
    rest(`m.${subject}.fee`, `m.${subject}.kb`, subject);
  }
  // ONE DAY, ONE EVENT: a network's last day is usually thin and its first usually thick, and that
  // is the ending or the beginning, not a second story (live 2026-10-30: Aug 15 was listed twice).
  const events = new Set(out.filter((d) => d.kind === "first" || d.kind === "last").map((d) => `${d.networkId}:${d.dayMs}`));
  const kept = out.filter((d) => (d.kind !== "high" && d.kind !== "low") || !events.has(`${d.networkId}:${d.dayMs}`));
  kept.sort(
    (a, b) =>
      (a.score === b.score ? 0 : b.score > a.score ? 1 : -1) ||
      a.dayMs - b.dayMs ||
      (a.networkId ?? "").localeCompare(b.networkId ?? "") ||
      a.kind.localeCompare(b.kind),
  );
  const end = days[input.until ?? days.length] ?? Infinity;
  const picked = kept.filter((d) => d.dayMs < end).slice(0, Math.max(0, cap));
  const floor = Math.min(input.floor ?? 0, Math.max(0, cap));
  if (picked.length < floor) {
    const taken = new Set(picked.map((d) => d.dayMs));
    for (const fill of rangeExtremes(input)) {
      if (picked.length >= floor) break;
      if (taken.has(fill.dayMs)) continue;
      taken.add(fill.dayMs);
      picked.push(fill);
    }
  }
  return picked;
}
