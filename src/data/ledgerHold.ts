// THE EXPLORER HOLDS STILL WHILE A TICK IS PINNED (user, 2026-10-02: "when we pin… what should
// happen to the timeline progressing? The snapshot explorer will not focus the row anymore as it
// moves out of the list; should it stay static?" — yes).
//
// The Snapshots explorer lists the live buffer newest-first, so every live tick pushes each row
// down one place, and a pinned row walks off the page while the reader is reading it. The SCENE
// already holds: the trail keeps the pinned row at the front and lets new ticks arrive behind the
// glass. The list does the same now — its HEAD freezes, and the ticks that arrive meanwhile are
// counted rather than listed, behind one line that resumes live.
//
// Pure: plain numbers and arrays in, the same out. The component keeps the one piece of state
// (the frozen head) and derives it through `nextHoldTop` during render.

/** The ordinal the list's head is frozen at, or null while it follows live.
 *
 *  THE HEAD IS THE PIN ITSELF (user, 2026-10-19: "if we select the 3rd in the list, the scene moves
 *  it to the front while the explorer stays on the 3rd row; put it on the 1st row and directly
 *  show 'x newer'"). From 2026-10-02 it froze at the newest tick on screen at the moment of the
 *  pin, so nothing visible disappeared — but the scene holds the pinned row at the FRONT, and the
 *  list now says the same: the pinned tick is row one, and everything newer — the ticks that stood
 *  above it when it was pinned and every one that arrives after — is the count behind the "newer"
 *  row. A pin that moves (the pager's ‹ ›, another row) moves the head with it; releasing the pin
 *  releases the hold. */
export function nextHoldTop(current: number | null, pinnedOrdinal: number | null, newestOrdinal: number | null): number | null {
  if (pinnedOrdinal == null) return null;
  // No list yet (the feed seeds a render after mount): wait for it.
  if (newestOrdinal == null) return current;
  return pinnedOrdinal;
}

/** The ticks the explorer lists under a hold, in the caller's own order, and how many newer ones
 *  are waiting behind it.
 *
 *  ⚠️ IT LETS GO WHEN THE PIN LEAVES THE BUFFER. The buffer is a rolling window, so after enough
 *  live ticks the pinned one is evicted and a held list would shrink to nothing behind a pin it
 *  can no longer show. An honest live list beats an empty frozen one (rule 10). */
export function heldTicks<T extends { ordinal: number }>(
  snaps: readonly T[],
  holdTop: number | null,
  pinnedOrdinal: number | null,
): { ticks: readonly T[]; newer: number } {
  if (holdTop == null || pinnedOrdinal == null) return { ticks: snaps, newer: 0 };
  if (!snaps.some((s) => s.ordinal === pinnedOrdinal)) return { ticks: snaps, newer: 0 };
  const ticks = snaps.filter((s) => s.ordinal <= holdTop);
  return { ticks, newer: snaps.length - ticks.length };
}
