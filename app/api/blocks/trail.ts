import type { BlockTick, BlockWindowAnswer } from "@/src/data/blockWindow";
import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";

// THE BLOCK TRAIL (the Blocks register of the Snapshots view): the newest `n` global snapshots that
// hold a block somewhere — a DAG block, or an anchored metagraph snapshot carrying token blocks.
// The explorer's TRANSFER lists are the index: a block with transfers is a row, so each list is
// paged from its tip and a row names its block and its tick (the DAG's `snapshotOrdinal` IS the
// global; a token row carries `globalSnapshotOrdinal`). The ticks' own records are then read for
// their timestamp and hash, and each block-bearing metagraph snapshot for its record.
//
// ⚠️ A transfer list's cursor is a row HASH only (probed 2026-11-05: an ordinal or a timestamp
// cursor answers 500 or an empty page), so "at or below an ordinal" cannot be crafted: a window in
// the past is found by walking from the tip past the rows above it. A busy chain pages ~1000 rows
// (a few days of the DAG) per ~2 s, so the walk is capped at `TRAIL_PAGES_MAX` pages a chain. The
// DAG's cap is the walk's REACH: a pin it cannot walk to is `BeyondReach`, an answer the route
// states. A TOKEN chain past its cap contributes what it reached — its blocks older than that are
// the walk's stated floor, never a void of the whole window (a busy token chain no longer sets the
// reach for every other chain). ONE deadline (`TRAIL_DEADLINE_MS`) bounds the WHOLE request — the
// walk and the record reads after it — under the route's 60 s; a deadline hit anywhere THROWS (the
// route answers 503), never a short answer that would read as "no blocks there" (rule 10).
//
// A block with NO transfer has no row, so a tick holding only empty blocks is not found here; the
// route's answer is the blocks that carry transfers.
//
// UNDER A CHAIN (`chain`, the top bar's network filter — D4, 2026-11-07): the window is THAT
// network's newest `n` block ticks, reaching back as far as its walk goes (days, for a quiet chain).
// Only its own addresses (current and former) are walked; the DAG's list is NOT — the global record
// each chosen tick is read for already lists its DAG blocks (`blocks`), so the DAG blocks sharing
// those ticks come at no extra upstream read, where walking the DAG's list down to a quiet chain's
// oldest tick would cost pages per day of span and hit its cap within a week. `chain = "dag"` walks
// the DAG alone. A token chain under its own filter whose capped walk reached no tick at all is
// `BeyondReach` (an empty window there is not "no blocks").
//
// A TOKEN CHAIN CUT BY ITS PAGE CAP IS NAMED (`partial`, its network's current id), so the floor is
// stated (rule 10): when the window holds fewer than `n` ticks, or the chain's walk stopped at or
// above the window's oldest tick — blocks of it the window would hold may lie below where it stopped.

/** One row of a transfer list: the snapshot that carried it, and the block. */
export interface TrailRow {
  snapshotOrdinal: number;
  /** A token row's anchoring global (absent: the row cannot be placed on a tick, so it is skipped). */
  globalSnapshotOrdinal?: number;
  blockHash: string;
}

export interface TrailDeps {
  /** One page of a chain's transfers, newest first; `"dag"` is the DAG's own list. */
  transfers(chain: "dag" | string, next?: string): Promise<{ rows: TrailRow[]; next?: string }>;
  global(ordinal: number): Promise<GlobalSnapshot>;
  metaSnap(chain: string, ordinal: number): Promise<RawMetaSnapshot>;
  /** Every metagraph chain id to read (current and former addresses). */
  chains(): Promise<string[]>;
  /** Maps a chain address to its network's CURRENT id, so a former address folds under it. */
  currentId?(id: string): string;
  /** The clock for the walk deadline (injectable). */
  now?(): number;
}

/** The DAG's walk cannot reach the window asked for (a pin deeper than its page cap): an answer, not a failure. */
export class BeyondReach extends Error {
  constructor(chain: string) {
    super(`chain ${chain}: beyond the walk`);
  }
}

/** One overall deadline for the whole request (the walk and the record reads), under the route's 60 s. */
export const TRAIL_DEADLINE_MS = 45_000;

/** Pages one chain's walk may take before the window is called unreadable. */
export const TRAIL_PAGES_MAX = 12;

type ChainTicks = Map<number, TrailRow[]>;

export async function assembleTrail(deps: TrailDeps, around: number | null, n: number, chain: string | null = null): Promise<BlockWindowAnswer> {
  const cur = deps.currentId ?? ((id: string) => id);
  const now = deps.now ?? Date.now;
  const started = now();
  const DEADLINE = "trail deadline";
  const past = () => now() - started > TRAIL_DEADLINE_MS;
  // Every upstream read races what is left of the one deadline, and the clock is asked again when
  // it settles — so a read that ends past it fails the request too, wherever it sits.
  const bounded = async <T>(p: () => Promise<T>): Promise<T> => {
    if (past()) throw new Error(DEADLINE);
    const left = TRAIL_DEADLINE_MS - (now() - started);
    let id: ReturnType<typeof setTimeout> | undefined;
    const timer = new Promise<never>((_, rej) => {
      id = setTimeout(() => rej(new Error(DEADLINE)), left);
    });
    try {
      const v = await Promise.race([p(), timer]);
      if (past()) throw new Error(DEADLINE);
      return v;
    } finally {
      clearTimeout(id);
    }
  };
  const all = await bounded(() => deps.chains());
  // The metagraph addresses this answer reads: every one, none under the DAG filter, or the network's own.
  const ids = chain == null ? all : chain === "dag" ? [] : all.filter((id) => cur(id) === chain);
  const walked = chain == null || chain === "dag" ? ["dag", ...ids] : ids;
  // Token chains whose walk hit the page cap, with the oldest tick each reached (null: none).
  const capped = new Map<string, number | null>();
  const found = new Map<string, ChainTicks>();
  const key = (chain: string, row: TrailRow): number | null => (chain === "dag" ? row.snapshotOrdinal : (row.globalSnapshotOrdinal ?? null));
  // The n-th newest tick gathered across every chain so far: a chain whose gathered ticks are all
  // older than it can add nothing the answer would hold, so its walk ends. It only ever rises.
  const cut = (): number => {
    const all = new Set<number>();
    for (const t of found.values()) for (const k of t.keys()) all.add(k);
    return all.size >= n ? [...all].sort((a, b) => b - a)[n - 1]! : -Infinity;
  };
  const walk = async (id: string): Promise<void> => {
    const ticks: ChainTicks = new Map();
    found.set(id, ticks);
    let next: string | undefined;
    for (let page = 0; ; page++) {
      if (page >= TRAIL_PAGES_MAX) {
        // The DAG's cap is the reach; a token chain keeps what it reached (its floor).
        if (id === "dag") throw new BeyondReach(id);
        capped.set(id, ticks.size ? Math.min(...ticks.keys()) : null);
        return;
      }
      const r = await bounded(() => deps.transfers(id, next));
      for (const row of r.rows) {
        const k = key(id, row);
        if (k == null || (around != null && k > around)) continue;
        const list = ticks.get(k) ?? [];
        list.push(row);
        ticks.set(k, list);
      }
      next = r.next;
      if (!next || !r.rows.length) return;
      // Newest first: once the page's oldest tick sits below the cut, nothing older can matter.
      const oldest = Math.min(...ticks.keys());
      if (ticks.size && oldest < cut()) return;
    }
  };
  await Promise.all(walked.map(walk));

  const chosen = new Set<number>();
  for (const t of found.values()) for (const k of t.keys()) chosen.add(k);
  const ords = [...chosen].sort((a, b) => b - a).slice(0, n);
  // Under its own filter, a capped token chain that reached nothing lies beyond the walk.
  if (chain != null && chain !== "dag" && !ords.length && capped.size) throw new BeyondReach(chain);
  const oldest = ords.length ? ords[ords.length - 1]! : null;
  const partial = [
    ...new Set(
      [...capped]
        .filter(([, reached]) => ords.length < n || reached == null || oldest == null || reached >= oldest)
        .map(([id]) => cur(id)),
    ),
  ];

  const ticks = await Promise.all(
    ords.map(async (ord): Promise<BlockTick> => {
      const g = await bounded(() => deps.global(ord));
      const blocks = new Set<string>();
      for (const row of found.get("dag")?.get(ord) ?? []) if (row.blockHash) blocks.add(row.blockHash);
      for (const b of g.blocks ?? []) blocks.add(b);
      const metaSnaps: Record<string, RawMetaSnapshot[]> = {};
      await Promise.all(
        ids.map(async (id) => {
          const rows = found.get(id)?.get(ord);
          if (!rows?.length) return;
          const own = [...new Set(rows.map((r) => r.snapshotOrdinal))].sort((a, b) => a - b);
          const recs = await Promise.all(
            own.map(async (o) => {
              const rec = await bounded(() => deps.metaSnap(id, o));
              const hashes = rows.filter((r) => r.snapshotOrdinal === o).map((r) => r.blockHash);
              return rec.blocks?.length ? rec : { ...rec, blocks: hashes };
            }),
          );
          const to = cur(id);
          (metaSnaps[to] ??= []).push(...recs);
        }),
      );
      return { ord, ts: g.timestamp, hash: g.hash, blocks: [...blocks], metaSnaps };
    }),
  );
  return {
    ticks,
    chains: [...new Set(ids.map(cur))],
    ...(chain != null ? { chain } : {}),
    ...(partial.length ? { partial } : {}),
  };
}
