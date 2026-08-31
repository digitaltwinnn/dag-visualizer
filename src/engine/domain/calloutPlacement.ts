// Where the subject callout's panel stands relative to its anchor, and whether it may stand at
// all. Pure scalars — no DOM, no store, no THREE.
//
// The callout has two owners (`components/SceneCallout.tsx` renders + owns content,
// `Engine._syncCallout` writes the per-frame transform and the flip/drop attributes), and the
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
 *  (y2) and Engine._syncCalloutMulti (the fan corner); it was retuned once already (8 → 2) with
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
 * an open sheet covers below 1100px. `top` is the canvas's own top edge.
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
