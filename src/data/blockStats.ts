import { BLOCK_WINDOW_TICKS, type BlockTick } from "@/src/data/blockWindow";
import { blockReadOf } from "@/src/data/blockReads";
import type { BlockRead } from "@/src/engine/domain/blockBraid";

// THE BLOCKS REGISTER'S BAND READINGS — pure arithmetic over the block window and the held reads,
// so the cells stay a layout (design round D5, 2026-11-07: BLOCKS · MOVED · BY NETWORK · LAST
// BLOCK). The window lists ONLY block-bearing global snapshots, which is the whole honesty argument
// for the zeros below: an hour of the window's span with no tick in it held no block, because a tick
// that held one would be listed.
//
// THE FRAME: whole HOURS ending at the frame's end (now at the live edge, a pinned window's newest
// tick), back far enough to hold the window's oldest tick — at least one, at most `BLOCK_BINS_MAX`.
// A bin wholly older than a FULL (or cut) window's oldest tick is unknown, a gap (null), never a
// zero: the window stopped at its tick budget there. A window below its cap holds all history.

const HOUR_MS = 3_600_000;
/** The longest frame the sparklines bin, in hours (a quiet network's window reaches back weeks). */
export const BLOCK_BINS_MAX = 24 * 120;

/** Which blocks a reading counts, and whether the window may be short. `chain` is the window's own
 *  network (`BlockWindow.chain`: null every network, `dag` the global's own blocks, else that chain's
 *  token blocks) — under a network filter the window also holds the DAG blocks sharing its ticks,
 *  which are not that network's. `cut` is a window its walk stopped short of (`BlockWindow.partial`
 *  non-empty): like a FULL window, what lies before its oldest tick is unknown. */
export interface BlockScope {
  chain?: string | null;
  cut?: boolean;
}

/** THE WINDOW'S SCOPE (D4 carry, settled in D3): its own network, and whether it is CUT — only by
 *  the chain that DRIVES it. Under All every network drives the window, so any chain its walk cut
 *  short makes it short; under a network filter the window is that network's newest block ticks, so
 *  another chain's cut (it carries none of them) says nothing about it. */
export function blockScopeOf(w: { chain: string | null; partial: readonly string[] } | null): Required<BlockScope> {
  const chain = w?.chain ?? null;
  const partial = w?.partial ?? [];
  return { chain, cut: chain == null ? partial.length > 0 : partial.includes(chain) };
}

/** Every block one tick holds — the global's own (DAG) and the token blocks of each anchored
 *  snapshot — or, with `chain`, that network's alone. */
export function blocksInTick(t: BlockTick, chain: string | null = null): number {
  const token = (rows: BlockTick["metaSnaps"][string] | undefined) => (rows ?? []).reduce((n, r) => n + (r.blocks?.length ?? 0), 0);
  if (chain === "dag") return t.blocks.length;
  if (chain != null) return token(t.metaSnaps[chain]);
  let n = t.blocks.length;
  for (const rows of Object.values(t.metaSnaps)) n += token(rows);
  return n;
}

/** The frame's hour count and the window's oldest tick (null for no ticks). */
function frameOf(ticks: readonly BlockTick[], endMs: number, minBins: number): { n: number; oldest: number } | null {
  if (!ticks.length) return null;
  let oldest = Infinity;
  for (const t of ticks) oldest = Math.min(oldest, Date.parse(t.ts));
  const span = Math.max(0, endMs - oldest);
  return { n: Math.min(BLOCK_BINS_MAX, Math.max(minBins, 1, Math.ceil(span / HOUR_MS))), oldest };
}

/** Is the window short — FULL at its tick budget, or cut by its driving chain's walk? */
const isShort = (ticks: readonly BlockTick[], scope: BlockScope) => ticks.length >= BLOCK_WINDOW_TICKS || !!scope.cut;

/** The bin of a tick stamped `at` (oldest first), or -1 outside the frame. */
function binOf(at: number, endMs: number, n: number): number {
  const age = endMs - at;
  if (age < 0) return -1;
  const i = n - 1 - Math.floor(age / HOUR_MS);
  return i >= 0 ? i : -1;
}

/** Null every bin wholly older than a short window's oldest tick. */
function gapBeyondReach(out: (number | null)[], ticks: readonly BlockTick[], endMs: number, oldest: number, scope: BlockScope): void {
  if (!isShort(ticks, scope)) return;
  const n = out.length;
  // Bin i spans [end - (n - i) h, end - (n - 1 - i) h): known only from `oldest` on.
  for (let i = 0; i < n; i++) if (endMs - (n - 1 - i) * HOUR_MS <= oldest) out[i] = null;
}

/** BLOCKS: every block the window holds (DAG + token, or the scope's network's). `floor` is true
 *  exactly when the window is FULL (or `cut`) and its oldest tick is newer than an hour before the
 *  frame's end: it stopped at its tick budget, so what came before is unknown and the count is "at
 *  least". A window below its cap holds all history, so its count is complete. */
export function blocksInWindow(ticks: readonly BlockTick[], endMs: number, scope: BlockScope = {}): { count: number; floor: boolean } {
  let count = 0;
  let oldest = Infinity;
  for (const t of ticks) {
    oldest = Math.min(oldest, Date.parse(t.ts));
    count += blocksInTick(t, scope.chain ?? null);
  }
  return { count, floor: isShort(ticks, scope) && oldest > endMs - HOUR_MS };
}

/** The BLOCKS sparkline: blocks per hour across the window's span, OLDEST first (see the frame,
 *  above). `minBins` stretches the frame back past the window's own span. */
export function blocksPerHourBins(ticks: readonly BlockTick[], endMs: number, scope: BlockScope = {}, minBins = 1): (number | null)[] {
  const f = frameOf(ticks, endMs, minBins);
  if (!f) return [];
  const out: (number | null)[] = Array.from({ length: f.n }, () => 0);
  for (const t of ticks) {
    const i = binOf(Date.parse(t.ts), endMs, f.n);
    if (i >= 0) out[i] = (out[i] ?? 0) + blocksInTick(t, scope.chain ?? null);
  }
  gapBeyondReach(out, ticks, endMs, f.oldest, scope);
  return out;
}

/** WHOSE AMOUNT MOVED STATES: the window's network's own, in its own unit — the DAG's under All (a
 *  sum across tokens would add unlike units, so it is never stated) and under the DAG filter. */
export function movedChainOf(windowChain: string | null): string {
  return windowChain ?? "dag";
}

/** One chain's blocks in a tick, each with the ordinal of the snapshot that accepted it (the
 *  global's for a DAG block, the metagraph snapshot's for a token block — the read's key). */
function chainBlocks(t: BlockTick, chain: string): { hash: string; ordinal: number }[] {
  if (chain === "dag") return t.blocks.map((hash) => ({ hash, ordinal: t.ord }));
  const out: { hash: string; ordinal: number }[] = [];
  for (const r of t.metaSnaps[chain] ?? []) for (const hash of r.blocks ?? []) out.push({ hash, ordinal: r.ordinal });
  return out;
}

const transferSum = (b: BlockRead) => b.transfers.reduce((s, x) => s + x.amount, 0);

type Reads = Readonly<Record<string, { blocks: readonly BlockRead[] } | undefined>>;

/** MOVED: the sum of the transfer amounts of `chain`'s blocks in the window, from LANDED reads only
 *  — `read` of `total` blocks, so a pending or missed read is stated, never summed as nothing.
 *  Null while none of them has been read (nothing measured is not zero moved); 0 for a window
 *  holding none of the chain's blocks. */
export function movedInWindow(ticks: readonly BlockTick[], reads: Reads, chain: string): { amount: number | null; read: number; total: number } {
  let amount = 0;
  let read = 0;
  let total = 0;
  for (const t of ticks) {
    for (const b of chainBlocks(t, chain)) {
      total++;
      const r = blockReadOf(reads, { chain, ...b });
      if (!r) continue;
      read++;
      amount += transferSum(r);
    }
  }
  return { amount: total > 0 && read === 0 ? null : amount, read, total };
}

/** The MOVED sparkline: `chain`'s moved amount per hour on the BLOCKS frame, OLDEST first. An hour
 *  holding a block whose read has not landed is a gap (null) — a partial sum drawn whole reads as a
 *  dip; an hour holding none of the chain's blocks moved nothing. */
export function movedPerHourBins(ticks: readonly BlockTick[], reads: Reads, endMs: number, chain: string, scope: BlockScope = {}): (number | null)[] {
  const f = frameOf(ticks, endMs, 1);
  if (!f) return [];
  const out: (number | null)[] = Array.from({ length: f.n }, () => 0);
  for (const t of ticks) {
    const i = binOf(Date.parse(t.ts), endMs, f.n);
    if (i < 0) continue;
    for (const b of chainBlocks(t, chain)) {
      const r = blockReadOf(reads, { chain, ...b });
      if (!r) out[i] = null;
      else if (out[i] != null) out[i] = out[i]! + transferSum(r);
    }
  }
  gapBeyondReach(out, ticks, endMs, f.oldest, scope);
  return out;
}

/** BY NETWORK: the window's blocks per network — one row per network holding a block, the DAG first
 *  (always: its zero is a reading), then the catalog's `order`, never the counts' (a row that moves
 *  cannot be followed), a network outside the catalog after it. Under a filter, the filter's row. */
export function blocksByNetwork(ticks: readonly BlockTick[], windowChain: string | null, order: readonly string[]): { chain: string; count: number }[] {
  if (windowChain != null) return [{ chain: windowChain, count: ticks.reduce((n, t) => n + blocksInTick(t, windowChain), 0) }];
  const counts = new Map<string, number>([["dag", 0]]);
  for (const t of ticks) {
    counts.set("dag", counts.get("dag")! + t.blocks.length);
    for (const chain of Object.keys(t.metaSnaps)) {
      const n = blocksInTick(t, chain);
      if (n > 0) counts.set(chain, (counts.get(chain) ?? 0) + n);
    }
  }
  const rank = (c: string) => (c === "dag" ? -1 : order.includes(c) ? order.indexOf(c) : order.length);
  return [...counts].map(([chain, count]) => ({ chain, count })).sort((a, b) => rank(a.chain) - rank(b.chain));
}

/** LAST BLOCK: the stamp of the window's newest tick holding a block of `chain` (any network's
 *  under null), and whose block it is (the DAG's where the tick holds one). Null with none. */
export function lastBlockAt(ticks: readonly BlockTick[], chain: string | null = null): { ts: string; chain: string } | null {
  let best: BlockTick | null = null;
  for (const t of ticks) if (blocksInTick(t, chain) > 0 && (!best || t.ord > best.ord)) best = t;
  if (!best) return null;
  if (chain != null) return { ts: best.ts, chain };
  const which = best.blocks.length ? "dag" : Object.keys(best.metaSnaps).find((c) => blocksInTick(best!, c) > 0)!;
  return { ts: best.ts, chain: which };
}
