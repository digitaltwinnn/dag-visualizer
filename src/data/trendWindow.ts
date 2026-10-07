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
  // NO COVERAGE MARKER AT ALL is the same fact as an all-null one (test pass, 2026-10-03): the
  // store emits a series name only when a sample carried it, so a network that was never sampled
  // — TestNet during its outage — answers with six years of buckets and an empty `series`. This
  // used to return that payload untouched, and the History band drew an empty six-year axis
  // with a brush on it instead of saying "nothing measured yet".
  if (!ticks) return cut(data, data.buckets.length);
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

/** THE SHARED TIME CURSOR'S BUCKET (2026-09-18). `store.trendCursorMs` is ONE instant and every
 *  chart in the trend stack has to mark the bucket that CONTAINS it — the greatest bucket start
 *  ≤ `ms`. Returns that start, or null when the instant is outside the window's span: before
 *  `buckets[0]`, or at/after the exclusive end `last + stepMs`. A bucket is the half-open
 *  interval [start, start + stepMs), which is exactly how `cutRange` above already treats one.
 *
 *  ⚠️ THE NEAREST BUCKET IS NOT THE ANSWER. Snapping a cursor to whichever start is closest would
 *  put the mark on tomorrow for any instant past a bucket's midpoint — a chart saying "here" about
 *  a day that is not the day the reader asked for, which is rule 10 in the one place a reader
 *  could never catch it. Containment, or nothing.
 *
 *  `buckets` is ASCENDING and CONTIGUOUS by contract — the API assembles the axis in order and
 *  `stitchWindows` sorts, and nulls in the SERIES (never missing entries in `buckets`) are how a
 *  payload speaks a hole. So the search is a plain binary one and an unsorted array is not a case
 *  this has to answer. Colocated tests are the specification (rule 4). */
export function bucketAt(buckets: readonly number[], stepMs: number, ms: number): number | null {
  const n = buckets.length;
  if (n === 0 || ms < buckets[0] || ms >= buckets[n - 1] + stepMs) return null;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (buckets[mid] <= ms) lo = mid;
    else hi = mid - 1;
  }
  return buckets[lo];
}

/** WHERE A BUCKET SITS ON THE PLOT, as a fraction of the plot box (2026-09-19).
 *
 *  `TrendChart`'s XAxis is `type="number"` over `domain={["dataMin", "dataMax"]}`, so the axis is
 *  linear IN TIME between the oldest bucket (fraction 0) and the newest (fraction 1) — index
 *  spacing has nothing to do with it. That single number is everything the shared cursor's
 *  overlay needs: expressed as a fraction, its x is a pure CSS `calc()` over a percentage of the
 *  plot box, so it needs no measurement, no ResizeObserver, and it rides the 3D plane's own scale
 *  for free.
 *
 *  ⚠️ A BUCKET, NEVER AN INSTANT. `bucketAt` above is still the containment rule and the honesty
 *  rule with it — the cursor marks the bucket that CONTAINS the instant or nothing at all — and
 *  this answers only "where is that bucket on this chart's axis". Anything that is not one of the
 *  axis's own buckets has no place on it, so it gets `null` rather than an interpolated position;
 *  a chart handed a neighbour's axis draws nothing instead of a mark it cannot justify.
 *
 *  A single-bucket axis is the degenerate case recharts itself resolves to the left edge: dataMin
 *  IS dataMax, so there is no span to be a fraction of. Colocated tests are the specification. */
export function cursorFraction(buckets: readonly number[], bucket: number | null): number | null {
  const n = buckets.length;
  if (bucket == null || n === 0) return null;
  // Membership, by the same binary search the axis's own ordering earns us.
  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (buckets[mid] === bucket) {
      const span = buckets[n - 1] - buckets[0];
      return span > 0 ? (bucket - buckets[0]) / span : 0;
    }
    if (buckets[mid] < bucket) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

// ---- THE WINDOW/RANGE DATA PATH, AS A PLAN (2026-09-18) ------------------------------------
// ONE HOME for "which payloads does this window need, and how is each one cut" — the decision the
// Trends DOCUMENT carried inline as component state until 2026-09-18. The document and the 3D trend
// stack are TWO REGISTERS OF ONE RUNG (convention 12's MEASURED HISTORY), so a windowing rule
// living in one component is a rule the other register has to guess at; the two already share the
// chart primitive and the per-network series maths, and this is the third leg.
//
// PURE BY CONSTRUCTION: this decides WHAT to fetch and HOW to cut it, never fetches. The React
// side is `components/useTrendsSlice.ts`, which is nothing but the hook calls the plan names.

/** The API's own window vocabulary — `/api/trends?window=…`. */
export type TrendApiWindow = "24h" | "7d" | "30d" | "90d" | "1y" | "all";

// THE ZOOM (user, 2026-09-07: "can we zoom in?") — the window picker is the tiers made
// visible: 1H and 24H read the 5-minute buckets (48 h retention), 7D and 30D the hourly tier,
// 1Y and ALL the daily tier. Same charts, same honesty rules, finer buckets. 1Y and ALL split
// 2026-09-09 (user — the ranges stay consistent with the vitals rim, which is also where 1H
// came from the same day): 1Y is the trailing year, ALL is the store's whole depth (the `all`
// window), both leading-trimmed to where measuring began, so ALL says exactly as much as has
// been measured. 1H rides the 24h payload, sliced to the newest hour — a window is not always
// an API window of its own.
export const ZOOMS = [
  { id: "1h", label: "1H" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "All" },
] as const;
export type ZoomId = (typeof ZOOMS)[number]["id"];

const H = 3_600_000; // an hour — `HOUR_MS` below is declared after this table is evaluated
const WINDOW_MS: Record<Exclude<ZoomId, "all">, number> = {
  "1h": H,
  "24h": 24 * H,
  "7d": 7 * 24 * H,
  "30d": 30 * 24 * H,
  "1y": 365 * 24 * H,
};

/** THE SPAN THE HISTORY VIEW HAS ON SCREEN — what its RAW hands the anchor log (user, 2026-10-07:
 *  History's RAW is the records). A brushed range when one stands, else the window's trailing span
 *  ending now; ALL has no span to hand over (null — the log opens on its newest page). */
export function windowSpan(zoom: ZoomId, range: { fromMs: number; toMs: number } | null, nowMs: number): { fromMs: number; toMs: number } | null {
  if (range) return { fromMs: range.fromMs, toMs: range.toMs };
  return zoom === "all" ? null : { fromMs: nowMs - WINDOW_MS[zoom], toMs: nowMs };
}

/** A committed range — a drag on any chart (convention 12's zoom). `metaId` is whose chart the
 *  drag was drawn on (user, 2026-09-09: DOR committed, a range dragged on BIOFI's chart, "go to
 *  raw: no biofi in the filter" — a range must remember its network, and the document's records
 *  action prefers it over the committed filter). The stack's own range carries none: it is the
 *  whole stack's, not one plane's. Nothing here reads it — it travels with the range. */
export interface TrendRange {
  fromMs: number;
  toMs: number;
  metaId?: string | null;
}

/** How a fetched payload becomes the window on screen. */
export type TrendCut =
  | { kind: "none" }
  | { kind: "slice"; ms: number }
  | { kind: "range"; fromMs: number; toMs: number };

/** One payload to fetch and its cut: an API WINDOW or a TILE request, never both. */
export interface TrendFetchLeg {
  window: TrendApiWindow | null;
  tiles: { tier: "5m" | "1h"; fromMs: number; toMs: number } | null;
  cut: TrendCut;
}

export interface TrendFetchPlan {
  /** The charts' own payload. */
  main: TrendFetchLeg;
  /** The fleet gauges' HOURLY payload, when the main window is finer than they are written. */
  fleet: TrendFetchLeg;
  /** The daily tier behind the counter charts' head readout at the hourly zooms. */
  daily: TrendApiWindow | null;
  /** The tier a committed range resolved to; null with no range. */
  tier: "5m" | "1h" | "1d" | null;
}

const NO_LEG: TrendFetchLeg = { window: null, tiles: null, cut: { kind: "none" } };
const HOUR_MS = 3_600_000;

/** WHICH PAYLOADS a zoom (and an optional committed range) needs, and how each is cut.
 *
 *  A COMMITTED RANGE REPLACES THE ZOOM'S CUT ENTIRELY — it is the more specific statement about
 *  what is on screen, which is also why picking a window clears it.
 *
 *  AUTO-TIER (map-tile edition, 2026-09-10): a selected range picks the FINEST tier whose
 *  HISTORY FLOOR its start clears (`pickRangeTier` — since the keep-forever flip, retention no
 *  longer prunes, but the floors record where fine grain begins to exist) and fetches the few
 *  calendar-unit tiles it touches; daily ranges keep riding the one `all` payload.
 *
 *  THE FLEET RIDES THE HOURLY TIER at fine zooms (user, 2026-09-09: "1H/24H on Nodes says no
 *  data while 7D has it") — the gauges are written hourly+daily only, so the 5m payload honestly
 *  lacks them; instead of gating, the Nodes sections fetch the 7d hourly payload and slice it to
 *  the picked span (the rim's own recipe). Small, shared-cache fetch, made only while a fine
 *  window stands.
 *
 *  COUNTER READOUTS AT DAY SCALE (user, 2026-09-09: 7D's "latest full hour" answered too fine a
 *  question for a week-wide view): at the hourly zooms the counter charts' head readout rides the
 *  DAILY tier's own newest complete day — the store's exact sums, the same cached 90d payload the
 *  vitals rim already shares. No client re-summing. It answers the ZOOM, so a committed range
 *  leaves it standing.
 *
 *  A null `zoom` plans NOTHING — the conditional form for a consumer that is not currently
 *  showing charts (the 3D stack while the view is elsewhere), since a hook cannot be called
 *  conditionally and no other view should pay for this fetch. */
export function planTrendFetch(zoom: ZoomId | null, range: TrendRange | null): TrendFetchPlan {
  if (!zoom) return { main: NO_LEG, fleet: NO_LEG, daily: null, tier: null };
  // THE DAILY LEG rides wherever the charts' own grain is finer than a day (user, 2026-09-29:
  // "day should be the standard always" for the head readout) — every zoom but 1Y/ALL, and any
  // range whose tier is finer than daily. Where the chart IS daily its own last point is the day.
  const dailyZoom: TrendApiWindow | null = zoom === "1y" || zoom === "all" ? null : "90d";
  if (range) {
    const tier = pickRangeTier(range.fromMs, range.toMs);
    const daily: TrendApiWindow | null = tier === "1d" ? null : "90d";
    const cut: TrendCut = { kind: "range", fromMs: range.fromMs, toMs: range.toMs };
    return {
      main:
        tier === "1d"
          ? { window: "all", tiles: null, cut }
          : { window: null, tiles: { tier, fromMs: range.fromMs, toMs: range.toMs }, cut },
      // Only the 5m tier is finer than the gauges are written; an hourly range already IS their grain.
      fleet:
        tier === "5m"
          ? { window: null, tiles: { tier: "1h", fromMs: range.fromMs, toMs: range.toMs }, cut }
          : NO_LEG,
      daily,
      tier,
    };
  }
  return {
    main:
      zoom === "1h"
        ? { window: "24h", tiles: null, cut: { kind: "slice", ms: HOUR_MS } }
        : { window: zoom, tiles: null, cut: { kind: "none" } },
    fleet:
      zoom === "1h" || zoom === "24h"
        ? { window: "7d", tiles: null, cut: { kind: "slice", ms: zoom === "1h" ? HOUR_MS : 24 * HOUR_MS } }
        : NO_LEG,
    daily: dailyZoom,
    tier: null,
  };
}

/** The payloads a plan's legs fetched — `null`/absent means "not here (yet)", which is an
 *  instrument state, never an empty series. */
export interface TrendPayloads {
  main?: TrendsWindowData | null;
  fleet?: TrendsWindowData | null;
  daily?: TrendsWindowData | null;
}

/** The window on screen: the charts' own payload, the fleet's, and the daily readout's. */
export interface TrendSlice {
  /** The counter/continuity charts' window, cut and leading-trimmed; undefined = nothing yet. */
  p: TrendsWindowData | undefined;
  buckets: number[];
  stepMs: number;
  /** The GAUGE charts' window — the fleet's own hourly payload where the main one is too fine,
   *  else the main one itself. */
  pF: TrendsWindowData | undefined;
  fBuckets: number[];
  fStep: number;
  /** The gauges' hourly payload is still in flight: say so in words, draw nothing (rule 10). */
  fleetPending: boolean;
  /** The daily tier behind the head readout, with its still-filling newest day already trimmed. */
  daily: TrendsWindowData | undefined;
}

function applyCut(data: TrendsWindowData, cut: TrendCut): TrendsWindowData {
  if (cut.kind === "range") return cutRange(data, cut.fromMs, cut.toMs);
  if (cut.kind === "slice") return sliceWindow(data, cut.ms);
  return data;
}

/** Perform a plan's cuts over the payloads it asked for.
 *
 *  LEADING TRIM: the 1y window reaches further back than measuring does, and months of leading
 *  null days would draw as a long empty runway. The axis begins where history begins and the page
 *  widens by itself as the store grows; interior gaps still draw as gaps — only the unmeasured
 *  PREFIX goes.
 *
 *  ⚠️ THE FLEET'S TAKEOVER IS DECIDED BY THE ASSEMBLED WINDOW, not by the plan: the gauges are
 *  hourly instruments, so their own payload only stands in where the main window's buckets are
 *  FINER THAN AN HOUR. Reading it off the cut payload rather than the zoom is what keeps a range
 *  and a zoom answering the same question. */
export function assembleTrendSlice(plan: TrendFetchPlan, payloads: TrendPayloads): TrendSlice {
  const rawMain = payloads.main ?? undefined;
  const windowed = rawMain ? applyCut(rawMain, plan.main.cut) : undefined;
  const p = windowed ? leadingTrim(windowed) : undefined;
  const buckets = p?.buckets ?? [];
  const stepMs = p?.stepMs ?? 86_400_000;
  const rawFleet = payloads.fleet ?? undefined;
  const fine = stepMs < HOUR_MS;
  const fleet = fine && rawFleet ? applyCut(rawFleet, plan.fleet.cut) : undefined;
  return {
    p,
    buckets,
    stepMs,
    pF: fleet ?? p,
    fBuckets: fleet?.buckets ?? buckets,
    fStep: fleet?.stepMs ?? stepMs,
    fleetPending: fine && !fleet,
    daily: payloads.daily ? trimNewestPartial(payloads.daily) : undefined,
  };
}

/** THE HELD PLOT'S ZOOM (user, 2026-09-29: "can't we just reposition the lines, most chart libs
 *  have that option"). While a new window or range loads, the previous plot stands in (the
 *  slice's hold), and this answers where that plot has to sit so its OLD buckets land where the
 *  NEW axis will draw them: the target span's start as a fraction `f0` of the held axis, and the
 *  horizontal scale `s` that stretches the target span over the whole plot. Nothing is
 *  interpolated between grains — the old data moves as a picture and is then REPLACED, which is
 *  the only animation rule 10 allows here (a point-wise morph from hourly to daily buckets would
 *  draw values nobody measured). Null when there is nothing honest to move: a degenerate axis or
 *  target, or a target the held axis does not overlap at all. */
export function heldZoom(
  axisFromMs: number,
  axisToMs: number,
  target: { fromMs: number; toMs: number },
): { f0: number; s: number } | null {
  const span = axisToMs - axisFromMs;
  const want = target.toMs - target.fromMs;
  if (!(span > 0) || !(want > 0)) return null;
  if (target.toMs <= axisFromMs || target.fromMs >= axisToMs) return null;
  const f0 = (target.fromMs - axisFromMs) / span;
  const s = span / want;
  // A pill hop within one window (a refresh, the same span a bucket later) is not a zoom.
  if (Math.abs(s - 1) < 0.02 && Math.abs(f0) < 0.02) return null;
  return { f0, s };
}

const SPAN_WORDS: Record<ZoomId, string> = {
  "1h": "last hour",
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "1y": "last year",
  all: "all measured",
};

/** THE SPAN ON SCREEN, IN WORDS — what a span reading is OVER (design A, 2026-09-29): the window
 *  pill's own phrase, or a brushed range's dates (UTC, the axis's own zone; the range's end is
 *  exclusive, so the last day named is the one it reaches into). */
export function spanPhrase(zoom: ZoomId, range: { fromMs: number; toMs: number } | null): string {
  if (!range) return SPAN_WORDS[zoom];
  const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const a = day(range.fromMs);
  const b = day(range.toMs - 1);
  return a === b ? a : `${a} – ${b}`;
}
