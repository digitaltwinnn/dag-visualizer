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

/** The reads still to make: newest first, leaving out what landed and what failed. */
export function wantedBlockReads(
  w: BlockWindow,
  have: Readonly<Record<string, unknown>>,
  miss: Readonly<Record<string, true>>,
): BlockReadWant[] {
  return allWants(w).filter((x) => have[x.key] == null && miss[x.key] == null);
}

/** Every key the window could want, held or not (what retention keeps). */
export function windowBlockKeys(w: BlockWindow): Set<string> {
  return new Set(allWants(w).map((x) => x.key));
}
