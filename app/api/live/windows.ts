// THE SHARED LIVE FEED'S CACHE WINDOWS — one home, derived from the client's own poll tuning
// (user, 2026-10-25: the routes held a second copy of the cadence, and the cluster poll moved
// 25s → 30s while the route stayed at 25). Two caches stack in front of every read — the
// in-function MEMO, which bounds upstream reads across edge locations, and the EDGE — so a
// tab can receive data as old as memo + edge + stale-while-revalidate. The memo is kept SHORT
// (≤ 5s) so the edge is the one real window, and the edge sits a little under the poll, so
// consecutive polls from one tab never share an answer.
import { POLL } from "@/src/engine/config";

export interface CacheWindow {
  /** The in-function memo's lifetime, ms. */
  memoMs: number;
  /** The edge's s-maxage, whole seconds. */
  sMaxAge: number;
  /** The edge's stale-while-revalidate, whole seconds. */
  swr: number;
}

/** The window for a feed polled every `pollMs`: the edge one second under a fast poll (5s → 4s),
 *  five seconds under a slow one (30s → 25s); the memo the shorter of 5s and the edge. */
export function cacheWindow(pollMs: number): CacheWindow {
  const pollS = Math.round(pollMs / 1000);
  const fast = pollS <= 10;
  const sMaxAge = Math.max(1, pollS - (fast ? 1 : 5));
  return { memoMs: Math.min(5000, sMaxAge * 1000), sMaxAge, swr: fast ? 2 : 5 };
}

export const SNAPSHOT_WINDOW = cacheWindow(POLL.pollMs);
export const CLUSTER_WINDOW = cacheWindow(POLL.clusterMs);

export const cacheControl = (w: CacheWindow): string => `public, s-maxage=${w.sMaxAge}, stale-while-revalidate=${w.swr}`;

/** The oldest data a tab can receive through a window — what "live" can honestly mean. */
export const worstAgeMs = (w: CacheWindow): number => w.memoMs + (w.sMaxAge + w.swr) * 1000;
