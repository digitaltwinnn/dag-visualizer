"use client";

import { useSyncExternalStore } from "react";
import { getNetwork } from "@/src/data/network";
import { getPastWindow, onPastWindow, type LedgerSource, type PastWindow } from "@/src/data/pastWindow";
import type { GlobalSnapshot } from "@/src/data/types";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";

/** THE LEDGER SOURCE for a Snapshots surface (`src/data/pastWindow.ts`): the held past window around
 *  an old pin, else the live feed. `snaps` is what the surface lists or steps (oldest → newest),
 *  `source` answers the anchor and record questions about them, and `liveSnaps` stays the live
 *  feed, for what is newer than the window. */
export function useLedgerSource(max: number, enabled = true): {
  snaps: readonly GlobalSnapshot[];
  liveSnaps: readonly GlobalSnapshot[];
  source: LedgerSource | null;
  past: PastWindow | null;
} {
  const { snaps: liveSnaps } = useSnapshotFeed(max, enabled);
  const past = useSyncExternalStore(onPastWindow, getPastWindow, () => null);
  return { snaps: past ? past.globalSnapshots : liveSnaps, liveSnaps, source: past ?? getNetwork(), past };
}
