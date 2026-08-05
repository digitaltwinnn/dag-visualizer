import type { MetaSnapRecord } from "@/src/data/api";
import type { GlobalSnapshot } from "@/src/data/types";

/** The metagraph snapshots one metagraph anchored into ONE global tick, oldest first.
 *  This is what makes a ledger tile identifiable without a fetch (spec §6.1): the 4s poll already
 *  stamps every metagraph snapshot with the timestamp of the global it anchored into, so the tile
 *  the upper floor draws can name its own snapshot. A tick older than the polled buffer yields an
 *  empty list — an ANONYMOUS tile: drawn, because it happened, but not pickable. */
export function snapsAtTick(
  metaSnaps: ReadonlyMap<string, MetaSnapRecord[]>,
  metaId: string,
  ts: string,
): MetaSnapRecord[] {
  const recs = metaSnaps.get(metaId);
  if (!recs) return [];
  return recs.filter((r) => r.ts === ts);
}

// One row of the ledger data table (spec 2026-08-01): a single METAGRAPH snapshot, joined to
// the global tick it anchored into (the record's ts IS the anchoring global timestamp — the
// exact join api.ts's anchorIndex uses). Pure over the NetworkData buffers so it's testable;
// the hook in AnchorLogTable feeds it live. Rows outside the retained global window are
// dropped — a row must always resolve to a clickable GlobalSnapshot.
export interface AnchorLogRow {
  metaId: string;
  ordinal: number; // the METAGRAPH snapshot's own ordinal
  hash: string;
  fee: number; // datum
  sizeInKB: number;
  ts: string;
  global: GlobalSnapshot; // the anchoring global snapshot (the row's click target)
}

export function buildAnchorLog(
  metaSnaps: ReadonlyMap<string, MetaSnapRecord[]>,
  globalSnapshots: readonly GlobalSnapshot[],
  filter: string, // "all" | "dag" | metagraph id — dag has no metagraph snapshots → empty
): AnchorLogRow[] {
  const byTs = new Map(globalSnapshots.map((g) => [g.timestamp, g]));
  const rows: AnchorLogRow[] = [];
  for (const [metaId, recs] of metaSnaps) {
    if (filter !== "all" && filter !== metaId) continue;
    for (const rec of recs) {
      const global = byTs.get(rec.ts);
      if (!global) continue;
      rows.push({ metaId, ordinal: rec.ordinal, hash: rec.hash, fee: rec.fee, sizeInKB: rec.sizeInKB, ts: rec.ts, global });
    }
  }
  // ISO-8601 timestamps sort lexicographically; newest tick first, then ordinal desc within it.
  rows.sort((a, b) => (a.ts === b.ts ? b.ordinal - a.ordinal : a.ts < b.ts ? 1 : -1));
  return rows;
}
