// THE CALLOUT'S GLIDE (user, 2026-11-09: "when the anchor is shown, and then re-drawn to change to
// another dataset that has been selected can we avoid the re-draw and animate it to its new location?
// This happens in live mode for example, or when users swipes left / right on the subject's card").
// A label already on screen whose subject changes no longer replays its entrance (panel roll, leader
// draw, ring landing): the anchor MOVES from where it stood to the new subject over one glide, the
// leader carried with it, and only the panel's words roll. `CalloutSync` owns the per-frame write;
// this is the arithmetic. One clock with the HUD's odometer (`--tempo-roll`, 0.65 s), so a label
// sliding to its new subject and the card's title rolling to it read as one beat.

/** The glide's length, in seconds — the odometer's roll (`--tempo-roll`). */
export const CALLOUT_GLIDE_S = 0.65;

/** How far along the glide is, eased (in-out cubic: it leaves its subject and lands on the next
 *  without a jolt at either end), for `elapsed` seconds since it began; 1 once it has landed. */
export function glideMix(elapsed: number): number {
  const t = Math.min(1, Math.max(0, elapsed / CALLOUT_GLIDE_S));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
