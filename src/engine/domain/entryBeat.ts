// THE SUBJECT-ARRIVAL BEAT'S SHAPE — one home for the drop the Snapshots chamber plays and the
// Geography base rings play after it (user, 2026-10-24: "make the circles appear staggered and
// with the same timing as the snapshot view's actual snapshots (there is a specific moment for
// these furniture related but data driven placements)"). The Engine's begin/release contract
// says WHEN (held dark through the choreography, released at the completion edge —
// `entryBeatBoundary.test.ts`); this says HOW a row falls once released: a gravity-eased drop
// (p², accelerating into the plane — a drop, not a float), its brightness arriving early in its
// own fall, rows staggered `ENTRY_STAG` apart. The chamber tuned the numbers on 2026-08-16; the
// rings share the fall and bring their own stagger (three rings, not fifty arcs), so the two
// instruments land to one beat at one tempo.

/** One row's fall, seconds. */
export const ENTRY_FALL = 0.45;
/** Between one row's start and the next's, seconds. */
export const ENTRY_STAG = 0.04;

/** The whole beat for `rows` rows staggered `stag` apart. */
export function entryTotal(rows: number, stag: number = ENTRY_STAG): number {
  return ENTRY_FALL + stag * Math.max(0, rows - 1);
}

/** A row's state at `tSec` into the beat, its fall starting at `start`: `drop` is the share of the
 *  lift still to fall (1 = held high, 0 = landed), `fade` its presence (visible early in its own
 *  fall, full before it lands). */
export function entryStep(tSec: number, start: number): { p: number; drop: number; fade: number } {
  const p = Math.min(1, Math.max(0, (tSec - start) / ENTRY_FALL));
  return { p, drop: 1 - p * p, fade: Math.min(1, p * 1.6) };
}
