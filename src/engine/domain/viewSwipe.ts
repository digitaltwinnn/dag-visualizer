// src/engine/domain/viewSwipe.ts
// Swipe the PHONE command bar to step between views (user, 2026-10-08, design A1 — `docs/
// superpowers/design/2026-10-08-mobile-tuning/a-header.html`): "I want to swipe the header to
// switch views". Pure recognition and stepping; the bar owns the listeners.
//
// The bar is a strip of buttons, so a swipe and a tap share every starting point. Three choices
// keep them apart: a swipe is HORIZONTAL (|dx| clearly beats |dy| — a vertical drag is never the
// bar's), it needs real travel (a thumb's tap wanders a few px), and once a gesture counted as a
// swipe the click it would otherwise end in is the caller's to eat, so a swipe that began on the
// filter face never also opens the filter.
//
// Stepping CLAMPS at the ends rather than wrapping: the pips under the name show a row of four,
// and a row has ends — wrapping from History back to Hypergraph would read as the swipe failing.

/** Horizontal travel (CSS px) a gesture needs before it counts as a swipe. */
export const SWIPE_MIN_PX = 40;

/** -1 = finger moved LEFT (show the NEXT view), +1 = moved RIGHT (the previous), 0 = not a swipe. */
export function swipeDirection(dx: number, dy: number, minPx = SWIPE_MIN_PX): -1 | 0 | 1 {
  if (Math.abs(dx) < minPx) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? -1 : 1;
}

/** The view a swipe lands on, or null at the row's end (or for a view outside the row, the
 *  placeholder — which steps onto the row's nearest end so the gesture still does something). */
export function stepView<T>(order: readonly T[], current: T, swipe: -1 | 1): T | null {
  const i = order.indexOf(current);
  if (i < 0) return swipe === -1 ? (order[0] ?? null) : (order[order.length - 1] ?? null);
  const j = i - swipe; // a LEFT swipe (-1) moves to the next index
  return j >= 0 && j < order.length ? order[j] : null;
}
