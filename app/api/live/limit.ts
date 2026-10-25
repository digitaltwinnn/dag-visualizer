// The live routes' `?limit=`, quantized: a request rounds UP to the next rung of a fixed ladder (the
// client's own limits), so the module-level memo holds one entry per rung, never one per number.
import { POLL } from "@/src/engine/config";
import { metaLimitLadder } from "@/src/data/liveMerge";

/** How many globals the shared answer carries (`/api/live`). */
export const LIVE_GLOBALS = 12;

/** `/api/live/globals`: the shared window, and the whole retained buffer (the seed and every catch-up). */
export const GLOBALS_LADDER: readonly number[] = [LIVE_GLOBALS, POLL.maxSnapshots];

/** `/api/live/meta/[id]`: the tail and the seed, each grown ×3 to the cap. */
export const META_LADDER: readonly number[] = metaLimitLadder([POLL.metaSnapTail, POLL.metaSnapSeed]);

/** The rung a raw `?limit=` reads: the first at or above it, the top above the ladder, and the
 *  smallest for an absent, non-positive or junk value. */
export function clampLimit(raw: string | null, ladder: readonly number[]): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return ladder[0];
  return ladder.find((r) => r >= n) ?? ladder[ladder.length - 1];
}
