// THE PHONE SHEET'S SHIFT — how far the scene's framing centre moves UP while a bottom sheet
// covers the canvas (user, 2026-09-28: "when we expand the bottom section, position the 3D scene
// so that it moves to the above section in the view"). The phone sheet is a drawer over a canvas
// that kept framing itself in the full viewport, so the hub or globe the reader was about to act
// on sat behind the glass, and a row tap made the scene react where it could not be seen.
//
// The shift is a PROJECTION offset, never a camera move: the Engine hands it to
// `camera.setViewOffset` (three's own principal-point shift), so every pose stays exactly what it
// is and the callout, the chart planes and picking follow for free — they all project through
// the same camera. Camera principle 2 holds: nothing about the structure or the pose changes;
// the viewport's centre moved, and the projection says so.
//
// Half the cover: the free band is the viewport minus the sheet, and its centre sits `cover / 2`
// above the viewport's. The top bar is left out on purpose — it is symmetric with the phone's
// dock bar at the bottom, which the cover also leaves out, so the two cancel to within a few px.
// Shift only, no zoom (user, same round): dollying out to FIT the band is a second lever, to be
// judged against the shift once it is seen.
//
// No imports — arithmetic over numbers, the `calloutPlacement.ts` discipline.

/** The ease rate the Engine integrates the shift with (per second, exponential): the sheet's own
 *  grow runs ~550ms, and this lands the shift on the same beat rather than ahead of the glass. */
export const SHEET_SHIFT_K = 7;

/** Pixels the framing centre moves up for a bottom cover of `coverPx`. Never negative; a cover
 *  taller than the viewport is clamped to it, so a rubber-banded drag past the top cannot fling
 *  the scene off screen. */
export function sheetShiftPx(coverPx: number, viewHeightPx: number): number {
  const cover = Math.min(Math.max(0, coverPx), Math.max(0, viewHeightPx));
  return cover / 2;
}

/** THE CHROME'S SHIFT (user, 2026-10-04: "move the scene slightly up — we added a larger bottom
 *  section later, so now it sits a bit too close to that"). On desktop and tablet the free canvas
 *  runs from the top bar's bottom edge (`topPx` from the viewport top) to the vitals band's top edge
 *  (`bottomPx` from the viewport bottom, the footer under it included), and the bottom chrome is the
 *  taller — so the viewport's centre, which every pose frames, sat below the free band's. The
 *  framing centre moves up by half the difference: the same projection offset as the phone sheet's,
 *  so no pose changes. Signed only in principle — callers pass a band that is on screen, and the
 *  phone (no band in the lane) and the scene-only presentation (band stepped aside) pass none. */
export function chromeShiftPx(topPx: number, bottomPx: number): number {
  return (Math.max(0, bottomPx) - Math.max(0, topPx)) / 2;
}
