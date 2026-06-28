import { getNetwork, getAnchor, metagraphById } from "@/src/data/network";
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
  return list[list.length - 1];
}

// Point the inspector at the latest relevant snapshot (on each new snapshot / anchor
// fill while following, and on "Go real-time"). If there's nothing relevant (e.g. a
// metagraph with no recent snapshots), clear a stale snapshot card rather than show a
// misleading one — the metagraph context pane still conveys the selection.
export function followLatest() {
  const { filter, snap, setSnap } = useStore.getState();
  const latest = latestRelevant(filter);
  if (latest) setSnap({ kind: "snapshot", title: `Global snapshot #${latest.ordinal}`, data: latest });
  else if (snap) setSnap(null);
}
