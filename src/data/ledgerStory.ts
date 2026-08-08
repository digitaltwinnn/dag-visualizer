// The FILTER-IS-A-STORY rule's one home (2026-08-08 — extracted from three inline copies in
// LedgerPanel, LiveStrip and Engine, the unlisted-module lesson applied to the story concept):
// a committed network filter is a STORY — the ticks it actually anchored into — and every
// surface answers membership through these two functions.
//
//   · The EXPLORER lists only the story's ticks (the LiveStrip's filtered idiom) and marks
//     each with its count.
//   · The SCENE and STRIP keep all ticks visible and use `tickInStory` as the release rule's
//     input (pinning an out-of-story tick steps the filter back to "all" —
//     `snapshotSelectActions`).
//
// Membership sources are per network kind: a LISTED metagraph answers from the polled anchor
// index; the UNLISTED set answers from the exact reads (the only honest source); "all"/"dag"
// have no per-network story (null/undefined — the filter never releases).
import { metagraphById } from "@/src/data/network";
import { UNLISTED_ID } from "@/src/data/unlisted";
import type { Anchor, SnapshotExact } from "@/src/data/types";

/** How many snapshots `filter` anchored into a tick — its story-membership count, or null when
 *  the filter has no per-network story ("all"/"dag"/unknown). */
export function storyCount(
  filter: string,
  anchor: Anchor | null | undefined,
  exact: SnapshotExact | undefined,
): number | null {
  if (filter === "all" || filter === "dag") return null; // no per-network story (NB:
  // metagraphById resolves "dag" through the identity map, so the guard must come first)
  if (filter === UNLISTED_ID) return exact?.unlistedCount ?? 0;
  if (metagraphById(filter)) return anchor?.metaCounts?.get(filter) ?? 0;
  return null;
}

/** The release rule's input: is this tick part of the filter's story? `undefined` = the filter
 *  has no story (the release rule must not fire). */
export function tickInStory(
  filter: string,
  anchor: Anchor | null | undefined,
  exact: SnapshotExact | undefined,
): boolean | undefined {
  const n = storyCount(filter, anchor, exact);
  return n == null ? undefined : n > 0;
}
