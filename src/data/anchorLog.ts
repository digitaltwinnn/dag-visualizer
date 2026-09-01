import type { MetaSnapRecord } from "@/src/data/api";
import type { GlobalSnapshot } from "@/src/data/types";
import { ledgerLens } from "@/src/data/ledgerStory";

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
  /** ⚠️ NULL on a SEAM — a global tick that anchored nothing (see buildAnchorLog). Every consumer
   *  must handle it: there is no metagraph, no metagraph snapshot, and nothing selectable but the
   *  global tick itself. */
  metaId: string | null;
  ordinal: number; // the METAGRAPH snapshot's own ordinal — 0 on a seam, which has none
  hash: string;
  fee: number; // datum
  sizeInKB: number;
  ts: string;
  global: GlobalSnapshot; // the anchoring global snapshot (the row's click target)
}

export function buildAnchorLog(
  metaSnaps: ReadonlyMap<string, MetaSnapRecord[]>,
  globalSnapshots: readonly GlobalSnapshot[],
  filter: string, // "all" | "dag" | metagraph id — dag reads as all (ledgerLens: every global
  // tick IS a DAG snapshot, so the base ledger's log is the whole log; user, 2026-08-13)
): AnchorLogRow[] {
  const f = ledgerLens(filter);
  const byTs = new Map(globalSnapshots.map((g) => [g.timestamp, g]));
  const rows: AnchorLogRow[] = [];
  for (const [metaId, recs] of metaSnaps) {
    if (f !== "all" && f !== metaId) continue;
    for (const rec of recs) {
      const global = byTs.get(rec.ts);
      if (!global) continue;
      rows.push({ metaId, ordinal: rec.ordinal, hash: rec.hash, fee: rec.fee, sizeInKB: rec.sizeInKB, ts: rec.ts, global });
    }
  }
  // ⚠️ SEAMS — the ticks that anchored NOTHING (user, 2026-09-01: "what should we do for a global
  // snapshot that had no anchors? … it should appear but just without any network attached").
  //
  // The scene has always drawn these: a measured tick with no anchors is the SEAM, standing at full
  // height because it is a MEASUREMENT, not an absence of one (src/engine/scene/CLAUDE.md). The log
  // had no equivalent, so a reader scanning it saw the tick column skip values with no way to tell
  // a quiet tick from one the window simply never carried — and those mean opposite things.
  //
  // ⚠️ WINDOW MODE ONLY, and structurally so. Under a committed network this table pages THAT
  // network's own chain server-side, and a global it never anchored into is not in that chain at
  // all — there is no row to page to. That path never reaches this builder; it answers the same
  // question in words instead ("X did not anchor into global snapshot N").
  //
  // A seam carries the TICK's own identity and age, and ZERO for the metagraph measures, because a
  // fee and a size are what a metagraph snapshot paid and occupied — and there is no metagraph
  // snapshot here. The table renders both metagraph columns as an em-dash; see its seam branch.
  //
  // ⚠️ AND THE GATE IS `f === "all"`, ENFORCED HERE. A committed metagraph's log is THAT metagraph's
  // chain, and a tick it never anchored into is not a quiet row in that chain — it is not in it at
  // all. Appending one would answer "did DED anchor into N?" with a row that looks like DED's,
  // which is the opposite of what a seam exists to say. The `dag` lens resolves to `all` (every
  // global tick IS a DAG snapshot), so the base ledger keeps its seams.
  if (f === "all") {
    const anchored = new Set(rows.map((r) => r.ts));
    for (const g of globalSnapshots) {
      if (anchored.has(g.timestamp)) continue;
      rows.push({ metaId: null, ordinal: 0, hash: g.hash, fee: 0, sizeInKB: 0, ts: g.timestamp, global: g });
    }
  }
  // ISO-8601 timestamps sort lexicographically; newest tick first, then ordinal desc within it.
  rows.sort((a, b) => (a.ts === b.ts ? b.ordinal - a.ordinal : a.ts < b.ts ? 1 : -1));
  return rows;
}

/** The anchor log's sortable axes (user, 2026-08-13 — the roster sorts, the log didn't).
 *  `net` compares the DISPLAYED name via the caller's resolver — the roster's own lesson
 *  (2026-08-13): sorting the metaId orders hidden hex. Numbers compare numerically; the
 *  default order stays the log's chronological construction (ts desc, ordinal desc within),
 *  which is `age` ascending. */
export type AnchorLogSortKey = "net" | "ordinal" | "fee" | "size" | "tick" | "age";

export function sortAnchorLog(
  rows: readonly AnchorLogRow[],
  key: AnchorLogSortKey,
  dir: 1 | -1,
  nameOf: (metaId: string) => string,
): AnchorLogRow[] {
  const num = (f: (r: AnchorLogRow) => number) => (a: AnchorLogRow, b: AnchorLogRow) => (f(a) - f(b)) * dir;
  const cmp =
    key === "net"
      // A SEAM has no network, so it sorts as the empty string — grouping every no-anchor tick at
      // one end of the NETWORK axis rather than scattering them under whatever `nameOf` would
      // invent for a null.
      ? (a: AnchorLogRow, b: AnchorLogRow) =>
          (a.metaId ? nameOf(a.metaId) : "").localeCompare(b.metaId ? nameOf(b.metaId) : "") * dir
      : key === "ordinal"
        ? num((r) => r.ordinal)
        : key === "fee"
          ? num((r) => r.fee)
          : key === "size"
            ? num((r) => r.sizeInKB)
            : key === "tick"
              ? num((r) => r.global.ordinal)
              : // age ascending = newest first, the log's resting order
                (a: AnchorLogRow, b: AnchorLogRow) => (a.ts === b.ts ? b.ordinal - a.ordinal : a.ts < b.ts ? 1 : -1) * dir;
  return [...rows].sort(cmp);
}

/** The UNLISTED channels' log rows (2026-08-07): the polled buffers only track the public
 *  catalog, so the EXACT reads are the only honest source. One row per uncataloged channel
 *  snapshot in the measured window — `metaId` is the raw state-channel ADDRESS (hash unknown),
 *  same shape as the listed rows so every consumer renders them identically. */
/** A row that is definitely NOT a seam. Every unlisted row is built from a real channel address,
 *  so the builder below states that in its type rather than making each consumer re-prove it. */
export type ChannelLogRow = AnchorLogRow & { metaId: string };

export function buildUnlistedLog(
  globalSnapshots: readonly GlobalSnapshot[],
  exactByOrdinal: Readonly<Record<number, { rows?: readonly { metaId: string; ordinal: number; fee: number; bytes: number }[] } | undefined>>,
  listedIds: ReadonlySet<string>,
): ChannelLogRow[] {
  const rows: ChannelLogRow[] = [];
  for (const g of globalSnapshots) {
    const ex = exactByOrdinal[g.ordinal];
    if (!ex?.rows) continue;
    for (const r of ex.rows) {
      if (listedIds.has(r.metaId)) continue;
      rows.push({ metaId: r.metaId, ordinal: r.ordinal, hash: "", fee: r.fee, sizeInKB: r.bytes / 1024, ts: g.timestamp, global: g });
    }
  }
  rows.sort((a, b) => (a.ts === b.ts ? b.ordinal - a.ordinal : a.ts < b.ts ? 1 : -1));
  return rows;
}
