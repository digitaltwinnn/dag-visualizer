// The block braid's arithmetic: pure rules for the Blocks register of the Snapshots view.
//
// Three rules, in plain words:
//  1. A braid, not a column (user, design round D1). Along the trail a block stands on its own tick;
//     ACROSS it, the blocks of one height stand side by side as siblings (`siblingRanks`), fanned out
//     from the centre (`fanOffset`), so consecutive heights step along the trail and each child's
//     two parent links fan across to the generation before it. A block's place depends on its own
//     tick and its siblings only — never on the window's lowest height, which moved the whole braid
//     every time a read landed or the window's oldest tick left.
//  2. Links run block to block, and only where BOTH ends are held. A parent outside the window
//     has no place to draw to, so it gets no segment, never a stub into nothing.
//  3. Tips are read from a snapshot's own list, never inferred. A mock that inferred retirement
//     over-counted open tips by half. With no list read, the state is unknown (null).

export interface BlockRead {
  hash: string;
  height: number;
  parents: { hash: string; height: number }[];
  txCount: number;
  amount: number;
  fee: number;
  signers: number;
}

export interface TipRead {
  active: { hash: string; height: number; usage: number; introducedAt: number }[];
  deprecated: { hash: string; height: number; deprecatedAt: number }[];
}

/** How far the fan reaches to each side, in sibling pitches. A rank past it folds back inside. */
export const FAN_REACH = 4;

/**
 * Each block's rank among the blocks of ITS height: newest tick first, a tie on one tick broken by
 * hash. Newest first is what keeps the braid still: the window's reads land newest first, so an
 * older sibling whose read lands later takes the NEXT rank and moves no block already placed; only
 * a new block tick at the front (the window itself changing) re-deals a height.
 */
export function siblingRanks(blocks: readonly { hash: string; height: number; ord: number }[]): Map<string, number> {
  const byHeight = new Map<number, { hash: string; ord: number }[]>();
  for (const b of blocks) {
    const list = byHeight.get(b.height) ?? [];
    list.push(b);
    byHeight.set(b.height, list);
  }
  const out = new Map<string, number>();
  for (const list of byHeight.values()) {
    list.sort((a, b) => b.ord - a.ord || (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
    list.forEach((b, k) => out.set(b.hash, k));
  }
  return out;
}

/** A sibling's place across the braid, in pitches: 0, +1, −1, +2, −2, … folded inside `FAN_REACH`. */
export function fanOffset(rank: number): number {
  const k = rank % (2 * FAN_REACH + 1);
  return k === 0 ? 0 : k % 2 ? (k + 1) / 2 : -k / 2;
}

export type TipState = "open" | "retired";

/** open if listed active; retired otherwise; null when the tips were not read. */
export function tipStateOf(hash: string, tips: TipRead | null): TipState | null {
  if (!tips) return null;
  return tips.active.some((t) => t.hash === hash) ? "open" : "retired";
}

/**
 * Child-to-parent segments, 6 floats each (child xyz, parent xyz), for every parent the
 * window holds. Handed to a BufferAttribute at event time by the scene.
 */
export function linkEndpoints(
  blocks: readonly BlockRead[],
  at: (hash: string) => readonly [x: number, y: number, z: number] | null,
): Float32Array {
  const out: number[] = [];
  for (const b of blocks) {
    const c = at(b.hash);
    if (!c) continue;
    for (const p of b.parents) {
      const q = at(p.hash);
      if (q) out.push(c[0], c[1], c[2], q[0], q[1], q[2]);
    }
  }
  return Float32Array.from(out);
}

/** The snapshots and time between two block ticks; null when they are adjacent. */
export function silentRun(prevOrd: number, ord: number, prevTs: number, ts: number): { snapshots: number; ms: number } | null {
  if (ord - prevOrd <= 1) return null;
  return { snapshots: ord - prevOrd - 1, ms: ts - prevTs };
}
