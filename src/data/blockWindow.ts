import { metaSnapRecord, type MetaSnapRecord } from "@/src/data/api";
import type { LedgerSource } from "@/src/data/ledgerSourceType";
import type { Anchor, GlobalSnapshot, RawMetaSnapshot, SnapshotExact } from "@/src/data/types";
import type { LedgerRegister } from "@/src/store/mode";

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
}

export interface BlockWindow extends LedgerSource {
  ticks: BlockTick[];
  from: number;
  to: number;
  /** Does the window hold this global snapshot? */
  holds(ordinal: number): boolean;
  blockTick(ord: number): BlockTick | null;
}

/** Ticks a block window holds (matches the live buffer's 52). */
export const BLOCK_WINDOW_TICKS = 52;

/** The window as a ledger source, oldest → newest. A tick's anchor reads the exact fold where it has
 *  landed; otherwise it is the FLOOR folded from the tick's block-bearing snapshots (a chain with none
 *  here contributes nothing; `touched` 0 — a settled past). */
export function foldBlockWindow(answer: BlockWindowAnswer, exact: Readonly<Record<number, SnapshotExact>>): BlockWindow {
  const ticks = [...answer.ticks].sort((a, b) => a.ord - b.ord);
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

/** What the Blocks register wants of its window: none, the one it holds, or one around the pin
 *  (`around` null = the live edge). Entering the register fetches; a pin the held range covers keeps. */
export function blockWanted(s: {
  ledger: boolean;
  register: LedgerRegister;
  pin: number | null;
  held: { from: number; to: number } | null;
  liveNewest: number | null;
}): { kind: "clear" } | { kind: "keep" } | { kind: "fetch"; around: number | null } {
  if (!s.ledger || s.register !== "blocks") return { kind: "clear" };
  if (s.pin == null) return s.held ? { kind: "keep" } : { kind: "fetch", around: null };
  if (s.held && s.pin >= s.held.from && s.pin <= s.held.to) return { kind: "keep" };
  return { kind: "fetch", around: s.pin };
}
