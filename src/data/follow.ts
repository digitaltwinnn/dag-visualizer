import { getNetwork, getAnchor, metagraphById } from "@/src/data/network";
import { UNLISTED_ID, latestUnlistedTick, unlistedLog } from "@/src/data/unlisted";
import { useStore } from "@/src/store/store";
import type { GlobalSnapshot } from "@/src/data/types";

// The latest snapshot worth showing while following: for a metagraph filter, the
// newest one it ACTUALLY anchored into — or null if it hasn't anchored in the buffered
// window (don't fall back to an unrelated global snapshot; that would mislabel it as
// "real-time · PACA" while following snapshots PACA isn't in). For All/L0/L1, the
// newest global snapshot. (Ports ui.js _latestRelevantSnapshot, minus the bad fallback.)
export function latestRelevant(filter: string): GlobalSnapshot | null {
  const net = getNetwork();
  const list: GlobalSnapshot[] = net?.globalSnapshots ?? [];
  if (!list.length) return null;
  if (metagraphById(filter)) {
    for (let i = list.length - 1; i >= 0; i--) {
      const a = getAnchor(list[i].timestamp);
      if (a && a.metaIds.has(filter)) return list[i];
    }
    return null; // this metagraph hasn't anchored into any buffered snapshot
  }
  if (filter === UNLISTED_ID) {
    // The same rule as a listed metagraph: the newest tick it actually anchored into. The
    // one-home module owns the exact-read scan (src/data/unlisted.ts).
    return latestUnlistedTick(list, useStore.getState().snapshotExact);
  }
  return list[list.length - 1];
}

// Point the inspector at the latest relevant snapshot (on each new snapshot / anchor
// fill while following, and on "Go real-time"). If there's nothing relevant (e.g. a
// metagraph with no recent snapshots), clear a stale snapshot card rather than show a
// misleading one — the metagraph context pane still conveys the selection.
export function followLatest() {
  // `advanceSnap`, not `setSnap`: the heartbeat advance must not bump the selection recency the
  // facts rail's collapse rule reads (store.selStack — a tick is not a user act).
  const { filter, snap, metaSnap, advanceSnap, advanceMetaSnap } = useStore.getState();
  const latest = latestRelevant(filter);
  if (latest) advanceSnap({ kind: "snapshot", title: `Global snapshot #${latest.ordinal}`, data: latest });
  else if (snap) advanceSnap(null);

  // LIVE METAGRAPH MODE (user, 2026-08-07): while following with a metagraph committed, the
  // metagraph-snapshot card rides the heartbeat too — always that network's newest buffered
  // snapshot (non-bumping, and only on real change so the card doesn't churn). The deep read
  // stays gated to EXPLICIT selections (RawSnapshotBridge skips it while following).
  const net = getNetwork();
  if (metagraphById(filter) && net) {
    const list = net.metaSnaps?.get(filter);
    if (list?.length) {
      let m = list[0];
      for (const x of list) if (x.ordinal > m.ordinal) m = x;
      const g = net.globalSnapshots?.find((gs) => gs.timestamp === m.ts);
      if (g && (metaSnap?.metaId !== filter || metaSnap.ordinal !== m.ordinal)) {
        advanceMetaSnap({ metaId: filter, ordinal: m.ordinal, hash: m.hash, globalOrdinal: g.ordinal, ts: m.ts });
      }
      return;
    }
  }
  if (filter === UNLISTED_ID && latest) {
    // Same live card chain: the newest unlisted row (the one-home log source, newest first).
    const row = unlistedLog([latest], useStore.getState().snapshotExact)[0];
    if (row && (metaSnap?.metaId !== row.metaId || metaSnap.ordinal !== row.ordinal)) {
      advanceMetaSnap({ metaId: row.metaId, ordinal: row.ordinal, hash: "", globalOrdinal: latest.ordinal, ts: latest.timestamp });
    }
    return;
  }
  // Not a metagraph follow (or nothing buffered): a followed card never shows a stale foreign
  // metagraph snapshot — clear it (explicit pins aren't in follow mode, so this can't fire there).
  if (metaSnap) advanceMetaSnap(null);
}
