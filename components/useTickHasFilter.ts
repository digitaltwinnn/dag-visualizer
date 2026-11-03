"use client";

import { useStore } from "@/src/store/store";
import { ledgerAnchor } from "@/src/data/network";
import { getPastWindow, onPastWindow } from "@/src/data/pastWindow";
import { useSyncExternalStore } from "react";
import { tickInStory } from "@/src/data/ledgerStory";
import { useFeedRead } from "@/components/useFeedRead";

// Did the FILTERED network anchor into the global snapshot on screen? One home for the rail's
// Metagraph card (`domain/tickNet.ledgerCardNetwork`): the card, the manifest and the focus
// derivation must all answer the same way or the box and its slot disagree. `undefined` is
// "unknown" (no tick, no filter, a count still settling) and hides nothing.
export function useTickHasFilter(): boolean | undefined {
  const filter = useStore((s) => s.filter);
  const snap = useStore((s) => s.snap);
  // It reads the tick's anchors and exact read only with a tick pinned under a filter.
  useFeedRead(["metasnaps", "exact"], "Snapshot filter check", snap != null && filter !== "all");
  const exact = useStore((s) => (s.snap ? s.snapshotExact[s.snap.data.ordinal] : undefined));
  // Re-read when a past window arrives or leaves: an old pin's anchors are in it, not the live index.
  useSyncExternalStore(onPastWindow, getPastWindow, () => null);
  if (!snap || filter === "all") return undefined;
  return tickInStory(filter, ledgerAnchor(snap.data.timestamp), exact);
}
