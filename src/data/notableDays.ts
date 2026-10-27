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
//   · a gap of 0 seconds is NOT a measurement: `gapMax` is 0 on a day the chain sealed nothing, and
//     a median that counted those would sink to 0 and make every ordinary gap a "pause". The pause
//     level is the median of the covered days that HAD a widest gap.
//
// ⚠️ Nothing here reads the store, react or THREE; the colocated test is the specification (rule 4).

/** How many notable days each History pill keeps. */
export const NOTABLE_CAPS: Record<"7d" | "30d" | "1y" | "all", number> = { "7d": 3, "30d": 5, "1y": 8, all: 8 };

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

export interface NotableInput {
  /** UTC-midnight starts, oldest first. */
  days: number[];
  /** `g.ticks` per day; null = the day was not measured. */
  covered: (number | null)[];
  /** The daily rows: `g.anchors`, `m.<id>.snaps`, `m.<id>.gapMax`. */
  series: Record<string, (number | null)[]>;
  /** "dag" for the whole network, else a network id. */
  subject: "dag" | string;
  /** Every network id — the DAG subject reads each one's first and last day. */
  ids: readonly string[];
  cap: number;
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** The reading on day `i`: null when uncovered, else the stored value with an absent counter
 *  read as the measured 0 it is (see the header). */
function reading(row: readonly (number | null)[], covered: readonly (number | null)[], i: number): number | null {
  return covered[i] == null ? null : row[i] ?? 0;
}

/** |ln(value / level)|, with the value floored at 1 so a day that read 0 scores finitely (a count
 *  is an integer; ln(0) would rank every dropout above every real spike). */
const scoreOf = (value: number, level: number): number => Math.abs(Math.log(Math.max(value, 1) / level));

function highLow(
  row: readonly (number | null)[],
  input: NotableInput,
  networkId: string | null,
  out: NotableDay[],
): void {
  const { days, covered } = input;
  for (let i = 0; i < days.length; i++) {
    const value = reading(row, covered, i);
    if (value == null) continue;
    const before: number[] = [];
    for (let j = i - 1; j >= 0 && before.length < LEVEL_DAYS; j--) {
      const v = reading(row, covered, j);
      if (v != null) before.push(v);
    }
    if (before.length < LEVEL_MIN) continue;
    const level = median(before);
    if (!(level > 0)) continue; // no level, no ratio — a network waking up is a `first`, not a high
    const kind = value >= HIGH_RATIO * level && value >= HIGH_FLOOR ? "high" : value <= LOW_RATIO * level ? "low" : null;
    if (kind) out.push({ dayMs: days[i]!, kind, networkId, value, level, score: scoreOf(value, level) });
  }
}

function firstLast(row: readonly (number | null)[], input: NotableInput, networkId: string, out: NotableDay[]): void {
  const { days, covered } = input;
  let first = -1;
  let last = -1;
  for (let i = 0; i < days.length; i++) {
    if ((reading(row, covered, i) ?? 0) > 0) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return;
  const coveredIn = (from: number, to: number): number => {
    let n = 0;
    for (let i = from; i < to; i++) if (covered[i] != null) n++;
    return n;
  };
  // Every covered day before the first activity read 0, by definition of "first".
  if (coveredIn(0, first) >= QUIET_DAYS) {
    out.push({ dayMs: days[first]!, kind: "first", networkId, value: reading(row, covered, first)!, level: 0, score: Infinity });
  }
  if (coveredIn(last + 1, days.length) >= QUIET_DAYS) {
    out.push({ dayMs: days[last]!, kind: "last", networkId, value: reading(row, covered, last)!, level: 0, score: Infinity });
  }
}

function pauses(gap: readonly (number | null)[], input: NotableInput, networkId: string, out: NotableDay[]): void {
  const { days, covered } = input;
  const had: number[] = [];
  for (let i = 0; i < days.length; i++) {
    const v = reading(gap, covered, i);
    if (v != null && v > 0) had.push(v);
  }
  if (!had.length) return;
  const level = median(had);
  for (let i = 0; i < days.length; i++) {
    const value = reading(gap, covered, i);
    if (value != null && value >= PAUSE_FLOOR_S && value >= PAUSE_RATIO * level) {
      out.push({ dayMs: days[i]!, kind: "pause", networkId, value, level, score: scoreOf(value, level) });
    }
  }
}

/** The notable days of a subject, best first, at most `cap`. Highest score wins; first/last
 *  (+Infinity) outrank any ratio; ties keep the earlier day, then the network id, then the kind,
 *  so the order never depends on how the engine sorts equal keys. */
export function notableDays(input: NotableInput): NotableDay[] {
  const { series, subject, ids, cap } = input;
  const out: NotableDay[] = [];
  if (subject === "dag") {
    const total = series["g.anchors"];
    if (total) highLow(total, input, null, out);
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
  }
  out.sort(
    (a, b) =>
      (a.score === b.score ? 0 : b.score > a.score ? 1 : -1) ||
      a.dayMs - b.dayMs ||
      (a.networkId ?? "").localeCompare(b.networkId ?? "") ||
      a.kind.localeCompare(b.kind),
  );
  return out.slice(0, Math.max(0, cap));
}
