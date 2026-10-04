"use client";

import { useMemo } from "react";
import { useStore } from "@/src/store/store";
import type { SiblingState } from "@/components/railSiblings";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { latestRelevant } from "@/src/data/follow";
import { getAnchor } from "@/src/data/network";
import { LISTED_IDS } from "@/src/data/unlisted";
import { tickInStory } from "@/src/data/ledgerStory";
import { POLL } from "@/src/engine/config";
import type { RailCardKind } from "@/components/railCards";

const EMPTY_SNAPS: never[] = []; // stable ref — the non-snap slots' tick placeholder

/** The plain state `railSiblings` reads, for one rail slot — ONE builder shared by the card's sibling
 *  pager and the next ghost's quick picks (2026-10-04), so the two can never read the rail
 *  differently. The two live reads `railSiblings` can't make itself (the network singleton and the
 *  story rule) are made only for the slot that uses them: the tick window is the snapshot slot's
 *  alone, so only it re-derives on a feed tick. */
export function useSiblingState(slot: RailCardKind | null): SiblingState {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const country = useStore((s) => s.country);
  const cohort = useStore((s) => s.cohort);
  const composition = useStore((s) => s.composition);
  const inspect = useStore((s) => s.inspect);
  const snap = useStore((s) => s.snap);
  const metaSnap = useStore((s) => s.metaSnap);
  const tickNet = useStore((s) => s.tickNet);
  const selNodes = useStore((s) => s.selNodes);
  const metaList = useStore((s) => s.metaList);
  const leaderboard = useStore((s) => s.leaderboard);
  const snapshotExact = useStore((s) => s.snapshotExact);
  const following = useStore((s) => s.following);
  // The global chain's window — the SAME buffer and cap the vitals band plots, so the plank and the
  // bars step the same sequence. Only the SNAP slot reads it (review find, 2026-09-11: with the feed
  // as a plain dep, every poll re-derived every card) — and only the snap slot SUBSCRIBES: the next ghost reads this hook from Inspector itself, and a
  // subscription there re-rendered the whole rail on every tick in every view (review, 2026-10-04).
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots, slot === "snap");
  const snapsForTicks = slot === "snap" ? snaps : EMPTY_SNAPS;
  return useMemo(() => {
    const liveOrd = slot === "snap" ? (latestRelevant("all")?.ordinal ?? null) : null;
    const ticks =
      slot === "snap"
        ? snapsForTicks.map((d) => ({
            data: d,
            isLiveTip: d.ordinal === liveOrd,
            inStory: tickInStory(filter, getAnchor(d.timestamp), snapshotExact[d.ordinal]),
          }))
        : [];
    return {
      mode,
      filter,
      country,
      cohort,
      composition,
      inspect,
      snap,
      tickNet,
      metaSnap,
      selNodes,
      metaList,
      isListed: (id: string) => LISTED_IDS.has(id),
      countries: leaderboard?.countries ?? [],
      // The metaSnap rung reads its committed pair's rows; the snap slot reads its own tick's.
      exactRows: metaSnap
        ? (snapshotExact[metaSnap.globalOrdinal]?.rows ?? null)
        : snap
          ? (snapshotExact[snap.data.ordinal]?.rows ?? null)
          : null,
      following,
      ticks,
    };
  }, [slot, mode, filter, country, cohort, composition, inspect, snap, tickNet, metaSnap, selNodes, metaList, leaderboard, snapshotExact, following, snapsForTicks]);
}
