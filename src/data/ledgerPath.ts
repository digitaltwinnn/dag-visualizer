// THE SNAPSHOTS EXPLORER'S PATH — which tick, which network in it and which snapshot's signers are
// open — and EVERY rule that moves it when the store moves (2026-10-04, review item 7). The path is
// the card's own browse state, but four store changes have to move it, and they used to be four
// effects plus a ref, each reading the others' stale values and patched against each other in two
// reviews. Here they are one function with one order, and a test.
//
// Pure: plain values in, the next path out. The component calls it DURING RENDER when the store
// view it sees has changed (the get-derived-state pattern `ledgerHold` uses), so the path moves in
// the same commit as the selection rather than a frame after it.

export interface LedgerPath {
  /** The open tick (a global ordinal), or null at the tick list. */
  tick: number | null;
  /** The open network inside it — a listed metagraph id or the unlisted key. */
  net: string | null;
  /** The snapshot whose signers are open, `${metaId}|${ordinal}`. */
  snap: string | null;
  /** This explorer's own row click is about to resume live — that one resume must not close the
   *  path the click has just opened (whole-branch review, 2026-10-03). Consumed by the resume. */
  selfResume: boolean;
}

export const CLOSED_PATH: LedgerPath = { tick: null, net: null, snap: null, selfResume: false };

/** What the path reads from the store. */
export interface LedgerPathView {
  /** The committed metagraph snapshot, with its network KEY already resolved. */
  metaSnap: { metaId: string; ordinal: number; globalOrdinal: number; netKey: string } | null;
  /** The committed tick's ordinal. */
  snapOrd: number | null;
  following: boolean;
}

const metaSnapKey = (m: LedgerPathView["metaSnap"]) => (m ? `${m.globalOrdinal}|${m.metaId}|${m.ordinal}` : null);

/** Whether two views differ in anything the path answers to. */
export function pathViewChanged(a: LedgerPathView, b: LedgerPathView): boolean {
  return (
    metaSnapKey(a.metaSnap) !== metaSnapKey(b.metaSnap) ||
    a.snapOrd !== b.snapOrd ||
    a.following !== b.following
  );
}

/** The path after the store moved from `prev` to `next`. THE PATH FOLLOWS THE SELECTION (user,
 * 2026-10-07 — one rule for every explorer): it opens down to the deepest selected subject, and
 * the Explorer then stands it at the OPEN card's children (`components/explorer/boxLevel.ts`), so
 * which card is open is never this function's business.
 *
 * 1. **A selected metagraph snapshot opens to its signers** — tick › network › snapshot — pinned
 *    or LIVE. Live under a filter the heartbeat selects the network's newest snapshot, and the
 *    scene's front row moves only when that network anchors a new one, so the path moves with it
 *    (the 2026-10-04 "too jumpy" ruling is the scene's front-row rule, not the explorer's).
 * 2. **A pinned global snapshot opens that tick** — wherever the pin came from (a tile, a bar, the
 *    rail's ‹ ›, the raw log).
 * 3. **Live with no snapshot of a network selected — the unfiltered stream — the heartbeat leaves
 *    the path alone**: the tick list IS the stream there, and opening the newest tick every ~28s
 *    would throw it away. Resuming live closes the path, unless the resume is this explorer's own
 *    row click (`selfResume`), which keeps what that click opened and spends the flag. */
export function syncLedgerPath(path: LedgerPath, prev: LedgerPathView, next: LedgerPathView): LedgerPath {
  const m = next.metaSnap;
  // The selected snapshot belongs to the shown tick (a stale one from an older tick does not).
  if (m && (next.snapOrd == null || m.globalOrdinal === next.snapOrd)) {
    const key = `${m.metaId}|${m.ordinal}`;
    if (path.tick === m.globalOrdinal && path.net === m.netKey && path.snap === key) return path.selfResume && next.following ? { ...path, selfResume: false } : path;
    return { tick: m.globalOrdinal, net: m.netKey, snap: key, selfResume: false };
  }
  if (next.following) {
    if (!prev.following) return path.selfResume ? { ...path, selfResume: false } : CLOSED_PATH;
    return path;
  }
  const ord = next.snapOrd;
  // On a new pin — a different tick, OR the same tick going from followed to pinned (pinning the
  // live tip changes no ordinal; review, 2026-10-04).
  if (ord != null && (ord !== prev.snapOrd || prev.following) && path.tick !== ord) {
    return { ...CLOSED_PATH, tick: ord, selfResume: path.selfResume };
  }
  return path;
}
