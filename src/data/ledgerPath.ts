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
  /** The rail's open box (`store.boxedCard`) — a slot id, or null. */
  boxed: string | null;
}

const metaSnapKey = (m: LedgerPathView["metaSnap"]) => (m ? `${m.globalOrdinal}|${m.metaId}|${m.ordinal}` : null);

/** Whether two views differ in anything the path answers to. */
export function pathViewChanged(a: LedgerPathView, b: LedgerPathView): boolean {
  return (
    metaSnapKey(a.metaSnap) !== metaSnapKey(b.metaSnap) ||
    a.snapOrd !== b.snapOrd ||
    a.following !== b.following ||
    a.boxed !== b.boxed
  );
}

/** The path after the store moved from `prev` to `next`. The rules, in order:
 *
 * 1. **Resuming live closes the path** — a resume is a return to the stream (test pass,
 *    2026-10-03) — unless the resume is this explorer's own row click (`selfResume`), which keeps
 *    what that click opened and spends the flag.
 * 2. **A snapshot committed anywhere opens the path to it** (a tile, the rail's pager, the raw log)
 *    — but not the LIVE FOLLOW's own commit (user, 2026-10-04): under a filter the heartbeat
 *    commits the network's newest snapshot every tick, and following it down left one row on
 *    screen while the trail showed many. The signer level stays open only for that same snapshot.
 * 3. **A tick pinned elsewhere while a tick is open re-points the path** — unless the same commit
 *    carried a snapshot of that tick, which rule 2 has already opened (review, 2026-09-26).
 *
 * And one rule over all three: **the path MIRRORS the snapshot chain's box** (user, 2026-10-07 —
 * "when I'm on a metagraph snapshot card the explorer … should show the parent global snapshot →
 * BioFi → the snapshot I see in my card", then "open it one level higher … if we click the node
 * card, then we move to that validator row"). With the Metagraph snapshot card as the box the path
 * stands at that network's snapshots in the tick, the snapshot's row washed; with the Node card as
 * the box it goes one level deeper, to the snapshot's signers, the node's row washed.
 * - A RE-BOX (the box moves, the snapshot does not) mirrors in both states — it is a card click,
 *   and the explorer answers it the way a row click answers with its card.
 * - LIVE, the heartbeat's commit is followed only while one of those two cards is the box, which is
 *   the one exception to rule 2's live clause; when the box leaves them, a path the mirror opened
 *   goes back to the tick list. Any other box under live leaves the path alone (2026-10-04).
 * - PINNED, a commit keeps rule 2: the explorer's own snapshot row opens the signers itself, and a
 *   mirror over it would take that drill back. */
const mirrored = (v: LedgerPathView): LedgerPath | null => {
  const m = v.metaSnap;
  if (!m || (v.boxed !== "metaSnap" && v.boxed !== "node")) return null;
  return { tick: m.globalOrdinal, net: m.netKey, snap: v.boxed === "node" ? `${m.metaId}|${m.ordinal}` : null, selfResume: false };
};
const samePath = (a: LedgerPath, b: LedgerPath) => a.tick === b.tick && a.net === b.net && a.snap === b.snap;

export function syncLedgerPath(path: LedgerPath, prev: LedgerPathView, next: LedgerPathView): LedgerPath {
  if (next.following && !prev.following) {
    return path.selfResume ? { ...path, selfResume: false } : CLOSED_PATH;
  }
  const target = mirrored(next);
  const reboxed = next.boxed !== prev.boxed && metaSnapKey(next.metaSnap) === metaSnapKey(prev.metaSnap);
  if (target && reboxed) return samePath(path, target) ? path : { ...target, selfResume: path.selfResume };
  if (next.following) {
    if (target) return metaSnapKey(next.metaSnap) !== metaSnapKey(prev.metaSnap) ? { ...target, selfResume: path.selfResume } : path;
    const was = mirrored(prev);
    if (was && samePath(path, was)) return { ...CLOSED_PATH, selfResume: path.selfResume };
    return path;
  }
  const m = next.metaSnap;
  if (m && metaSnapKey(m) !== metaSnapKey(prev.metaSnap)) {
    const key = `${m.metaId}|${m.ordinal}`;
    return { tick: m.globalOrdinal, net: m.netKey, snap: path.snap === key ? key : null, selfResume: path.selfResume };
  }
  const ord = next.snapOrd;
  // On a new pin — a different tick, OR the same tick going from followed to pinned (pinning the
  // live tip changes no ordinal; review, 2026-10-04).
  const pinMoved = ord !== prev.snapOrd || prev.following;
  if (path.tick != null && ord != null && ord !== path.tick && pinMoved && !(m && m.globalOrdinal === ord)) {
    return { ...CLOSED_PATH, tick: ord, selfResume: path.selfResume };
  }
  return path;
}
