import type { SnapshotExact } from "@/src/data/types";
import { dataUpdatesOf } from "@/src/data/ledgerMeasure";

// THE DATA BLOCKS REGISTER'S BAND READINGS (D6, 2026-11-07) — pure arithmetic over the ticks the
// LEDGER SOURCE holds (the live buffer or a past window: the register reads the Metagraph snapshots
// register's own source, never the block window) and their exact reads, so the cells stay a layout:
// DATA UPDATES · BY NETWORK · LAST DATA BLOCK.
//
// The counts are each anchored snapshot's `dataTxCount` (`app/api/snapshot/exactRow.ts`) — the data
// transactions its data blocks carry. Honesty (rule 10): a tick whose exact read has not landed is
// UNKNOWN — a gap in the per-tick line, and outside the "read" count the lead states its floor by —
// never a zero. So is a tick holding an in-scope snapshot the decoder could not read: its count is
// unknown (`ledgerMeasure.dataUpdatesOf`, the one home of that rule), so the tick reads as unread.
//
// `inScope` is the filter's lens as a predicate over a row's address (the caller's, so the module
// stays pure): every network under All, one network's addresses under its filter.

type Tick = { ordinal: number; timestamp: string };
type Reads = Readonly<Record<number, SnapshotExact | undefined>>;

/** One tick's in-scope data updates, or undefined: not read, or an in-scope row undecodable. */
function tickData(ex: SnapshotExact | undefined, inScope: (metaId: string) => boolean): number | undefined {
  return ex ? dataUpdatesOf(ex.rows.filter((r) => inScope(r.metaId))) : undefined;
}

/** DATA UPDATES — the window's data updates over the ticks read, and how many of its ticks were. */
export function dataInWindow(ticks: readonly Tick[], reads: Reads, inScope: (metaId: string) => boolean): { count: number; read: number; total: number } {
  let count = 0;
  let read = 0;
  for (const t of ticks) {
    const n = tickData(reads[t.ordinal], inScope);
    if (n == null) continue;
    read++;
    count += n;
  }
  return { count, read, total: ticks.length };
}

/** DATA BLOCKS in the window — the count of data blocks over the ticks read, and how many of its
 *  ticks were (the register switch's count, user 2026-11-07: "data blocks, count those"). An unread
 *  tick adds nothing and is outside `read`, so a caller states the floor while reads are landing. */
export function dataBlocksInWindow(ticks: readonly Tick[], reads: Reads, inScope: (metaId: string) => boolean): { count: number; read: number; total: number } {
  let count = 0;
  let read = 0;
  for (const t of ticks) {
    const ex = reads[t.ordinal];
    if (!ex) continue;
    read++;
    for (const r of ex.rows) if (inScope(r.metaId)) count += r.dataBlocks ?? 0;
  }
  return { count, read, total: ticks.length };
}

/** The line under it: one point per tick, oldest first — the window spans minutes, so a tick is its
 *  natural bin — and null where the tick's read has not landed. */
export function dataPerTick(ticks: readonly Tick[], reads: Reads, inScope: (metaId: string) => boolean): (number | null)[] {
  return ticks.map((t) => tickData(reads[t.ordinal], inScope) ?? null);
}

/** BY NETWORK — the window's data updates per network (`keyOf` folds an address to its network's
 *  key), in `order` and then any network outside it, leaving out a network with none. It reads the
 *  ticks DATA UPDATES reads (`inScope`, the same lens): an unread tick adds to no network, so the
 *  bars never sum past the lead. */
export function dataByNetwork(
  ticks: readonly Tick[],
  reads: Reads,
  inScope: (metaId: string) => boolean,
  keyOf: (metaId: string) => string,
  order: readonly string[],
): { key: string; count: number }[] {
  const by = new Map<string, number>();
  for (const t of ticks) {
    const ex = reads[t.ordinal];
    if (tickData(ex, inScope) == null) continue;
    for (const r of ex!.rows) {
      if (!inScope(r.metaId)) continue;
      const n = r.dataTxCount!;
      if (n <= 0) continue;
      const k = keyOf(r.metaId);
      by.set(k, (by.get(k) ?? 0) + n);
    }
  }
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i < 0 ? order.length : i;
  };
  return [...by.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([key, count]) => ({ key, count }));
}

/** LAST DATA BLOCK — the newest read tick holding an in-scope snapshot that carried data blocks, and
 *  whose snapshot it was; null when the window read holds none. */
export function lastDataTick(ticks: readonly Tick[], reads: Reads, inScope: (metaId: string) => boolean): { ordinal: number; ts: string; metaId: string } | null {
  for (let i = ticks.length - 1; i >= 0; i--) {
    const t = ticks[i]!;
    const hit = reads[t.ordinal]?.rows.find((r) => inScope(r.metaId) && (r.dataBlocks ?? 0) > 0);
    if (hit) return { ordinal: t.ordinal, ts: t.timestamp, metaId: hit.metaId };
  }
  return null;
}
