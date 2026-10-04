// Where the subject callout's panel stands relative to its anchor, and whether it may stand at
// all. Pure scalars — no DOM, no store, no THREE.
//
// The callout has two owners (`components/SceneCallout.tsx` renders + owns content,
// `CalloutSync` writes the per-frame transform and the flip/drop attributes), and the
// standoff numbers below used to live in BOTH of them: the component as `OFF_X`/`OFF_Y`, the
// Engine as the two reach thresholds derived from them, with a comment asking the next reader to
// "change all four together". They are one concern, so they get one home. `app/globals.css` still
// mirrors the standoff (`#callout .co-panel { left: 100px; bottom: 140px }`) because CSS can't
// import a TS const — the same accepted mirror `RailThread`'s SVG stroke literals are, and the
// only one left. Keep it in sync.
//
// ⚠️ THE FREE BAND IS NOT THE VIEWPORT. Below 1100px the rails become sheets that OVERLAY the
// canvas rather than sitting beside it (see `RailDock`), and the canvas stays viewport-sized
// underneath them — so a placement measured against the viewport can put the panel under an open
// sheet. It did: at 900px with both sheets open, a geo node callout rendered as a ~25px fragment
// of itself in the strip between them, while the Details sheet behind it showed the whole node
// card anyway. The caller passes the band the sheets leave, and everything here measures that.

/** Panel standoff from the anchor: up and to the right. The leader spans exactly this diagonal. */
export const CALLOUT_OFF_X = 100;
export const CALLOUT_OFF_Y = 140;
/** Where the leader INK actually ends, inset from the panel corner — the point the multi-leader
 *  legs must fan from so leader and legs meet exactly. Shared by SceneCallout's primary leader
 *  (y2) and CalloutSync's multi-leader (the fan corner); it was retuned once already (8 → 2) with
 *  the two literals held in sync only by memory (review, 2026-08-31). */
export const CALLOUT_LEG_INSET = 2;

/**
 * The panel's full reach from the anchor on each axis — the standoff plus the widest / tallest
 * panel the callout renders. These are what a placement is tested against, so they move with the
 * standoff above and never on their own.
 */
export const CALLOUT_REACH_X = 360;
export const CALLOUT_REACH_Y = 220;

export type CalloutPlacement = {
  /** False when the callout must not render at all — the band can't hold it honestly. */
  show: boolean;
  /** Panel goes up-LEFT instead of up-right. */
  flip: boolean;
  /** Panel drops BELOW the anchor instead of above it. */
  drop: boolean;
};

const HIDDEN: CalloutPlacement = { show: false, flip: false, drop: false };

/**
 * Resolve where the panel stands for an anchor projected to `(x, y)` in viewport px.
 *
 * `bandL`/`bandR` are the free canvas band — the viewport edges on desktop, pulled in by whatever
 * an open sheet covers below 1100px. `top` is where the free band begins: the canvas's own top
 * edge, or the command bar's bottom where the canvas runs behind it.
 *
 * The rules, in the order they matter:
 *
 * 1. **An anchor outside the band gets nothing.** It is under a sheet, so the subject it points
 *    at can't be seen and the leader would run beneath the panel that covers it.
 * 2. **A panel that fits on neither side gets nothing.** This is the phone rule's reasoning
 *    (user, 2026-08-16 — "a callout that cannot say WHERE is not a smaller callout, it is a wrong
 *    one") reaching the width the sheets create, rather than only the width the device does.
 *    Nothing is lost that isn't already on screen: on tablet the sheet doing the covering is the
 *    Details sheet, which carries the box itself.
 * 3. **Otherwise flip toward the side that fits.** This sharpens the previous "flip only toward
 *    the roomier side" heuristic into the test it was a proxy for, and is a no-op wherever that
 *    rule was already right: `!fitR` is exactly its near-the-right-edge clause, and among the
 *    placements that survive rule 2, failing right implies fitting left.
 */
export function calloutPlacement(
  x: number,
  y: number,
  bandL: number,
  bandR: number,
  top: number,
): CalloutPlacement {
  if (!(bandR > bandL)) return HIDDEN; // no band at all (both sheets meeting, or worse)
  if (x < bandL || x > bandR) return HIDDEN;

  const fitR = x + CALLOUT_REACH_X <= bandR;
  const fitL = x - CALLOUT_REACH_X >= bandL;
  if (!fitR && !fitL) return HIDDEN;

  // The vertical band is unaffected by the sheets — they are full-height, so they take width and
  // never height. Near the top the panel drops below the anchor instead.
  return { show: true, flip: !fitR, drop: y < top + CALLOUT_REACH_Y };
}

// ---- the hanging label ---------------------------------------------------------------------
//
// Snapshots stands TWO callouts (2026-10-03): the metagraph snapshot's on its tile and the global
// snapshot's on its bar. The second one stood up-right like every callout, which from the floor
// is the middle of the chamber — its panel covered the ribbons and the other networks' lanes,
// the part of the scene the label is about. It HANGS instead (user: "ok A, but make the angle of
// the lines the same"): below-left of its anchor, into the empty strip between the floor and the
// bottom band, so the pair reads the way the chamber is built — the snapshot above, the global
// snapshot it fell into below.
//
// ⚠️ THE SAME DIAGONAL, MIRRORED THROUGH THE ANCHOR. Down-left is the up-right standoff turned
// half a circle, so the two leaders are parallel; only the LENGTH differs, by one factor on both
// axes, because the strip under the floor is short. Scaling one axis alone would change the angle.

/** The hanging standoff, as a share of the standing one. `app/globals.css` mirrors it (`--co-k`
 *  under `[data-hang]`) — change both or neither. */
export const CALLOUT_HANG_K = 0.55;
/** The tallest panel the hanging label renders (eyebrow, title row, rule, lead) — 88px measured.
 *  The air under it is the caller's (`bottom` already stops short of the band). */
const HANG_PANEL_H = 88;
/** The hanging panel's full reach from its anchor: leftward and downward. */
export const CALLOUT_HANG_REACH_X = Math.round(CALLOUT_OFF_X * CALLOUT_HANG_K) + (CALLOUT_REACH_X - CALLOUT_OFF_X);
export const CALLOUT_HANG_REACH_Y = Math.round(CALLOUT_OFF_Y * CALLOUT_HANG_K) + HANG_PANEL_H;

/**
 * May a label hang below-left of an anchor at `(x, y)`? `bottom` is where the free canvas ends —
 * the bottom band's top edge, or the viewport's where there is no band. False sends the caller
 * back to `calloutPlacement`, which stands the label where it always stood: a window too short
 * for the strip gets the old label, never a clipped new one.
 */
export function calloutHangs(x: number, y: number, bandL: number, bandR: number, bottom: number): boolean {
  if (!(bandR > bandL) || x < bandL || x > bandR) return false;
  return x - CALLOUT_HANG_REACH_X >= bandL && y + CALLOUT_HANG_REACH_Y <= bottom;
}

// ---- the phone label ------------------------------------------------------------------------
//
// A PHONE STANDS THE LABEL STRAIGHT ABOVE ITS SUBJECT (user, 2026-10-04 — reversing 2026-08-18's
// "drop the callout when in mobile mode": "it should fit, can also shorten the line … add an x").
// The diagonal standoff cannot fit: a ~200px panel beside its anchor leaves the label only near the
// screen's edges. Above the anchor it always fits horizontally — centred, nudged inward at an edge —
// and the leader runs vertically into the subject, so it still says WHERE, which is what the old
// ruling was protecting. Same factor family as the hanging label: one number shortens the leader.

/** The phone leader's length, as a share of the standing standoff's height. `app/globals.css`
 *  mirrors it (`--co-k` under `[data-phone]`) — change both or neither. */
export const CALLOUT_PHONE_K = 0.4;
const PHONE_AIR = 8;

/**
 * Where the phone label stands for an anchor at `(x, y)`: `left` is the panel's left edge relative
 * to the anchor (centred, then clamped into the band with `PHONE_AIR` to spare); `drop` puts it
 * below. `top`/`bottom` bound the free canvas — the command bar and the open sheet's top edge. The
 * panel's measured size comes in, because its content (and so its width) varies by subject.
 */
export function calloutPhonePlacement(
  x: number,
  y: number,
  bandL: number,
  bandR: number,
  top: number,
  bottom: number,
  panelW: number,
  panelH: number,
): { show: boolean; drop: boolean; left: number } {
  const hidden = { show: false, drop: false, left: 0 };
  if (!(bandR > bandL) || x < bandL || x > bandR || y < top || y > bottom) return hidden;
  const reach = Math.round(CALLOUT_OFF_Y * CALLOUT_PHONE_K) + panelH;
  const above = y - reach >= top;
  const below = y + reach <= bottom;
  if (!above && !below) return hidden;
  const lo = bandL + PHONE_AIR - x;
  const hi = bandR - PHONE_AIR - panelW - x;
  const left = Math.max(lo, Math.min(hi, -panelW / 2));
  return { show: true, drop: !above, left };
}
