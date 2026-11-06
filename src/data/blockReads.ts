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

/** The store key of one block read: `${chain}:${ordinal}`. */
export function blockReadKey(chain: string, ordinal: number): string {
  return `${chain}:${ordinal}`;
}

/** A chain's FRONTIER read — the tips of its NEWEST snapshot, never a block-bearing snapshot's own
 *  (hours stale) — is held under `${chain}:frontier` beside its block reads. One home for the key:
 *  the bridge writes it, retention keeps it, the chamber reads it. */
export const BLOCK_FRONTIER = "frontier";
export function frontierKey(chain: string): string {
  return `${chain}:${BLOCK_FRONTIER}`;
}
export function isFrontierKey(key: string): boolean {
  return key.endsWith(`:${BLOCK_FRONTIER}`);
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

/** HOW MANY BLOCKS ARE BUILT ON THIS ONE, as far as the held reads show: the blocks of its own
 *  chain's block reads that name it as a parent. A frontier read is the tips, not blocks, so it
 *  counts nothing; the reads are pruned with the window, so this is a count within the window. */
export function blockChildren(
  reads: Readonly<Record<string, { blocks: readonly BlockRead[] } | undefined>>,
  chain: string,
  hash: string,
): number {
  let n = 0;
  for (const [key, r] of Object.entries(reads)) {
    // The key's chain part, exactly (`blockReadKey`: `${chain}:${ordinal}`).
    if (!r || isFrontierKey(key) || key.slice(0, key.lastIndexOf(":")) !== chain) continue;
    for (const b of r.blocks) if (b.parents.some((p) => p.hash === hash)) n++;
  }
  return n;
}
