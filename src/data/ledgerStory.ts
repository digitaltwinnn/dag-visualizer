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
// Membership sources: a tick's exact read when it has landed (the complete manifest, under every
// address a network has used), else the polled anchor index for a LISTED metagraph, whose buffers
// roll; the UNLISTED set answers from the exact reads (the only honest source); "all"/"dag" have
// no per-network story (null/undefined — the filter never releases).
import { metagraphById } from "@/src/data/network";
import { UNLISTED_ID } from "@/src/data/unlistedId";  // the LEAF, not unlisted.ts: importing the
// network module here would close an import cycle (see src/data/unlistedId.ts).
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
  // The unlisted set reads like a listed network (its chains are polled too, 2026-10-08), with the
  // exact read winning where it landed: it is the tick's own manifest.
  if (filter === UNLISTED_ID) return exact ? exact.unlistedCount : (anchor?.metaCounts?.get(UNLISTED_ID) ?? 0);
  const cfg = metagraphById(filter);
  if (!cfg) return null;
  if (exact?.perMeta) return [cfg.id, ...(cfg.formerIds ?? [])].reduce((n, id) => n + (exact.perMeta[id]?.count ?? 0), 0);
  return anchor?.metaCounts?.get(filter) ?? 0;
}

/** THE LEDGER'S OWN READING OF THE FILTER (user, 2026-08-13): committed DAG reads as the WHOLE
 *  chamber. Every global tick IS a DAG snapshot — the global floor is DAG's lane and it contains
 *  everything — so "DAG" in the *when* view means the base ledger itself, not a lane to isolate.
 *  Before this, DAG dimmed every band (nothing is keyed "dag"), blanked the strip and turned
 *  every explorer group preview-only: the view read as broken exactly where the filter meant the
 *  most. Every ledger surface passes its committed filter through here — the scene's emphasis,
 *  the strip's scale, the explorer's lens, the anchor log — so the mapping cannot drift. The
 *  functions above already agree by construction ("dag" has no per-network story, so the release
 *  rule never fires on it), and what the commit still means is carried elsewhere: the DAG
 *  dossier card, and the global-floor tray nodes staying on-filter (the node model's own answer). */
export const ledgerLens = (filter: string): string => (filter === "dag" ? "all" : filter);

/** The polled anchor index needs a settling window after a fresh tick (see CLAUDE.md, the tick
 *  lifecycle) — a zero read inside it may just be lag, and the release rule must never fire on
 *  a lagging count. */
export const STORY_SETTLE_MS = 7000;

/** The release rule's input: is this tick part of the filter's story? `undefined` = unknown or
 *  no story — the release rule must not fire. Unknown covers a POLLED zero still inside the
 *  settling window — a listed network's, or the unlisted set's before its exact read lands. */
export function tickInStory(
  filter: string,
  anchor: Anchor | null | undefined,
  exact: SnapshotExact | undefined,
  now: number = Date.now(),
): boolean | undefined {
  const n = storyCount(filter, anchor, exact);
  if (n == null) return undefined;
  // A polled zero may still be settling — never release on lag. The unlisted count is exact once
  // the tick's read has landed, so only its polled fallback waits.
  const polled = filter === UNLISTED_ID ? !exact : !exact?.perMeta;
  if (n === 0 && polled && anchor && now - anchor.touched < STORY_SETTLE_MS)
    return undefined;
  return n > 0;
}

/** A FILTER HOLDS THE CHAMBER (user, 2026-11-02: "only make the actual snapshots that contains
 *  Biofi clickable"): a tick its network did not anchor into answers no click. Only a landed read
 *  can say so. A polled zero is also what a tick looks like when the buffer has rolled past it, so
 *  with no read the tick stays open: unknown is not none. */
export const tickLocked = (filter: string, exact: SnapshotExact | undefined): boolean =>
  !!exact?.perMeta && storyCount(filter, null, exact) === 0;

/** A FILTER HOLDS THE CHAMBER, AND THE BLOCK ROWS WITH IT (the Blocks register): a block whose
 *  accepting global the filter's network is not in answers nothing — no commit, no hover — in the
 *  explorer and in RAW, exactly as that tick's own row (`tickLocked`) and the chamber's pick
 *  (`Picking.tickHeldOut`) do. The committed block and a block on the tick on screen always
 *  answer: they are the way back. */
export function blockRowLocked(
  filter: string,
  exact: SnapshotExact | undefined,
  b: { anchorOrd: number },
  at: { on: boolean; shownOrd: number | null },
): boolean {
  return !at.on && b.anchorOrd !== at.shownOrd && tickLocked(filter, exact);
}
