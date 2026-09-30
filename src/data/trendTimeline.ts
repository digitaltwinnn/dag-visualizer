import { pickRangeTier, type ZoomId } from "@/src/data/trendWindow";

// THE BAND TIMELINE'S GEOMETRY AND GESTURE MATHS (2026-09-18) — pure, so the component above it
// (`components/TrendTimeline.tsx`) can stay a thin shell.
//
// WHY A MODULE AT ALL. The timeline is the one INTERACTIVE tenant of a band that is otherwise
// read-only, and its whole behaviour is a handful of decisions a pointer makes: is this press a
// click or the start of a drag, what is under the finger, where does the span land, how far does
// an arrow key move. Every one of those is arithmetic over a track's width and a span of
// milliseconds — and none of it can be exercised in this repo's test environment from the
// component, which is `environment: "node"` with no DOM and no testing-library. Left inside the
// handlers they would be verifiable only by hand, once, by whoever wrote them.
//
// THE TRACK IS AN OVERVIEW OF THE WHOLE MEASURED SPAN, so `fromMs`/`toMs` here are the FIRST
// bucket's start and the LAST bucket's exclusive end — the same half-open convention
// `bucketAt`/`cutRange` already use. Everything clamps into that span rather than throwing: a
// pointer capture keeps reporting coordinates well past the element's edges, and that is input,
// not an error.

/** The track's pixel width and the span it draws, left→right. `x` everywhere below is measured
 *  from the track's own left edge, never from the viewport. */
export interface TrackGeom {
  width: number;
  fromMs: number;
  /** EXCLUSIVE — the last bucket's start + its step. */
  toMs: number;
}

/** A span on the track. Structurally the store's `trendRange`, which is what a brush commits. */
export type Span = { fromMs: number; toMs: number };

/** How far a pointer must travel before a press stops being a click. 4px is the usual slop
 *  budget for a finger that meant to stand still; below it a touch "click" would brush a
 *  one-pixel range nobody asked for. */
export const DRAG_PX = 4;
/** The grab zone on each edge of a standing brush. */
export const EDGE_PX = 6;
/** The grab zone around the cursor's handle. */
export const HANDLE_PX = 7;
/** The narrowest brush, in buckets of the finest tier its start can carry — see `minSpanMs`. */
export const MIN_BUCKETS = 12;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** The instant under a track x. Clamped — a captured pointer reports past both edges. */
export function msAtX(x: number, g: TrackGeom): number {
  if (g.width <= 0) return g.fromMs;
  return clamp(g.fromMs + (x / g.width) * (g.toMs - g.fromMs), g.fromMs, g.toMs);
}

/** Where an instant sits on the track. Clamped, so an out-of-span mark lands ON the edge rather
 *  than drawing outside the SVG's own box. */
export function xAtMs(ms: number, g: TrackGeom): number {
  const span = g.toMs - g.fromMs;
  if (span <= 0) return 0;
  return clamp(((ms - g.fromMs) / span) * g.width, 0, g.width);
}

/** Has this press become a drag? Direction is immaterial: a leftward brush is a brush. */
export function isDrag(dx: number): boolean {
  return Math.abs(dx) >= DRAG_PX;
}

/** What a press landed on — and therefore what a DRAG from it means. A release under the drag
 *  threshold always sets the cursor instead, whatever the zone (see the component). */
export type PressZone =
  | { kind: "cursor" }
  | { kind: "edge"; edge: "from" | "to" }
  | { kind: "inside" }
  | { kind: "empty" };

/** ⚠️ HIT ORDER FOLLOWS PAINT ORDER, and `drawn` is THE SPAN ON SCREEN — not the committed range.
 *
 *  The second half of that is the whole rule, and it was got wrong first (review, 2026-09-18): the
 *  track paints `trendRange` when one stands and otherwise the span the WINDOW PILL implies, so
 *  feeding the committed range alone left the visible rectangle ungrabbable in five of the six
 *  window states — edges that would not resize, an interior that would not pan, over a mark the
 *  reader can plainly see. What is drawn is what can be grabbed; panning or resizing a
 *  window-implied span simply COMMITS it as a range, which is what the gesture means.
 *
 *  The cursor's handle is drawn ON TOP of the brush, so it is tested FIRST or the pointer would
 *  lie about what it is over — you would press a visible grab handle and resize the rectangle
 *  behind it. Then the brush's edges (the narrower target), then its interior, then bare track: a
 *  press OUTSIDE the drawn span is still how a fresh brush starts. A cursor outside the track's
 *  own span is not drawn at all, so there is nothing there to grab. */
export function classifyPress(
  x: number,
  g: TrackGeom,
  drawn: Span | null,
  cursorMs: number | null,
): PressZone {
  if (cursorMs != null && cursorMs >= g.fromMs && cursorMs < g.toMs) {
    if (Math.abs(x - xAtMs(cursorMs, g)) <= HANDLE_PX) return { kind: "cursor" };
  }
  if (drawn) {
    const a = xAtMs(drawn.fromMs, g);
    const b = xAtMs(drawn.toMs, g);
    if (Math.abs(x - a) <= EDGE_PX) return { kind: "edge", edge: "from" };
    if (Math.abs(x - b) <= EDGE_PX) return { kind: "edge", edge: "to" };
    if (x > a && x < b) return { kind: "inside" };
  }
  return { kind: "empty" };
}

const TIER_MS: Record<"5m" | "1h" | "1d", number> = {
  "5m": 5 * 60_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

/** THE NARROWEST BRUSH: `MIN_BUCKETS` of the finest tier the range's START can honestly carry.
 *
 *  The floor is not a taste question — it falls out of `pickRangeTier`, which is what the fetch
 *  planner will actually resolve the committed range with. A brush of five minutes over 2024
 *  would resolve to the DAILY tier (the fine tiers have history floors) and every plane would
 *  cut to zero buckets and say "no measurements in this window" about an era that is measured
 *  perfectly well one tier up — an outage claim about the reader's gesture. Twelve buckets is
 *  the smallest span that still draws as a shape rather than as a single point. */
export function minSpanMs(fromMs: number): number {
  // A zero-width probe: `pickRangeTier` answers with the finest tier this START clears.
  return MIN_BUCKETS * TIER_MS[pickRangeTier(fromMs, fromMs)];
}

/** A span from the FIXED end of a gesture to its MOVING end — the one function behind all three
 *  span gestures, because they differ only in which end is pinned: a fresh brush anchors on the
 *  press, a `from`-edge resize anchors on `to`, a `to`-edge resize anchors on `from`.
 *
 *  Too short a drag grows AWAY FROM THE ANCHOR, so the end the finger pressed stays where it was
 *  put; only when the track's own edge is in the way does it grow back through the anchor. A
 *  track shorter than the minimum yields the whole track — there is nothing more honest to give. */
export function rangeFrom(anchorMs: number, movingMs: number, g: TrackGeom): Span {
  const a = clamp(anchorMs, g.fromMs, g.toMs);
  const m = clamp(movingMs, g.fromMs, g.toMs);
  let from = Math.min(a, m);
  let to = Math.max(a, m);
  const need = minSpanMs(from);
  if (to - from >= need) return { fromMs: from, toMs: to };
  if (m >= a) {
    from = a;
    to = a + need;
    if (to > g.toMs) {
      to = g.toMs;
      from = Math.max(g.fromMs, to - need);
    }
  } else {
    to = a;
    from = a - need;
    if (from < g.fromMs) {
      from = g.fromMs;
      to = Math.min(g.toMs, from + need);
    }
  }
  return { fromMs: from, toMs: to };
}

/** Slide a span KEEPING ITS WIDTH — a pan is not a resize, so it stops against each end of the
 *  track rather than compressing there. A span wider than the track parks at its start. */
export function panRange(range: Span, deltaMs: number, g: TrackGeom): Span {
  const span = range.toMs - range.fromMs;
  const from = clamp(range.fromMs + deltaMs, g.fromMs, Math.max(g.fromMs, g.toMs - span));
  return { fromMs: from, toMs: from + span };
}

/** Keep the cursor INSIDE the span. `toMs` is exclusive — an instant exactly there belongs to no
 *  bucket (`bucketAt` returns null), so every plane would silently stop marking it. */
export function clampCursor(ms: number, g: TrackGeom): number {
  return clamp(ms, g.fromMs, Math.max(g.fromMs, g.toMs - 1));
}

/** ⚠️ A SCRUB WRITES ONCE PER BUCKET, NOT ONCE PER POINTERMOVE (review, 2026-09-18).
 *
 *  `trendCursorMs` is a store channel the whole stack subscribes to, so every write re-plans the
 *  fetch, re-ranks the roster, re-derives each network's series and re-renders five recharts
 *  plots. A drag fires that at pointer rate — and buys NOTHING, because each plane marks the
 *  BUCKET CONTAINING the instant (`bucketAt`): two instants inside one bucket paint the identical
 *  frame. So the write is quantised to the grain the planes can actually resolve, and the visible
 *  result is unchanged.
 *
 *  The handle follows the same quantisation rather than gliding on local state — the handle IS
 *  the cursor, and a handle resting between two buckets while every plane marks one of them would
 *  be the instrument disagreeing with itself. At the daily tier one bucket is ~2.6px of a
 *  1150px track; at the finer tiers it is sub-pixel.
 *
 *  Buckets are epoch-aligned multiples of their step (5m, 1h, 1d all divide a UTC day), which is
 *  what makes the index a plain floor. A null `prev` is always a change: nothing has been written
 *  yet. */
export function sameBucket(prevMs: number | null, ms: number, stepMs: number): boolean {
  if (prevMs == null || stepMs <= 0) return false;
  return Math.floor(prevMs / stepMs) === Math.floor(ms / stepMs);
}

/** One keyboard step: `steps` buckets of the STACK's current tier, so ← and → move by exactly
 *  what the charts above can resolve. With nothing picked yet the first press lands on the span's
 *  newest instant rather than stepping from an invented zero. */
export function stepCursor(ms: number | null, stepMs: number, steps: number, g: TrackGeom): number {
  if (ms == null) return clampCursor(g.toMs, g);
  return clampCursor(ms + steps * stepMs, g);
}

/** How far back a window pill reaches. `all` is null: it is the whole track, and the brush's
 *  ABSENCE is what says so — a rectangle around everything states nothing. */
export const WINDOW_MS: Record<ZoomId, number | null> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "1y": 365 * 86_400_000,
  all: null,
};

/** The span a window pill implies on this track — measured back from the newest instant the
 *  overview has, never from the client's clock (the payload's own axis is the honest "now"). */
export function windowSpan(zoom: ZoomId, g: TrackGeom): Span | null {
  const ms = WINDOW_MS[zoom];
  if (ms == null) return null;
  return { fromMs: Math.max(g.fromMs, g.toMs - ms), toMs: g.toMs };
}

/** THE SPAN ON SCREEN — ONE expression, two consumers (2026-09-18, the review's F2). The track
 *  PAINTS this and `classifyPress` is HIT-TESTED against it, and the whole defect it answers was
 *  those two being computed separately: the paint fell back to the window pill's implied span
 *  while the hit test saw only the committed range, so five of the six window states drew a
 *  rectangle nobody could grab. Deriving both from one function is what makes them unable to
 *  disagree — the component may not re-derive it.
 *
 *  Precedence: the live drag's preview, then a committed range, then the window's implied span.
 *  `all` implies none, and that absence is the statement that the whole track is showing. */
export function drawnSpan(
  preview: Span | null,
  range: Span | null,
  zoom: ZoomId,
  g: TrackGeom,
): Span | null {
  return preview ?? range ?? windowSpan(zoom, g);
}

/** One point of the overview's polyline. */
export interface TrackPoint {
  x: number;
  y: number;
}

/** The overview's ink, as RUNS OF CONTIGUOUS MEASURED POINTS. A null bucket is a GAP (rule 10),
 *  so the line BREAKS there rather than stepping across it — and an isolated measured point
 *  comes back as a run of one, which the caller draws as a dot (TrendChart's own device: under a
 *  broken line an isolated point paints nothing at all).
 *
 *  `y` is in SVG coordinates — 0 at the plot's top — and a series with no measured peak sits on
 *  the floor rather than dividing by zero. */
export function trackRuns(
  points: readonly (number | null)[],
  buckets: readonly number[],
  stepMs: number,
  g: TrackGeom,
  maxV: number,
  plotH: number,
): TrackPoint[][] {
  const runs: TrackPoint[][] = [];
  let run: TrackPoint[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const v = points[i];
    if (v == null) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    // The bucket's own MIDPOINT: a bucket is a span, and pinning its ink to the left edge would
    // draw the newest bucket short of the track's right end by a whole bucket.
    run.push({
      x: xAtMs(buckets[i] + stepMs / 2, g),
      y: maxV > 0 ? plotH - (v / maxV) * plotH : plotH,
    });
  }
  if (run.length) runs.push(run);
  return runs;
}

/** The month starts inside a window, THINNED to the pixels available: a label per month over six
 *  years is a smear, and a smear says less than four legible marks. Keeps the earliest of each
 *  surviving month so the marks stay at real calendar boundaries. */
export function axisTicks(
  buckets: readonly number[],
  stepMs: number,
  g: TrackGeom,
  minGapPx: number,
): number[] {
  const out: number[] = [];
  let lastX = -Infinity;
  for (let i = 1; i < buckets.length; i++) {
    const d = new Date(buckets[i]);
    const prev = new Date(buckets[i - 1]);
    if (d.getUTCMonth() === prev.getUTCMonth() && d.getUTCFullYear() === prev.getUTCFullYear()) continue;
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    // A sub-daily overview would put every bucket inside one month; the guard costs nothing.
    const at = stepMs <= 86_400_000 ? start : buckets[i];
    const x = xAtMs(at, g);
    if (x - lastX < minGapPx) continue;
    lastX = x;
    out.push(at);
  }
  return out;
}

/** A month mark's label. January is named by its YEAR — over a multi-year overview a bare
 *  "Jan Apr Jul Oct Jan…" tells a reader nothing about which year they are looking at. */
export function tickLabel(ms: number): string {
  const d = new Date(ms);
  if (d.getUTCMonth() === 0) return String(d.getUTCFullYear());
  return d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
}

/** The cursor's readout — the document's `stampRange` rule, one instant at a time: the DATE at
 *  the daily tier (an hour the charts cannot resolve would be an invented precision), the date
 *  plus the clock, stated as UTC, once the stack's buckets are finer than a day. The YEAR rides
 *  the daily form because the overview spans years, and "Sep 18" alone names five of them. */
export function stampInstant(ms: number, stepMs: number): string {
  const d = new Date(ms);
  if (stepMs >= 86_400_000) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  }
  return (
    d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
}

/** WHAT THE POINTER SAYS OVER EACH ZONE (user, 2026-09-29: "when I drag the selector it has a +
 *  pointer, should be a hand?"). The crosshair belongs to EMPTY track, where a click marks a
 *  moment and a drag draws a new span. The span itself is a thing you carry, so it is a hand
 *  (closed while it moves); an edge and the moment's handle resize along one axis. The cursor
 *  answers the same `classifyPress` the gesture does, so what the pointer promises is what the
 *  press will do. */
export function zoneCursor(zone: PressZone, pressed: boolean): string {
  switch (zone.kind) {
    case "inside":
      return pressed ? "grabbing" : "grab";
    case "edge":
    case "cursor":
      return "ew-resize";
    case "empty":
      return "crosshair";
  }
}
