import { metaSnapRecord, type MetaSnapRecord } from "@/src/data/api";
import type { LedgerSource } from "@/src/data/ledgerSourceType";
import type { Anchor, BlockSel, GlobalSnapshot, RawMetaSnapshot, SnapshotExact, MetaSnapSel } from "@/src/data/types";
import type { LedgerRegister } from "@/src/store/mode";
import { readsBlockWindow } from "@/src/engine/domain/viewPolicy";
import { UNLISTED_ID } from "@/src/data/unlistedId";

// THE BLOCKS REGISTER'S LEDGER SOURCE: a window of only the global snapshots that hold a block
// somewhere (a DAG block, or an anchored metagraph snapshot carrying token blocks). It answers the
// live buffer's own questions in its own shapes — globals oldest → newest, each chain's records,
// `getAnchor(ts)` — so the chamber draws it like any other source. Pure: the route's answer comes
// in, the window goes out; `components/` owns the fetch.

/** One global snapshot that holds a block, with the block-bearing metagraph snapshots anchored into it. */
export interface BlockTick {
  ord: number;
  ts: string;
  hash: string;
  /** The global's own (DAG) block hashes. */
  blocks: string[];
  /** Block-bearing metagraph snapshots anchored into it, by chain id. */
  metaSnaps: Record<string, RawMetaSnapshot[]>;
}

/** The route's answer, newest tick first. */
export interface BlockWindowAnswer {
  ticks: BlockTick[];
  chains: string[];
  /** The window asked for lies deeper than the trail can walk: no ticks, and not a failure. */
  beyond?: true;
  /** The network the window was read for (the filter's; absent: every network). */
  chain?: string;
  /** Token chains whose walk was cut by its page cap: their older blocks are not reached (rule 10). */
  partial?: string[];
  /** The ordinal the window was asked around (absent or null: the live edge) — stamped by the bridge
   *  on the answer it holds, so a refold keeps it (the route does not echo it). */
  around?: number | null;
}

export interface BlockWindow extends LedgerSource {
  ticks: BlockTick[];
  /** The network the window was read for; null: every network. */
  chain: string | null;
  /** The ordinal the window was read AROUND; null: it is the live edge's (review M1). Its own
   *  provenance — the follow, the front run and a failed read ask THIS, never the request in flight,
   *  which can say "live" while a pinned window is still the one held. */
  around: number | null;
  /** The chains whose walk was cut short by its page cap (current ids). */
  partial: string[];
  from: number;
  to: number;
  /** Does the window hold this global snapshot? */
  holds(ordinal: number): boolean;
  blockTick(ord: number): BlockTick | null;
}

/** Ticks a block window holds (matches the live buffer's 52). */
export const BLOCK_WINDOW_TICKS = 52;

/** A LIVE REFRESH NEVER MOVES THE WINDOW BACKWARD. The route's edge cache and the explorer's lagging
 *  index can answer with a trail older than a tick the bridge already holds (appended from the live
 *  feed, or from an earlier answer): the held ticks newer than the answer's newest survive, unique by
 *  `ord`, newest first, cut to the window. Only for `around=live` refreshes — a pinned answer replaces. */
export function mergeLiveAnswer(held: BlockWindowAnswer | null, answer: BlockWindowAnswer): BlockWindowAnswer {
  if (!held || !held.ticks.length) return answer;
  // Another network's window is replaced, never merged: its ticks are not this one's.
  if ((held.chain ?? null) !== (answer.chain ?? null)) return answer;
  const newest = answer.ticks.reduce((m, t) => Math.max(m, t.ord), -Infinity);
  const kept = held.ticks.filter((t) => t.ord > newest && !answer.ticks.some((a) => a.ord === t.ord));
  if (!kept.length) return answer;
  const ticks = [...kept, ...answer.ticks].sort((a, b) => b.ord - a.ord).slice(0, BLOCK_WINDOW_TICKS);
  return { ...answer, ticks };
}

/** The window as a ledger source, oldest → newest. A tick's anchor reads the exact fold where it has
 *  landed; otherwise it is the FLOOR folded from the tick's block-bearing snapshots (a chain with none
 *  here contributes nothing; `touched` 0 — a settled past).
 *
 *  A window read for a METAGRAPH holds that network's blocks ONLY (design round D8, user: "If we
 *  filter on a metagraph, does it make sense to show the DAG blocks? They are unrelated right"): the
 *  trail may carry the DAG blocks its ticks also accepted, and the fold drops them, so no surface that
 *  reads the window — the chamber, the explorer, RAW, the band — states a DAG block there. A window
 *  read for the DAG, or for every network, keeps them. */
export function foldBlockWindow(answer: BlockWindowAnswer, exact: Readonly<Record<number, SnapshotExact>>): BlockWindow {
  const metagraph = answer.chain != null && answer.chain !== "dag";
  const ticks = [...answer.ticks]
    .map((t) => (metagraph && t.blocks.length ? { ...t, blocks: [] } : t))
    .filter((t) => t.blocks.length || Object.values(t.metaSnaps).some((rows) => rows.length))
    .sort((a, b) => a.ord - b.ord);
  const globalSnapshots: GlobalSnapshot[] = ticks.map((t) => ({ ordinal: t.ord, timestamp: t.ts, hash: t.hash, blocks: t.blocks }));
  const metaSnaps = new Map<string, MetaSnapRecord[]>();
  const anchors = new Map<string, Anchor>();
  const byOrd = new Map<number, BlockTick>();
  for (const t of ticks) {
    byOrd.set(t.ord, t);
    const a: Anchor = { fee: 0, count: 0, metaIds: new Set<string>(), metaCounts: new Map<string, number>(), touched: 0 };
    for (const [id, rows] of Object.entries(t.metaSnaps)) {
      if (!rows.length) continue;
      const list = metaSnaps.get(id) ?? [];
      for (const r of rows) {
        // A metagraph snapshot is stamped with its anchoring global's timestamp: the tick's.
        const rec = { ...metaSnapRecord(r), ts: t.ts };
        list.push(rec);
        a.fee += rec.fee;
      }
      metaSnaps.set(id, list);
      a.metaIds.add(id);
      a.metaCounts.set(id, rows.length);
      a.count += rows.length;
    }
    const e = exact[t.ord]?.perMeta;
    if (e) {
      a.fee = 0;
      a.count = 0;
      a.metaIds = new Set<string>();
      a.metaCounts = new Map<string, number>();
      for (const [id, m] of Object.entries(e)) {
        a.fee += m.fee;
        a.count += m.count;
        a.metaIds.add(id);
        a.metaCounts.set(id, m.count);
      }
    }
    anchors.set(t.ts, a);
  }
  for (const list of metaSnaps.values()) list.sort((x, y) => x.ts.localeCompare(y.ts) || x.ordinal - y.ordinal);
  const from = ticks[0]?.ord ?? 0;
  const to = ticks[ticks.length - 1]?.ord ?? 0;
  return {
    ticks,
    chain: answer.chain ?? null,
    around: answer.around ?? null,
    partial: answer.partial ?? [],
    from,
    to,
    globalSnapshots,
    metaSnaps,
    unlistedSnaps: new Map(),
    getAnchor: (ts) => anchors.get(ts) ?? null,
    holds: (ordinal) => byOrd.has(ordinal),
    blockTick: (ord) => byOrd.get(ord) ?? null,
  };
}

/** THE NETWORK THE WINDOW IS READ FOR: the top bar's committed filter — null under All, else its
 *  id (`dag`, a listed network, or the unlisted set, which `blockWanted` answers as not read). Under
 *  a network filter the window is THAT network's newest block ticks, reaching back as far as its
 *  walk goes, and — for a metagraph — its blocks alone (`foldBlockWindow` drops the DAG's). */
export function blockChainOf(filter: string): string | null {
  return filter === "all" ? null : filter;
}

/** The trail route's path for a window around `around` (null: the live edge) of `chain` (null: every network). */
export function trailPath(around: number | null, chain: string | null): string {
  return `/api/blocks/trail?around=${around ?? "live"}&n=${BLOCK_WINDOW_TICKS}${chain != null ? `&chain=${encodeURIComponent(chain)}` : ""}`;
}

/** Does a tick the live feed announces join the window? Its blocks are the global's own (DAG)
 *  blocks, so only a window that holds the DAG's ticks — every network's, or the DAG's — takes it;
 *  under a token network's filter it would put a tick that network is not in at the front. */
export function tipJoins(chain: string | null): boolean {
  return chain == null || chain === "dag";
}

/** What the Blocks register wants of its window: none, the one it holds, one around the pin
 *  (`around` null = the live edge), or — under an unlisted filter — NONE READ, the stated floor
 *  (`unread`: the trail reads the listed transfer lists only). Entering the Snapshots VIEW fetches
 *  (D3, 2026-11-07: the register switch on the scene states the Blocks span from the Snapshots
 *  register too, so there the live window is read and held, a pin never re-centring it); a pin
 *  the held range covers keeps, and only a window read for the SAME network (`chain`, `held.chain`)
 *  is held, so a filter change refetches. The window is only held outside the register, which
 *  reads the live buffer there. */
export function blockWanted(s: {
  ledger: boolean;
  register: LedgerRegister;
  pin: number | null;
  held: { from: number; to: number; chain?: string | null; around?: number | null } | null;
  liveNewest: number | null;
  chain?: string | null;
}): { kind: "clear" } | { kind: "keep" } | { kind: "unread" } | { kind: "fetch"; around: number | null } {
  const chain = s.chain ?? null;
  if (!s.ledger) return { kind: "clear" };
  if (chain === UNLISTED_ID) return { kind: "unread" };
  const held = s.held && (s.held.chain ?? null) === chain ? s.held : null;
  // The Snapshots register (D3: the register switch on the scene names the Blocks
  // register's span from either side) wants the window the register would open on — held, else
  // the live edge; only the Blocks register re-centres it on a pin.
  if (!readsBlockWindow(s.register)) return held ? { kind: "keep" } : { kind: "fetch", around: null };
  if (s.pin == null) return held ? { kind: "keep" } : { kind: "fetch", around: null };
  if (held && s.pin >= held.from && s.pin <= held.to) return { kind: "keep" };
  // A pin NEWER than the held LIVE window's newest block tick lies in the live edge's silence (the
  // front run), not in the past: the live window holds it (review I1 — a pin seconds old carried
  // into Transaction blocks must not read as "a past time").
  if (held && (held.around ?? null) == null && s.pin > held.to) return { kind: "keep" };
  return { kind: "fetch", around: s.pin };
}

/** DOES THE LIVE WINDOW KEEP MOVING — the bridge's 30 s refresh (`mergeLiveAnswer`) and its
 *  live-tip append? While the register wants the live window: following, or
 *  under a pin the held LIVE window covers (`heldLive`: the window held was asked for as "live",
 *  and `blockWanted` keeps it for that pin). The band is the live instrument, so a block or tick
 *  clicked inside the live window never freezes it (the Snapshots register's own rule: a pin never
 *  freezes the band). A pin newer than its newest tick is in the live edge's silence and keeps it
 *  moving too (`blockWanted` keeps the live window for it). A pin older than it is a past window
 *  (`blockWanted` fetches around the pin), and that window holds still. */
export function liveWindowRuns(s: {
  liveWanted: boolean;
  following: boolean;
  pin: number | null;
  held: { from: number; to: number } | null;
  heldLive: boolean;
}): boolean {
  if (!s.liveWanted) return false;
  if (s.following) return true;
  return s.pin != null && s.heldLive && s.held != null && s.pin >= s.held.from;
}

/** HOW OFTEN THE LIVE WINDOW IS READ AGAIN (review M3). Inside Transaction blocks the window is what the register draws: every 30 s. In the other
 *  registers only the switch's span reads it, and that needs only the window's reach, which moves
 *  about once a block tick: every 5 minutes. The live feed's announced tick still joins at once. */
export const BLOCK_REFRESH_MS = { drawn: 30_000, span: 5 * 60_000 } as const;
export function blockRefreshMs(register: LedgerRegister): number {
  return readsBlockWindow(register) ? BLOCK_REFRESH_MS.drawn : BLOCK_REFRESH_MS.span;
}

/** A READ THAT SPENT ITS RETRIES: does the held window stay drawn (review M2)? Only when it IS the
 *  live window of the network that was asked — the live edge keeps what it holds and tries again on
 *  its next refresh. A failed pinned read clears (a window that lacks the pin would lie), and so does
 *  a held window read for ANOTHER network (a filter's failed refetch: that network's numbers under
 *  this filter would be a false statement) or around a pin (a failed resume). */
export function failedReadKeeps(held: { chain: string | null; around: number | null } | null, asked: { around: number | null; chain: string | null }): boolean {
  if (!held || asked.around != null) return false;
  return held.chain === asked.chain && held.around == null;
}

/** WHICH CARD CARRIES LIVE / PINNED in the Snapshots view (review I1). In Transaction blocks live
 *  follows the newest block, so while a Block card stands IT carries the control and the Global
 *  snapshot card only its age; with no Block card (a pin carried in from another register, the
 *  block's ×, a re-click releasing it) the Global card carries it again — else nothing on the
 *  scene layer would say PINNED or offer LIVE. Every other register: the Global card. */
export function liveControlCard(register: LedgerRegister, block: BlockSel | null): "snapshot" | "block" {
  return readsBlockWindow(register) && block != null ? "block" : "snapshot";
}

/** Does `w` CONTINUE the window whose newest tick was `prevTo`, so the chamber advances its trail
 *  rather than re-seeding it? Only when it still holds that tick and has at most one newer: the
 *  chamber's model slides one slot per new lead, exactly as the live buffer gains a tick. Any other
 *  change — the first window, none, a re-centred pin, a jump of several ticks — is another stretch
 *  of the chain, and the chamber starts a fresh history for it (the past window's own rule). */
export function blockWindowContinues(prevTo: number | null, w: BlockWindow | null): boolean {
  if (prevTo == null || !w || !w.holds(prevTo)) return false;
  let newer = 0;
  for (const t of w.ticks) if (t.ord > prevTo) newer++;
  return newer <= 1;
}

/** One block of the window, on its accepting snapshot: `ordinal` is that snapshot's own (the
 *  global's for a DAG block, the metagraph snapshot's for a token block), `anchorOrd` and `ts` the
 *  global tick that carries it. The `BlockSel` shape plus the tick's time. */
export interface WindowBlock {
  chain: string;
  hash: string;
  ordinal: number;
  anchorOrd: number;
  ts: string;
}

/** EVERY BLOCK THE WINDOW HOLDS, NEWEST FIRST — the Blocks register's explorer list. Newest tick
 *  first; inside a tick its own DAG blocks in the feed's order, then each chain's token blocks,
 *  newest snapshot first. A snapshot with no blocks lists nothing. */
export function windowBlocks(w: BlockWindow | null): WindowBlock[] {
  if (!w) return [];
  const out: WindowBlock[] = [];
  for (const t of [...w.ticks].sort((a, b) => b.ord - a.ord)) {
    for (const hash of t.blocks) out.push({ chain: "dag", hash, ordinal: t.ord, anchorOrd: t.ord, ts: t.ts });
    for (const [chain, rows] of Object.entries(t.metaSnaps)) {
      for (const r of [...rows].sort((a, b) => b.ordinal - a.ordinal)) {
        for (const hash of r.blocks ?? []) out.push({ chain, hash, ordinal: r.ordinal, anchorOrd: t.ord, ts: t.ts });
      }
    }
  }
  return out;
}

/** THE METAGRAPH SNAPSHOT THAT ACCEPTED A TOKEN BLOCK, as the window names it (user, 2026-11-07: a
 *  block click commits its snapshot too, so the rail reads Metagraph → Metagraph snapshot → Block
 *  with the block the box). Null for a DAG block — its accepting snapshot is the global itself — and
 *  for a block the window does not hold. */
export function blockMetaSnap(w: BlockWindow | null, b: { chain: string; ordinal: number; anchorOrd: number }): MetaSnapSel | null {
  if (b.chain === "dag") return null;
  const t = w?.blockTick(b.anchorOrd);
  const row = t?.metaSnaps[b.chain]?.find((r) => r.ordinal === b.ordinal);
  if (!t || !row) return null;
  return { metaId: b.chain, ordinal: row.ordinal, hash: row.hash, globalOrdinal: t.ord, ts: t.ts };
}

/** WHAT LIVE FOLLOWS IN THE BLOCKS REGISTER (D3, user 2026-11-07: "live mode should be applied to
 *  the block and not the snapshot"): the window's NEWEST block of the network it was read for — any
 *  chain's under All, the DAG's under the DAG filter, else that network's own (the DAG blocks its
 *  ticks carry stay in its window, dimmed by the lens, but they are not what the reader follows).
 *  Null with no window, or none of its network's blocks in it. */
export function newestBlock(w: BlockWindow | null): WindowBlock | null {
  for (const b of windowBlocks(w)) if (w!.chain == null || b.chain === w!.chain) return b;
  return null;
}
