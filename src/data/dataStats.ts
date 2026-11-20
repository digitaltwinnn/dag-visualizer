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



/** LAST DATA BLOCK PER NETWORK (user, 2026-11-20: "'usual' makes little sense when we're on 'all' … just
 *  list each metagraph and their last block, if filtered just show that one"): for every network in
 *  scope that carried a data block in a READ tick of the window, the newest such tick's time — newest
 *  first. A network seen only in unread ticks is not listed (unknown, never "none"). */
export function lastDataByNetwork(
  ticks: readonly Tick[],
  reads: Reads,
  inScope: (metaId: string) => boolean,
  keyOf: (metaId: string) => string,
): { key: string; ts: string; ordinal: number }[] {
  const by = new Map<string, { ts: string; ordinal: number }>();
  for (const t of ticks) {
    const ex = reads[t.ordinal];
    if (!ex) continue;
    for (const r of ex.rows) {
      if (!inScope(r.metaId) || !((r.dataBlocks ?? 0) > 0)) continue;
      const k = keyOf(r.metaId);
      const cur = by.get(k);
      if (!cur || t.ordinal > cur.ordinal) by.set(k, { ts: t.timestamp, ordinal: t.ordinal });
    }
  }
  return [...by.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.ordinal - a.ordinal);
}

/** THE DATA BLOCKS WINDOW'S UNREAD SNAPSHOTS (user, 2026-11-20: "why it says 'at least'?" — the window
 *  holds 50 global snapshots and only the newest few were read on arrival, so every count was a floor
 *  for ~20 minutes and older tiles showed no data mark). The ordinals whose exact read is not held,
 *  newest first: what the bridge reads, a pool at a time, while the register is on screen. */
export function unreadOrdinals(ticks: readonly { ordinal: number }[], reads: Readonly<Record<number, unknown>>, missed: Readonly<Record<number, unknown>> = {}): number[] {
  // A MISSED read is not asked again here (review, 2026-11-20): its bounded retry owns it, and
  // re-asking every miss on every new tick turned a window the host no longer serves into up to 50
  // failing requests every ~28 s.
  return ticks.map((t) => t.ordinal).filter((o) => reads[o] == null && missed[o] == null).sort((a, b) => b - a);
}

/** THE WINDOW AS FAR AS ITS READS HAVE SETTLED (user, 2026-11-20: "i still see an 'at least' in the
 *  vitals" — every new global snapshot made every count a floor for the second or two its exact read
 *  was in flight). The ticks NEWER than the newest one whose read has landed or missed are still
 *  arriving, not unread: they join the window when their read settles. A tick at or below it whose
 *  read is absent is genuinely unread (it failed, or never asked), and still makes a floor (rule 10). */
export function settledTicks<T extends { ordinal: number }>(ticks: readonly T[], reads: Readonly<Record<number, unknown>>, missed: Readonly<Record<number, unknown>> = {}): T[] {
  let edge = -Infinity;
  for (const t of ticks) if ((reads[t.ordinal] != null || missed[t.ordinal] != null) && t.ordinal > edge) edge = t.ordinal;
  return ticks.filter((t) => t.ordinal <= edge);
}

/** DATA UPDATES AS A STACKED COLUMN PER GLOBAL SNAPSHOT (user, 2026-11-20: "vitals 'data updates'
 *  show as 'anchors by metagraph' chart?"): oldest first, each tick's in-scope data updates, split by
 *  network in `order` (then any network outside it). `v` null where the tick is unread (the same
 *  rule as every data sum: never a zero), and the segments sum to `v`. */
export function dataUpdatesStack(
  ticks: readonly Tick[],
  reads: Reads,
  inScope: (metaId: string) => boolean,
  keyOf: (metaId: string) => string,
  order: readonly string[],
): { ordinal: number; v: number | null; segs: { key: string; n: number }[] }[] {
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i < 0 ? order.length : i;
  };
  return [...ticks].sort((a, b) => a.ordinal - b.ordinal).map((t) => {
    const ex = reads[t.ordinal];
    const v = tickData(ex, inScope);
    if (v == null || !ex) return { ordinal: t.ordinal, v: null, segs: [] };
    const by = new Map<string, number>();
    for (const r of ex.rows) if (inScope(r.metaId) && (r.dataTxCount ?? 0) > 0) by.set(keyOf(r.metaId), (by.get(keyOf(r.metaId)) ?? 0) + r.dataTxCount!);
    const segs = [...by.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([key, n]) => ({ key, n }));
    return { ordinal: t.ordinal, v, segs };
  });
}
