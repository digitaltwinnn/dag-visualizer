// The trends WINDOW transforms — pure cuts over an /api/trends payload, ONE home (2026-09-09,
// the branch review: these grew up inside components/useTrendsWindow.ts, the one directory
// rule 4's export coverage cannot see, while TrendsDoc carried a second, divergent copy of the
// leading trim — two homes for honesty rules that decide what the app asserts to users).
// Everything here is rule-10 machinery:
//   · a null bucket is NOT MEASURED (a sampling hole) and must survive as null;
//   · coverage = `g.ticks` measured, the store's one marker;
//   · a partial sum drawn whole charts as a collapse, so partial edge buckets are trimmed —
//     against the PAYLOAD's own clock, never the client's (a CDN-cached payload is honestly
//     assembled in the past; a client clock is just wrong).
// The colocated test is the specification (rule 4 — dataExportCoverage enforces the sibling).

export interface TrendsWindowData {
  /** Bucket START instants, epoch ms UTC, oldest → newest. */
  buckets: number[];
  stepMs: number;
  /** null = not measured (a gap), 0 = measured none. */
  series: Record<string, (number | null)[]>;
  /** The server's clock when the payload was assembled — the only honest "now" to trim
   *  against (the review's CDN finding: s-maxage serves payloads up to minutes old, so
   *  `Date.now()` misjudges which bucket is still filling). */
  now: number;
}

/** Rebuild a window from a bucket index range — the one slice everything else composes. */
function cut(data: TrendsWindowData, from: number, to?: number): TrendsWindowData {
  return {
    buckets: data.buckets.slice(from, to),
    stepMs: data.stepMs,
    series: Object.fromEntries(Object.entries(data.series).map(([k, v]) => [k, v.slice(from, to)])),
    now: data.now,
  };
}

/** Drop the still-filling newest bucket — a partial sum reads as a crash in any counter
 *  series. Judged against the payload's own `now`: the bucket is partial iff assembly time
 *  still fell inside it. Counter-only by nature — a gauge consumer (the fleet charts) must
 *  NOT apply this, which is why it is a named transform and not baked into the fetch. */
export function trimNewestPartial(data: TrendsWindowData): TrendsWindowData {
  const last = data.buckets.length - 1;
  if (last < 0 || data.now >= data.buckets[last] + data.stepMs) return data;
  return cut(data, 0, last);
}

/** The newest `ms` of a window — how the 7d fetch serves a 24h chart: one request, the
 *  store's own hourly sums, no client-side re-bucketing (which would have to invent a rule
 *  for hours that are part-null). Measured from the payload's newest bucket, not the wall
 *  clock, so a cached payload yields a consistent window instead of a short one. */
export function sliceWindow(data: TrendsWindowData, ms: number): TrendsWindowData {
  if (data.buckets.length === 0) return data;
  const end = data.buckets[data.buckets.length - 1] + data.stepMs;
  const from = data.buckets.findIndex((t) => t + data.stepMs > end - ms);
  if (from <= 0) return data;
  return cut(data, from);
}

/** Drop the leading UNMEASURED stretch — the /trends page's leading-trim rule: a 1y window
 *  opens months before measuring began, and a runway of dead buckets would chart as a long
 *  hole nobody dug. A window with NO measured bucket at all trims to EMPTY (the review's
 *  finding: findIndex's -1 must not read as "no leading gap" — an untrimmed all-null year
 *  let the band claim "since <a year ago>" over zero measurements). */
export function leadingTrim(data: TrendsWindowData): TrendsWindowData {
  const ticks = data.series["g.ticks"];
  if (!ticks) return data;
  const from = ticks.findIndex((v) => v != null);
  if (from === 0) return data;
  if (from < 0) return cut(data, data.buckets.length);
  return cut(data, from);
}

/** Calendar-month aggregation of a DAILY window — the 1Y bars. Counters SUM per month; a
 *  month with no measured day stays null. BOTH partial edge months are trimmed (the review:
 *  the forming current month was, the mid-month leading edge was not — the partial-edge rule
 *  applies to both ends): the last month goes when the payload's `now` still falls inside
 *  it, the first when the window opens past the 1st. `stepMs` is nominal (months vary);
 *  consumers key bars on the bucket instants. */
export function monthlySum(data: TrendsWindowData): TrendsWindowData {
  const starts: number[] = [];
  const idx: number[] = [];
  let cur = "";
  for (const ts of data.buckets) {
    const d = new Date(ts);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (key !== cur) {
      cur = key;
      starts.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    }
    idx.push(starts.length - 1);
  }
  const series: Record<string, (number | null)[]> = {};
  for (const [name, src] of Object.entries(data.series)) {
    const out: (number | null)[] = new Array(starts.length).fill(null);
    src.forEach((v, i) => {
      if (v == null) return;
      const m = idx[i];
      out[m] = (out[m] ?? 0) + v;
    });
    series[name] = out;
  }
  const now = new Date(data.now);
  let from = 0;
  let to = starts.length;
  if (to > 0 && starts[to - 1] === Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) to--;
  if (to > from && data.buckets.length > 0 && new Date(data.buckets[0]).getUTCDate() !== 1) from++;
  return {
    buckets: starts.slice(from, to),
    stepMs: 2_592_000_000,
    series: Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v.slice(from, to)])),
    now: data.now,
  };
}
