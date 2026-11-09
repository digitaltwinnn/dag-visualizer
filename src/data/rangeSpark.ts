// THE RANGE CARD'S HAIRLINE (user, 2026-11-09: design H, "ensure both range and moment have the same
// visual style"). The Range card's Start and End rows became a drawing: the subject's own line over a
// FRAME around the range, the range in full ink and the frame around it faint, the range's two dates
// under its ends. A line of the range alone would repeat the chart plane in front, which already
// draws exactly the range; what the card adds is the CONTEXT — where the range sits in time and how
// it compares with what came before and after. It is drawn by the Moment's own hairline
// (`components/inspector/Hairline.tsx`, `sparkGeometry`), so the two cards are one species.
//
// Pure: which frame, which buckets are the range's, the two-part geometry on one scale and where the
// caption's marks sit. `components/inspector/RangeSpark.tsx` fetches the frame and draws. Honesty
// (rule 10) is the roster's: an unmeasured bucket is a break in the line, never a dip to zero, and
// a frame with nothing measured draws no line at all.
import { sparkGeometry, type SparkGeometry } from "./momentSpark";
import { ZOOMS, type ZoomId } from "./trendWindow";

const H = 3_600_000;
const D = 24 * H;

/** Each trailing window's length, the pill row's own vocabulary, shortest first. */
const FRAME_MS: readonly [ZoomId, number][] = [
  ["1h", H],
  ["24h", D],
  ["7d", 7 * D],
  ["30d", 30 * D],
  ["90d", 90 * D],
  ["1y", 365 * D],
];

/** The range covers at most this share of its frame, so there is context on either side to read. */
export const FRAME_CONTEXT = 3;

/** THE FRAME: the shortest window pill that reaches back to the range's start and is at least
 *  `FRAME_CONTEXT` times the range's length, else everything measured (`all`). A pill, so the
 *  frame is a window the page already knows how to fetch (and usually holds), and it always ends
 *  now — the right edge of the line is the present. */
export function rangeFrame(lit: { fromMs: number; toMs: number }, nowMs: number): ZoomId {
  const need = Math.max(FRAME_CONTEXT * (lit.toMs - lit.fromMs), nowMs - lit.fromMs);
  // WITH A BUCKET'S SLACK (user, 2026-11-09: the card read "Nov 10 … Oct 10 – Nov 9"): the trailing
  // 30 days start on a bucket edge, a little over 30 days back, and three of those missed the 90-day
  // window by minutes, so the frame jumped to a year. A window within a twentieth of the need holds.
  for (const [id, ms] of FRAME_MS) if (ms * 1.05 >= need) return id;
  return ZOOMS[ZOOMS.length - 1]!.id;
}

/** The first and last bucket of the frame that the range touches — a bucket is a span, so one the
 *  range only partly covers is the range's too (a 4-hour range inside a yearly frame is the one day
 *  holding it). Null when the frame's axis does not reach the range. */
export function litIndices(buckets: readonly number[], stepMs: number, lit: { fromMs: number; toMs: number }): [number, number] | null {
  let i0 = -1;
  let i1 = -1;
  buckets.forEach((b, i) => {
    if (b < lit.toMs && b + stepMs > lit.fromMs) {
      if (i0 < 0) i0 = i;
      i1 = i;
    }
  });
  return i0 < 0 ? null : [i0, i1];
}

/** The two parts of one line, on ONE scale (the whole frame's lowest on the floor, highest on the
 *  ceiling): the range in full ink, with its own busiest point, and the frame around it, which
 *  keeps the range's two end points so the faint line meets the full one without a gap. Null when
 *  the frame measured nothing. */
export function rangeGeometry(
  points: readonly (number | null)[],
  lit: [number, number],
  w: number,
  h: number,
): { lit: SparkGeometry; context: SparkGeometry } | null {
  const vals = points.filter((v): v is number => v != null);
  if (!vals.length) return null;
  const scale = { lo: Math.min(...vals), hi: Math.max(...vals) };
  const [i0, i1] = lit;
  const inside = points.map((v, i) => (i >= i0 && i <= i1 ? v : null));
  const around = points.map((v, i) => (i > i0 && i < i1 ? null : v));
  // The frame around the range is a faint line alone: the fill is the range's, so the range reads
  // as the one filled stretch (user, 2026-11-09: "only the line is brighter but not extra fill").
  return { lit: sparkGeometry(inside, w, h, scale), context: { ...sparkGeometry(around, w, h, scale), area: "", peak: null } };
}

/** Under this share of the line's width the range's two dates would collide, and are said once,
 *  joined, under the range's middle. */
export const JOIN_BELOW = 0.3;

/** Where the caption's marks sit, as fractions of the line's width (the same `i / (n − 1)` the
 *  geometry places a point at): the range's start and end under its two ends, or one joined label
 *  under its middle when the range is too narrow for two. */
export function captionMarks(n: number, lit: [number, number]): { kind: "ends"; at: [number, number] } | { kind: "joined"; at: number } {
  const x = (i: number) => (n > 1 ? i / (n - 1) : 0.5);
  const a = x(lit[0]);
  const b = x(lit[1]);
  return b - a >= JOIN_BELOW ? { kind: "ends", at: [a, b] } : { kind: "joined", at: (a + b) / 2 };
}
