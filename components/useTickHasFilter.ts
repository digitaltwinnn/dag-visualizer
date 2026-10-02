"use client";

import { useStore } from "@/src/store/store";
import { getAnchor } from "@/src/data/network";
import { tickInStory } from "@/src/data/ledgerStory";

// Did the FILTERED network anchor into the global snapshot on screen? One home for the rail's
// Metagraph card (`domain/tickNet.ledgerCardNetwork`): the card, the manifest and the focus
// derivation must all answer the same way or the box and its slot disagree. `undefined` is
// "unknown" (no tick, no filter, a count still settling) and hides nothing.
export function useTickHasFilter(): boolean | undefined {
  const filter = useStore((s) => s.filter);
  const snap = useStore((s) => s.snap);
  const exact = useStore((s) => (s.snap ? s.snapshotExact[s.snap.data.ordinal] : undefined));
  if (!snap || filter === "all") return undefined;
  return tickInStory(filter, getAnchor(snap.data.timestamp), exact);
}
