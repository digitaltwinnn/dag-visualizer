// The block braid's arithmetic: pure rules for the Blocks register of the Snapshots view.
//
// Three rules, in plain words:
//  1. Lanes by height. A block's lane is its height counted from the window's lowest height,
//     cycled across a few lanes that are spread over the plane's width.
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

export const BRAID_LANES = 5;

/** 0..lanes-1: (height - minHeight) mod lanes. */
export function laneOf(height: number, minHeight: number, lanes: number = BRAID_LANES): number {
  return (((height - minHeight) % lanes) + lanes) % lanes;
}

/** Lane centre across the plane's width, the lanes centred on zero. */
export function laneZ(lane: number, lanes: number, width: number): number {
  return (lane - (lanes - 1) / 2) * (width / lanes);
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
