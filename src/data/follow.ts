import { getNetwork, getAnchor, metagraphById } from "@/src/data/network";
import { ledgerLens } from "@/src/data/ledgerStory";
import { LISTED_IDS, UNLISTED_ID, latestUnlistedTick, unlistedLog } from "@/src/data/unlisted";
import { useStore } from "@/src/store/store";
import type { GlobalSnapshot } from "@/src/data/types";
import { getBlockWindow } from "@/src/data/pastWindow";
import { blockChainOf, newestBlock } from "@/src/data/blockWindow";
import { readsBlockWindow, registerOf } from "@/src/engine/domain/viewPolicy";

// The latest snapshot worth showing while following: for a metagraph filter, the
// newest one it ACTUALLY anchored into — or null if it hasn't anchored in the buffered
// window (don't fall back to an unrelated global snapshot; that would mislabel it as
// "real-time · PACA" while following snapshots PACA isn't in). For All/L0/L1, the
// newest global snapshot. (Ports ui.js _latestRelevantSnapshot, minus the bad fallback.)
export function latestRelevant(rawFilter: string): GlobalSnapshot | null {
  // Through the ledger's lens (user, 2026-08-13): DAG follows the base ledger itself — every
  // global tick is its own. ⚠️ Without this, `metagraphById("dag")` resolves (the identity map
  // answers for the core) and the scan below looks for anchors keyed "dag", which never exist —
  // a permanent null that emptied the explorer and killed the follow under a committed DAG.
  const filter = ledgerLens(rawFilter);
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
    return latestUnlistedTick(list, useStore.getState().snapshotExact, net?.unlistedSnaps);
  }
  return list[list.length - 1];
}

// Point the inspector at the latest relevant snapshot (on each new snapshot / anchor
// fill while following, and on "Go real-time"). If there's nothing relevant (e.g. a
// metagraph with no recent snapshots), clear a stale snapshot card rather than show a
// misleading one — the metagraph context pane still conveys the selection.
export function followLatest() {
  // IN THE BLOCKS REGISTER LIVE FOLLOWS THE NEWEST BLOCK (D3), not the newest global: the chamber
  // draws only the block-bearing ticks, so the live global is not even on screen there.
  {
    const st = useStore.getState();
    if (readsBlockWindow(registerOf(st.mode, st.ledgerRegister))) return followNewestBlock();
  }
  // `advanceSnap`, not `setSnap`: the heartbeat advance must not bump the selection recency the
  // facts rail's collapse rule reads (store.selStack — a tick is not a user act).
  const { filter: rawFilter, snap, metaSnap, advanceSnap, advanceMetaSnap } = useStore.getState();
  const filter = ledgerLens(rawFilter); // dag = the base ledger's own follow (see latestRelevant)
  const net = getNetwork();

  // LIVE METAGRAPH MODE (user, 2026-08-07): while following with a metagraph committed, the
  // metagraph-snapshot card rides the heartbeat too — that network's newest buffered snapshot
  // (non-bumping, and only on real change so the card doesn't churn). The deep read stays gated
  // to EXPLICIT selections (RawSnapshotBridge skips it while following).
  // ⚠️ THE PAIR ADVANCES TOGETHER (user, 2026-10-08: "a metagraph snapshot card show that was no
  // longer related to the global snapshot"). The global used to come from the anchor index
  // (`latestRelevant`) and the metagraph snapshot from the network's own buffer, which can lag it
  // by a poll — so the global moved on while the card kept the older snapshot, anchored into a
  // tick no longer on screen. The global is now the one THIS snapshot anchored into: newest
  // snapshot whose tick is buffered, and both cards step to it at once.
  if (metagraphById(filter) && net) {
    const list = net.metaSnaps?.get(filter);
    if (list?.length) {
      let best: { m: (typeof list)[number]; g: GlobalSnapshot } | null = null;
      for (const x of list) {
        if (best && x.ordinal <= best.m.ordinal) continue;
        const g = net.globalSnapshots?.find((gs) => gs.timestamp === x.ts);
        if (g) best = { m: x, g };
      }
      if (best) {
        const { m, g } = best;
        if (snap?.data.ordinal !== g.ordinal) advanceSnap({ kind: "snapshot", title: `Global snapshot #${g.ordinal}`, data: g });
        // A snapshot the reader stepped to inside this live global is kept until the next one.
        const held = !!metaSnap?.held && metaSnap.metaId === filter && metaSnap.globalOrdinal === g.ordinal;
        if (!held && (metaSnap?.metaId !== filter || metaSnap.ordinal !== m.ordinal)) {
          advanceMetaSnap({ metaId: filter, ordinal: m.ordinal, hash: m.hash, globalOrdinal: g.ordinal, ts: m.ts });
        }
        return;
      }
    }
  }

  const latest = latestRelevant(filter);
  if (latest) advanceSnap({ kind: "snapshot", title: `Global snapshot #${latest.ordinal}`, data: latest });
  else if (snap) advanceSnap(null);
  if (filter === UNLISTED_ID && latest) {
    // Same live card chain: the newest unlisted row (the one-home log source, newest first).
    const row = unlistedLog([latest], useStore.getState().snapshotExact, net?.unlistedSnaps)[0];
    // Same guard as above: an unlisted row always names its channel, so `row.metaId` is present —
    // the check is what keeps a follow from ever advancing onto a subject that has no network.
    const held = !!metaSnap?.held && metaSnap.globalOrdinal === latest.ordinal && !LISTED_IDS.has(metaSnap.metaId);
    if (row?.metaId && !held && (metaSnap?.metaId !== row.metaId || metaSnap.ordinal !== row.ordinal)) {
      advanceMetaSnap({ metaId: row.metaId, ordinal: row.ordinal, hash: row.hash, globalOrdinal: latest.ordinal, ts: latest.timestamp });
    }
    return;
  }
  // Not a metagraph follow (or nothing buffered): a followed card never shows a stale foreign
  // metagraph snapshot — clear it (explicit pins aren't in follow mode, so this can't fire there).
  if (metaSnap) advanceMetaSnap(null);
}

/** LIVE IN THE BLOCKS REGISTER (D3, user 2026-11-07: "live mode should be applied to the block and
 *  not the snapshot (those aren't even shown given blocks are only occasional)"). While following,
 *  the Block card rides the heartbeat: the window's NEWEST block of the network it was read for
 *  (`newestBlock` — the filter's, else any) and its accepting global with it, each on a real change
 *  only, both through the non-bumping advances (a live block is no reader's pick). The ONE writer of
 *  `advanceBlock`; FollowController calls it on every global, anchor and block-window change.
 *
 *  No window yet (entering the register), or one read for another network (a filter's refetch in
 *  flight): nothing is moved — the cards keep what they show until the window lands. Under the
 *  unlisted filter no window is read (the stated floor) and the block goes. A window holding none of its network's blocks: the block goes,
 *  the global it hung under stays (the explorer and the band say why the window is empty). A live
 *  metagraph snapshot belongs to another tick's follow; it goes too, unless the reader stepped to it
 *  inside the shown global (`held`). */
function followNewestBlock(): void {
  const { snap, block, metaSnap, filter, blockWindowStatus, advanceSnap, advanceBlock, advanceMetaSnap } = useStore.getState();
  const w = getBlockWindow();
  // The unlisted filter reads no window at all (the stated floor), and a read that spent its retries
  // cleared the window it could not replace (review M2 — another network's window is never drawn
  // under this filter): nothing stands to follow, so the live block goes with it.
  if (!w && (blockWindowStatus?.status === "unread" || blockWindowStatus?.status === "failed")) {
    if (block) advanceBlock(null);
    return;
  }
  // A window read for ANOTHER network (a filter change, before its refetch lands), or one read around
  // a pin (a resume, before the live window lands), is not the live edge this follow walks — asked
  // of the HELD window's own provenance, never the request in flight (review M1: a resume flips the
  // request to "live" while the pinned window is still the one held).
  if (!w || w.chain !== blockChainOf(filter) || w.around != null) return;
  const b = newestBlock(w);
  if (!b) {
    if (block) advanceBlock(null);
    return;
  }
  const g = w.globalSnapshots.find((x) => x.ordinal === b.anchorOrd);
  if (g && snap?.data.ordinal !== g.ordinal) advanceSnap({ kind: "snapshot", title: `Global snapshot #${g.ordinal}`, data: g });
  if (!block || block.chain !== b.chain || block.hash !== b.hash) {
    advanceBlock({ chain: b.chain, hash: b.hash, ordinal: b.ordinal, anchorOrd: b.anchorOrd });
  }
  if (metaSnap && !(metaSnap.held && metaSnap.globalOrdinal === b.anchorOrd)) advanceMetaSnap(null);
}
