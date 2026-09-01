// CHAIN SEEK — finding a place in a metagraph's chain that is not addressed by its own ordinal.
//
// The raw log's Snapshot column needs no help: ordinals are sequential and gapless, so the page
// holding ordinal X is arithmetic (`pageOfOrdinal`) and the seek is one request deep. The other two
// searchable columns — ANCHORED INTO and AGE — are not addressed that way, and the honest question
// is how few requests can answer them.
//
// A blind binary search over 1.1M ordinals costs ~21 probes. But a metagraph's snapshot cadence is
// REGULAR, so ordinal is close to linear in time, and an interpolating search (`estimateOrdinal` —
// the false-position step) converges in a handful. This module is that math, kept pure and tested;
// the async walk that spends it lives with the caller, which owns the fetching.
//
// ⚠️ THE ESTIMATE IS A GUESS, AND THE REFINEMENT IS WHAT MAKES IT HONEST. Cadence changes over a
// chain's life — a network that sped up leaves the interpolation biased — so a caller must keep
// probing until the answer BRACKETS the target rather than trusting the first estimate. The bracket
// is the proof; the interpolation only makes it cheap.

/** The 1-based page holding `ordinal`, in a newest-first chain paged `size` at a time from `latest`.
 *  Pure arithmetic — this is the whole reason the Snapshot column's seek is one request. */
export function pageOfOrdinal(ordinal: number, latest: number, size: number): number {
  if (latest <= 0 || size <= 0) return 1;
  const clamped = Math.min(Math.max(1, ordinal), latest);
  return Math.floor((latest - clamped) / size) + 1;
}

/** One false-position step: where a target VALUE most likely sits between two known (ordinal, value)
 *  probes, assuming the value grows evenly with the ordinal.
 *
 *  Values are compared as numbers — callers pass epoch millis for a timestamp, or a global ordinal
 *  directly, since both grow monotonically along the chain. Returns an ordinal strictly inside
 *  (lo, hi) so a caller's bracket always narrows and the walk cannot stall. */
export function estimateOrdinal(
  target: number,
  lo: { ordinal: number; value: number },
  hi: { ordinal: number; value: number },
): number {
  if (hi.ordinal - lo.ordinal <= 1) return hi.ordinal;
  const span = hi.value - lo.value;
  // Degenerate span (a stalled chain, or two probes sharing a timestamp): fall back to bisection,
  // which is slower but always terminates.
  const frac = span > 0 ? (target - lo.value) / span : 0.5;
  const guess = lo.ordinal + Math.round((hi.ordinal - lo.ordinal) * frac);
  return Math.min(hi.ordinal - 1, Math.max(lo.ordinal + 1, guess));
}

/** Parse a `<input type="date">` value (YYYY-MM-DD) to the epoch millis of its UTC midnight.
 *  Returns null for anything else — the caller shows an unparsed range as no range at all rather
 *  than silently searching from the epoch. */
export function dayStartMs(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

/** …and the exclusive end of that same UTC day, for a range's upper bound. */
export function dayEndMs(day: string): number | null {
  const start = dayStartMs(day);
  return start == null ? null : start + 86_400_000;
}

/** Is `ts` (an ISO stamp from the explorer) inside `[fromMs, toMs)`? An absent bound is open.
 *  One home, because the seek and the row highlight must agree about what "in range" means. */
export function tsInRange(ts: string, fromMs: number | null, toMs: number | null): boolean {
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return false;
  if (fromMs != null && ms < fromMs) return false;
  if (toMs != null && ms >= toMs) return false;
  return true;
}

/** One row as the walk needs it: an ordinal and the stamp the explorer gave it. */
export interface SeekRow { ordinal: number; ts: string }

/**
 * Find the ordinal of the FIRST snapshot at or after `targetMs`, by interpolating over the chain.
 *
 * `loadPage(before)` returns the ~25 rows at `before, before−1, …` — the caller's own paging route,
 * injected so this stays testable without a network and so the caller keeps its cache.
 *
 * Returns the ROW, not just its ordinal, so a caller can check the stamp it actually landed on —
 * which is what lets the "anchored into" fallback tell "this network anchored here" apart from
 * "this is merely the next snapshot after that moment".
 *
 * ⚠️ IT RETURNS A BRACKET IT PROVED, OR NULL — never a guess dressed as an answer. The walk stops
 * when a probe's page actually CONTAINS the boundary (an at-or-after row whose older neighbour is
 * before the target), which is the only state in which the answer is known. If `maxProbes` runs out
 * it returns null and the caller says it could not land, rather than paging somewhere plausible and
 * letting the reader believe the chain has been searched. A target outside the chain's own span is
 * answered from the ends, which IS proof: before genesis is genesis, after the tip is the tip.
 */
export async function seekOrdinalByTime(
  targetMs: number,
  latest: number,
  loadPage: (before: number) => Promise<SeekRow[]>,
  maxProbes = 8,
): Promise<SeekRow | null> {
  if (latest < 1) return null;
  const ms = (r: SeekRow) => Date.parse(r.ts);

  // A page is a descending run, so its own ends bracket 24 ordinals for one request.
  const probe = async (before: number): Promise<SeekRow[]> => {
    const rows = (await loadPage(Math.min(Math.max(1, before), latest))).filter((r) => Number.isFinite(ms(r)));
    return rows.sort((a, b) => b.ordinal - a.ordinal);
  };

  const tip = await probe(latest);
  if (!tip.length) return null;
  if (ms(tip[tip.length - 1]) >= targetMs) {
    // The whole tip page is at or after the target — either the target predates this page, or it is
    // older than the chain. Fall through to the walk unless the chain is one page long.
    if (latest <= tip.length) return tip[tip.length - 1];
  } else {
    // The boundary is inside the tip page itself.
    const hit = [...tip].reverse().find((r) => ms(r) >= targetMs);
    if (hit) return hit;
    return tip[0]; // target is after the newest snapshot — the tip is the answer
  }

  const genesis = await probe(Math.min(25, latest));
  if (!genesis.length) return null;
  const oldest = genesis[genesis.length - 1];
  if (ms(oldest) >= targetMs) return oldest; // target predates the chain — genesis is the answer

  let lo = { ordinal: oldest.ordinal, value: ms(oldest) };           // strictly before the target
  let hi = { ordinal: tip[tip.length - 1].ordinal, value: ms(tip[tip.length - 1]) }; // at or after it

  // ⚠️ FALSE POSITION STAGNATES ONE-SIDED, and on a real chain it will. When cadence changes over a
  // network's life the time axis is curved, so every estimate lands on the same side of the target
  // and the bracket creeps in by a few thousand ordinals per probe instead of halving — measured on
  // a synthetic chain that sped up midway, 24 probes failed to cross 200k→150k at all. The guard is
  // the textbook one: after the same end is kept twice running, spend that probe on a BISECTION,
  // which cannot stagnate. Interpolation keeps the common case at a handful of requests; bisection
  // keeps the pathological case finite.
  let sameSide = 0;
  let lastKept: "lo" | "hi" | null = null;

  for (let i = 0; i < maxProbes && hi.ordinal - lo.ordinal > 1; i++) {
    const guess = sameSide >= 2
      ? Math.floor((lo.ordinal + hi.ordinal) / 2)
      : estimateOrdinal(targetMs, lo, hi);
    const page = await probe(guess);
    if (!page.length) return null;
    const newest = page[0], eldest = page[page.length - 1];
    if (ms(eldest) < targetMs && ms(newest) >= targetMs) {
      const hit = [...page].reverse().find((r) => ms(r) >= targetMs);
      if (hit) return hit;
    }
    const keep: "lo" | "hi" = ms(newest) < targetMs ? "lo" : "hi";
    if (keep === "lo") lo = { ordinal: newest.ordinal, value: ms(newest) };
    else hi = { ordinal: eldest.ordinal, value: ms(eldest) };
    sameSide = keep === lastKept ? sameSide + 1 : 0;
    lastKept = keep;
  }
  // The bracket closed on adjacent ordinals: `hi` is the proved answer, but the walk never held its
  // ROW, so one last page read supplies it rather than the caller getting an ordinal it cannot check.
  if (hi.ordinal - lo.ordinal <= 1) {
    const page = await probe(hi.ordinal);
    return page.find((r) => r.ordinal === hi.ordinal) ?? null;
  }
  return null;
}
