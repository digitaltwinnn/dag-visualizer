import { getNetwork, getAnchor, metagraphById } from "@/src/data/network";
import { useStore } from "@/src/store/store";
import type { GlobalSnapshot } from "@/src/data/types";

// The latest snapshot worth showing while following: when a metagraph is selected,
// the newest one it anchored into (falling back to the newest global if it hasn't
// anchored in the buffered window); otherwise just the newest global snapshot.
// (Ports ui.js _latestRelevantSnapshot.)
export function latestRelevant(filter: string): GlobalSnapshot | null {
  const net = getNetwork();
  const list: GlobalSnapshot[] = net?.globalSnapshots ?? [];
  if (!list.length) return null;
  if (metagraphById(filter)) {
    for (let i = list.length - 1; i >= 0; i--) {
      const a = getAnchor(list[i].timestamp);
      if (a && a.metaIds.has(filter)) return list[i];
    }
  }
  return list[list.length - 1];
}

// Point the inspector at the latest relevant snapshot (used on each new snapshot /
// anchor fill while following, and when the user clicks "Go live").
export function followLatest() {
  const { filter, setInspect } = useStore.getState();
  const snap = latestRelevant(filter);
  if (snap) setInspect({ kind: "snapshot", title: `Global snapshot #${snap.ordinal}`, data: snap });
}
