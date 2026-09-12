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

/** An arbitrary [fromMs, toMs] cut — the /trends range selection (the observation ladder's
 *  zoom, 2026-09-09): keeps every bucket that INTERSECTS the range (a bucket is [start,
 *  start+step)), so a range drawn mid-bucket still shows the bucket it touches. An inverted
 *  or non-overlapping range cuts to empty rather than throwing — a drag is user input. */
export function cutRange(data: TrendsWindowData, fromMs: number, toMs: number): TrendsWindowData {
  const from = data.buckets.findIndex((t) => t + data.stepMs > fromMs);
  if (from < 0) return cut(data, data.buckets.length);
  let to = data.buckets.length;
  while (to > from && data.buckets[to - 1] > toMs) to--;
  return cut(data, from, to);
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

// ---- THE RANGE ZOOM'S TIER VOCABULARY (2026-09-10, the keep-forever flip) ------------------
// Since 2026-09-10 every tier keeps forever, but history has FLOORS — the dates before which
// a tier's fields simply never existed (retention pruned them in the finite era, and the
// backfills wrote daily only). The zoom must never pick a tier whose floor its range
// predates: the tiles would come back empty and the charts would claim an outage about an
// era that is measured perfectly well one tier up.
export const TIER_SINCE: Record<"5m" | "1h", number> = {
  // ONE floor for both fine tiers since the 2026-09-11 clean-sheet walk (rebuild-trends
  // --recompute-from=2025-07-01, then --extend-to): it rebuilds 5m AND hourly back to the
  // start of the store's fine-history era. While a walk is still filling, a fine range may
  // transiently read sparse — the walk's progressive flush closes it from the newest days
  // backward; the floors moved ahead of the walk by decision (user, 2026-09-11).
  "5m": Date.UTC(2025, 6, 1),
  "1h": Date.UTC(2025, 6, 1),
};

/** The finest tier that can honestly serve [fromMs, toMs]: fine enough to have the range's
 *  START (the floors above) and coarse enough that the tile fan-out stays small — a 5m tile
 *  is a day, an hourly tile a month, and daily rides the one `all` payload. */
export function pickRangeTier(fromMs: number, toMs: number): "5m" | "1h" | "1d" {
  const span = toMs - fromMs;
  if (span <= 2 * 86_400_000 && fromMs >= TIER_SINCE["5m"]) return "5m";
  if (span <= 62 * 86_400_000 && fromMs >= TIER_SINCE["1h"]) return "1h";
  return "1d";
}

/** The tile units [fromMs, toMs] touches — day units for the 5m tier ("2026-09-08"), month
 *  units for hourly ("2026-08"); the API serves one immutable-cacheable payload per unit
 *  (the map-tile pattern: user ranges are snowflakes, their units are shared). */
export function tilesFor(tier: "5m" | "1h", fromMs: number, toMs: number): string[] {
  const out: string[] = [];
  const d = new Date(fromMs);
  if (tier === "5m") {
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    for (; t < toMs && out.length < 64; t += 86_400_000) {
      const u = new Date(t);
      out.push(`${u.getUTCFullYear()}-${String(u.getUTCMonth() + 1).padStart(2, "0")}-${String(u.getUTCDate()).padStart(2, "0")}`);
    }
  } else {
    let y = d.getUTCFullYear();
    let m = d.getUTCMonth();
    while (Date.UTC(y, m, 1) < toMs && out.length < 64) {
      out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
      m += 1;
      if (m === 12) { m = 0; y += 1; }
    }
  }
  return out;
}

/** Stitch tile payloads into one window: buckets concatenate in time order and every series
 *  spans the whole seam, null-filled where a tile never carried it (a chain absent from one
 *  month's hashes is simply unmeasured there — the same nulls the store itself speaks). */
export function stitchWindows(tiles: TrendsWindowData[]): TrendsWindowData {
  const sorted = [...tiles].filter((t) => t.buckets.length > 0).sort((a, b) => a.buckets[0] - b.buckets[0]);
  if (sorted.length === 0) return { buckets: [], stepMs: 86_400_000, series: {}, now: Date.now() };
  const names = new Set<string>();
  for (const t of sorted) for (const n of Object.keys(t.series)) names.add(n);
  const buckets: number[] = [];
  const series: Record<string, (number | null)[]> = {};
  for (const n of names) series[n] = [];
  for (const t of sorted) {
    buckets.push(...t.buckets);
    for (const n of names) {
      const src = t.series[n];
      series[n].push(...(src ?? new Array<null>(t.buckets.length).fill(null)));
    }
  }
  return { buckets, stepMs: sorted[0].stepMs, series, now: Math.max(...sorted.map((t) => t.now)) };
}
