import type { BlockRead } from "@/src/engine/domain/blockBraid";
import type { BlockWindow } from "@/src/data/blockWindow";

// WHICH FULL READS THE BLOCKS REGISTER'S WINDOW WANTS. A block's hash comes from the live feed at
// once; its two parents come only from a full read of the snapshot that accepted it. One read per
// block-bearing snapshot: the global's own (the DAG) and each anchored metagraph snapshot that
// carries token blocks. Pure: the window and what is held come in, the wanted reads go out;
// `components/BlockReadsBridge.tsx` owns the fetch.

export interface BlockReadWant {
  key: string;
  /** `"dag"` or a metagraph id (the id the fold keys the window by). */
  chain: string;
  /** The snapshot's own ordinal (the global's for the DAG, the metagraph's for a token chain). */
  ordinal: number;
}

/** ONE HELD READ (`store.blockReads`): a block-bearing snapshot's blocks. */
export interface HeldBlockRead {
  blocks: BlockRead[];
}

/** The store key of one block read: `${chain}:${ordinal}`. */
export function blockReadKey(chain: string, ordinal: number): string {
  return `${chain}:${ordinal}`;
}

/** Every read the window could want, newest tick first: the tick's DAG read when it holds a DAG
 *  block, then one per block-bearing metagraph snapshot anchored into it. */
function allWants(w: BlockWindow): BlockReadWant[] {
  const out: BlockReadWant[] = [];
  for (const t of [...w.ticks].sort((a, b) => b.ord - a.ord)) {
    if (t.blocks.length) out.push({ key: blockReadKey("dag", t.ord), chain: "dag", ordinal: t.ord });
    for (const [chain, rows] of Object.entries(t.metaSnaps)) {
      for (const r of rows) {
        if (!r.blocks?.length) continue;
        out.push({ key: blockReadKey(chain, r.ordinal), chain, ordinal: r.ordinal });
      }
    }
  }
  return out;
}

/** The reads still to make: newest first, leaving out what landed. A MISSED token read is left out
 *  too (its one retry lives in the bridge, so a miss is final for the window); a missed DAG read is
 *  NOT: it is displayed as a miss but still wanted, because `ensurePage` dedupes held and in-flight
 *  reads itself and `RawSnapshotBridge` bounds its retries, so asking again is safe and lets a tick
 *  whose earlier exact read failed recover. */
export function wantedBlockReads(
  w: BlockWindow,
  have: Readonly<Record<string, unknown>>,
  miss: Readonly<Record<string, true>>,
): BlockReadWant[] {
  return allWants(w).filter((x) => have[x.key] == null && (x.chain === "dag" || miss[x.key] == null));
}

/** THE EXACT READS THE WINDOW WANTS: every tick's, newest first, a token-only tick too — so each
 *  bar on the Blocks trail is MEASURED, not only the ticks holding a DAG block (whose exact read is
 *  also their block read). What has landed is left out; a missed one is asked again, because
 *  `ensurePage` dedupes and bounds its own retries. */
export function wantedExactReads(w: BlockWindow | null, exact: Readonly<Record<number, unknown>>): number[] {
  if (!w) return [];
  return w.ticks
    .map((t) => t.ord)
    .filter((o) => exact[o] == null)
    .sort((a, b) => b - a);
}

/** WHICH EXACT READS THE BOUNDED CACHE DROPS (review I3, 2026-11-09): the lowest ordinals past `max`,
 *  never one a HELD window still draws (`keep` — the block window's ticks, the past window's). The
 *  cache evicted the lowest ordinals, and a held window's ticks ARE the lowest (the live tip is read
 *  on every new global), so within half an hour on /blocks every window tick older than the live
 *  buffer lost its read and its bar fell to a block-only floor, unlabelled — and nothing re-asked,
 *  since the window's reads are asked only when its key set changes. Held ordinals cost at most a
 *  window over the cap (52 + the past window's 52), which the cap's "one small object per ordinal"
 *  affords. */
export function exactEvictions(ords: readonly number[], max: number, keep: ReadonlySet<number>): number[] {
  if (ords.length <= max) return [];
  const free = [...ords].filter((o) => !keep.has(o)).sort((a, b) => a - b);
  return free.slice(0, Math.max(0, Math.min(free.length, ords.length - max)));
}

/** HAVE THE WINDOW'S READS SETTLED — every read it wants landed or missed (a DAG read's miss is its
 *  tick's exact miss)? The chamber lays the DAG out ONCE, on this edge, never as the reads land one
 *  by one (user, 2026-11-07: "the layout shifts around before it finally settles; can't this just be
 *  calculated and once positions are determined draw it once"). A newer window that re-asks one
 *  tick unsettles it again; the chamber keeps what it laid and adds that tick's blocks as they land. */
export function windowReadsSettled(
  w: BlockWindow | null,
  have: Readonly<Record<string, unknown>>,
  miss: Readonly<Record<string, true>>,
  exactMiss: Readonly<Record<number, unknown>>,
): boolean {
  if (!w) return false;
  return allWants(w).every((x) => have[x.key] != null || (x.chain === "dag" ? exactMiss[x.ordinal] != null : miss[x.key] != null));
}

/** Every key the window could want, held or not (what retention keeps). */
export function windowBlockKeys(w: BlockWindow): Set<string> {
  return new Set(allWants(w).map((x) => x.key));
}

/** ONE BLOCK'S READ — the block in its accepting snapshot's full read, or null until that read lands
 *  (or when the read does not list it). */
export function blockReadOf(
  reads: Readonly<Record<string, { blocks: readonly BlockRead[] } | undefined>>,
  b: { chain: string; hash: string; ordinal: number },
): BlockRead | null {
  return reads[blockReadKey(b.chain, b.ordinal)]?.blocks.find((x) => x.hash === b.hash) ?? null;
}

