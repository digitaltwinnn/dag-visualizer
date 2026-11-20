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
    const rows = ex.rows.filter((r) => inScope(r.metaId));
    // A row the decoder could not read has an unknown count (review M3, `dataUpdatesOf`'s rule):
    // the tick is UNREAD — outside the sum and the read count — never a 0 for that snapshot.
    if (rows.some((r) => r.dataBlocks == null)) continue;
    read++;
    for (const r of rows) count += r.dataBlocks!;
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

/** THE DATA BLOCKS PER NETWORK (2026-11-20, the "Metagraphs writing data" card counts data blocks,
 *  the register switch's own count, where it repeated DATA UPDATES' total): the ticks
 *  `dataBlocksInWindow` reads — a tick holding an unreadable in-scope row adds to no network — busiest
 *  first, a network with none left out. Their sum is `dataBlocksInWindow`'s count. */
export function dataBlocksByNetwork(
  ticks: readonly Tick[],
  reads: Reads,
  inScope: (metaId: string) => boolean,
  keyOf: (metaId: string) => string,
): { key: string; count: number }[] {
  const by = new Map<string, number>();
  for (const t of ticks) {
    const ex = reads[t.ordinal];
    if (!ex) continue;
    const rows = ex.rows.filter((r) => inScope(r.metaId));
    if (rows.some((r) => r.dataBlocks == null)) continue;
    for (const r of rows) if (r.dataBlocks! > 0) by.set(keyOf(r.metaId), (by.get(keyOf(r.metaId)) ?? 0) + r.dataBlocks!);
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
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

/** THE INSTANTS OF THE READ TICKS THAT CARRIED DATA in scope — LAST DATA BLOCK's usual gap is measured
 *  over them (`blockStats.usualGap`, 2026-11-20). An unread tick is no instant: it is not known to
 *  have carried data, so it neither starts nor ends a gap. */
export function dataTickTimes(ticks: readonly Tick[], reads: Reads, inScope: (metaId: string) => boolean): number[] {
  const out: number[] = [];
  for (const t of ticks) {
    const ex = reads[t.ordinal];
    if (ex && ex.rows.some((r) => inScope(r.metaId) && (r.dataBlocks ?? 0) > 0)) out.push(Date.parse(t.timestamp));
  }
  return out;
}
