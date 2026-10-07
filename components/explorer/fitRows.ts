// HOW MANY ROWS FIT — the snapshot explorer's page size on the desktop rail (2026-09-28, user:
// "always fill the rows till the bottom of the view; if the view size changes, less rows fit and
// the paginator has to adjust"). Pure arithmetic over measured numbers; the component measures.
//
// Fixed-point by construction: the count is the rows ON SCREEN plus however many whole row
// pitches the free space below the card still holds (negative when it overflows). Applied, the
// free space drops below one pitch and the next measure answers the same count, so the card's
// own growth can never feed back into a loop.

/** The page-size bounds: never so few that a page is a peephole, never so many that a tall
 *  monitor fetches dozens of exact reads for one page. */
export const FIT_MIN = 5;
export const FIT_MAX = 30;

/** Rows that fit: `shown` rows are on screen, `free` px remain below the card, `pitch` px is one
 *  row's step. A non-positive pitch (nothing measured yet) keeps `fallback`. */
export function rowsThatFit(shown: number, free: number, pitch: number, fallback: number): number {
  if (!(pitch > 0) || shown <= 0) return fallback;
  const n = shown + Math.floor(free / pitch);
  return Math.min(FIT_MAX, Math.max(FIT_MIN, n));
}

/** The page that keeps the reader's place when the page SIZE changes: the page holding the row
 *  that was first on screen. 1-based, like the pager. */
export function pageKeepingRow(page: number, oldSize: number, newSize: number): number {
  const first = (Math.max(1, page) - 1) * Math.max(1, oldSize);
  return Math.floor(first / Math.max(1, newSize)) + 1;
}

/** The 1-based page holding a 0-based row, or null when the row is not in the list. */
export function pageHolding(index: number, pageSize: number): number | null {
  return index < 0 ? null : Math.floor(index / pageSize) + 1;
}
