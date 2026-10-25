// Pure merge of the shared live answer into the browser's global buffer (no imports of the NetworkData singleton).

/** THE GLOBAL SNAPSHOTS A POLL MISSED (2026-10-25). Each poll asks for the NEWEST global snapshot
 *  only, and globals land irregularly (measured 4.6–114.8s apart), so two inside one poll interval
 *  used to drop the first from the live buffer — a hole in the chamber, the tick bars and the
 *  pager. When the newest ordinal jumps past `prev + 1`, the poll reads the recent list once and
 *  this picks what to append: every snapshot after `prev`, oldest first, each ordinal once. With
 *  no `prev` (boot) nothing is back-filled here — the seed read covers it. */
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
