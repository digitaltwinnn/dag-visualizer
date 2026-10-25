// Pure merge of the shared live answer into the browser's global buffer (no imports of the NetworkData singleton).

/** THE GLOBAL SNAPSHOTS A POLL MISSED (2026-10-25). Each poll reads the shared answer's window of
 *  the 12 newest globals, and globals land irregularly (measured 4.6–114.8s apart). This picks what
 *  to append from a recent list — the shared window, or the window plus the catch-up read when the
 *  tab fell behind it: every snapshot after `prev`, oldest first, each ordinal once. With no `prev`
 *  (boot) nothing is back-filled here — the seed read covers it. */
export function missedGlobals<T extends { ordinal: number }>(prev: number | null, recent: readonly T[]): T[] {
  if (prev == null) return [];
  const seen = new Set<number>();
  return [...recent]
    .filter((s) => s.ordinal > prev && !seen.has(s.ordinal) && (seen.add(s.ordinal), true))
    .sort((a, b) => a.ordinal - b.ordinal);
}

/** What a poll appends from the shared window (newest-first, as upstream returns it), and whether
 *  the tab fell BEHIND that window: the oldest shared ordinal sits above `prev + 1`, so the gap
 *  (`newest - prev`) needs one cached catch-up read. First read (`prev` null) takes the newest only. */
export function globalsToAppend<T extends { ordinal: number }>(
  prev: number | null,
  shared: readonly T[],
): { append: T[]; needCatchUp: number | null } {
  if (!shared.length) return { append: [], needCatchUp: null };
  const newest = shared.reduce((a, b) => (b.ordinal > a.ordinal ? b : a));
  if (prev == null) return { append: [newest], needCatchUp: null };
  const oldest = shared.reduce((a, b) => (b.ordinal < a.ordinal ? b : a));
  const append = missedGlobals(prev, shared);
  const behind = append.length > 0 && oldest.ordinal > prev + 1;
  return { append, needCatchUp: behind ? newest.ordinal - prev : null };
}

/** Whether one chain's shared tail (newest-first) leaves a GAP this tab must read through the
 *  per-chain route. A chain the answer did not carry → yes; an empty tail → no, even cold (a chain
 *  with nothing would otherwise cost a per-chain read every poll); a cold buffer with snapshots →
 *  yes (the seed is deeper than the tail); otherwise yes iff the tail's oldest ordinal sits above
 *  `heldNewest + 1` — an uncounted gap mislabels listed anchors as "unlisted". */
export function chainNeedsCatchUp(heldNewest: number, shared: readonly { ordinal: number }[] | undefined): boolean {
  if (shared === undefined) return true;
  if (!shared.length) return false;
  if (heldNewest < 0) return true;
  const oldest = shared.reduce((a, b) => (b.ordinal < a.ordinal ? b : a));
  return oldest.ordinal > heldNewest + 1;
}

/** What one chain's cycle appends: the catch-up list (`null` when none ran) and the shared tail,
 *  each ordinal once. The two come from independent caches, so the catch-up can PREDATE the tail;
 *  the tail is taken only when what is held after the catch-up reaches its oldest ordinal − 1
 *  (or the buffer is cold and nothing is held at all). Otherwise the tail waits for the next poll,
 *  where `chainNeedsCatchUp` re-triggers against a fresher cache — recording it now would push the
 *  buffer's newest past ordinals no read has delivered, and they would never be filled. */
export function chainToRecord<T extends { ordinal: number }>(
  heldNewest: number,
  catchUp: readonly T[] | null,
  shared: readonly T[] | undefined,
): T[] {
  const reach = (catchUp ?? []).reduce((m, s) => Math.max(m, s.ordinal), heldNewest);
  const out = [...(catchUp ?? [])];
  if (shared?.length) {
    const oldest = shared.reduce((m, s) => Math.min(m, s.ordinal), Infinity);
    if (reach < 0 || oldest <= reach + 1) out.push(...shared);
  }
  const seen = new Set<number>();
  return out.filter((s) => !seen.has(s.ordinal) && (seen.add(s.ordinal), true));
}

/** The per-chain catch-up's deepest read (`/api/live/meta/[id]`'s cap too). */
export const META_CATCHUP_MAX = 600;

/** The catch-up's next, deeper limit: ×3, capped at `META_CATCHUP_MAX`. */
export function nextCatchUpLimit(lim: number): number {
  return Math.min(META_CATCHUP_MAX, lim * 3);
}

/** Every limit the per-chain catch-up can send, ascending: each start grown by `nextCatchUpLimit`
 *  to the cap. The meta route rounds a request UP to this ladder, so its memo holds one entry per
 *  rung however odd the caller. */
export function metaLimitLadder(starts: readonly number[]): number[] {
  const out = new Set<number>();
  for (let lim of starts) {
    for (;;) {
      out.add(lim);
      if (lim >= META_CATCHUP_MAX) break;
      lim = nextCatchUpLimit(lim);
    }
  }
  return [...out].sort((a, b) => a - b);
}
