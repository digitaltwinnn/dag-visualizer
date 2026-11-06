// The block braid's arithmetic: pure rules for the Blocks register of the Snapshots view.
//
// Three rules, in plain words:
//  1. A LAYERED DAG DRAWING on the chamber's time axis (user, design round D2: "a DAG is shaped
//     differently usually, isn't there some algo for it?" — the Sugiyama method). Along the trail a
//     block stands on its own tick, which is time and never moves; ACROSS it, a block takes the
//     BARYCENTER (mean) of its placed parents' places, and blocks of one height sharing that
//     barycenter split symmetrically around it (`layeredZ`). So the main chain is a straight centre
//     line, a fork opens into a diamond, and it closes where the blocks rejoin. A block placed once
//     KEEPS its place (the caller hands the last layout back as `prior`), so the window sliding a
//     block tick at a time moves nothing already standing — a layout recomputed from the window
//     re-dealt every block whenever its oldest tick left (found live, D2).
//  2. Every reference a read states is drawn (`referenceSegments`): to the parent where it is
//     placed, else as a STUB toward the older side at the block's own place — the reference is a
//     read fact, only its far end is off the trail. A block whose read has not landed draws none.
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

/**
 * Each block's place across the braid, in units of `spacing` (a layered drawing, heights from the
 * lowest up, so a parent is always placed before its child):
 *  - a block placed before (`prior`) KEEPS its place — so neither a newer block arriving nor the
 *    window's oldest block leaving moves one already standing;
 *  - a block with a parent whose read is still `pending` waits (no place yet), so it is never seated
 *    against a parent that is about to move;
 *  - a new block takes the mean place of its parents found (else the centre line); new blocks of one
 *    height sharing that barycenter split symmetrically around it — `spacing` to each side for a
 *    pair — and where siblings already stand there, each new one takes the nearest free place
 *    (0, +1, −1, +2, … spacings), in tick order (hash on a tie).
 */
export function layeredZ(
  blocks: readonly { hash: string; height: number; ord: number; parents: readonly string[] }[],
  spacing: number,
  prior: ReadonlyMap<string, number> = new Map(),
  pending: ReadonlySet<string> = new Set(),
): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of blocks) {
    const z = prior.get(b.hash);
    if (z != null) out.set(b.hash, z);
  }
  const byHeight = new Map<number, typeof blocks[number][]>();
  for (const b of blocks) (byHeight.get(b.height) ?? byHeight.set(b.height, []).get(b.height)!).push(b);
  for (const h of [...byHeight.keys()].sort((x, y) => x - y)) {
    const all = byHeight.get(h)!;
    const groups = new Map<string, { bary: number; list: typeof blocks[number][] }>();
    for (const b of all) {
      if (out.has(b.hash) || b.parents.some((p) => pending.has(p))) continue;
      let sum = 0;
      let n = 0;
      for (const p of b.parents) {
        const z = out.get(p);
        if (z == null) continue;
        sum += z;
        n++;
      }
      const bary = n ? sum / n : 0;
      const key = bary.toFixed(6);
      (groups.get(key) ?? groups.set(key, { bary, list: [] }).get(key)!).list.push(b);
    }
    for (const { bary, list } of groups.values()) {
      list.sort((x, y) => x.ord - y.ord || (x.hash < y.hash ? -1 : x.hash > y.hash ? 1 : 0));
      // The places already taken on this height's lattice around the barycenter.
      const taken = new Set<number>();
      for (const o of all) {
        const z = out.get(o.hash);
        if (z == null || list.includes(o)) continue;
        const j = Math.round((z - bary) / spacing);
        if (Math.abs(z - bary - j * spacing) < 1e-6) taken.add(j);
      }
      if (!taken.size) {
        list.forEach((b, i) => out.set(b.hash, bary + (2 * i - (list.length - 1)) * spacing));
        continue;
      }
      let k = 0;
      for (const b of list) {
        let j = 0;
        for (;; k++) {
          j = k === 0 ? 0 : k % 2 ? (k + 1) / 2 : -k / 2;
          if (!taken.has(j)) break;
        }
        taken.add(j);
        out.set(b.hash, bary + j * spacing);
      }
    }
  }
  return out;
}

export type TipState = "open" | "retired";

/** open if listed active; retired otherwise; null when the tips were not read. */
export function tipStateOf(hash: string, tips: TipRead | null): TipState | null {
  if (!tips) return null;
  return tips.active.some((t) => t.hash === hash) ? "open" : "retired";
}

/**
 * Every reference the reads state, 6 floats a segment (child xyz, then the far end), child first:
 * to the parent where `at` places it, else a STUB to `stubX` at the child's own y and z — the older
 * side, where the parent would be. `ends` names each segment's two blocks (2 a segment), the far
 * end null for a stub. A block `at` does not place draws nothing. Handed to a BufferAttribute at
 * event time by the scene.
 */
export function referenceSegments(
  blocks: readonly BlockRead[],
  at: (hash: string) => readonly [x: number, y: number, z: number] | null,
  stubX: number,
): { pos: Float32Array; ends: (string | null)[] } {
  const out: number[] = [];
  const ends: (string | null)[] = [];
  for (const b of blocks) {
    const c = at(b.hash);
    if (!c) continue;
    for (const p of b.parents) {
      const q = at(p.hash);
      out.push(c[0], c[1], c[2]);
      if (q) out.push(q[0], q[1], q[2]);
      else out.push(stubX, c[1], c[2]);
      ends.push(b.hash, q ? p.hash : null);
    }
  }
  return { pos: Float32Array.from(out), ends };
}

/** The snapshots and time between two block ticks; null when they are adjacent. */
export function silentRun(prevOrd: number, ord: number, prevTs: number, ts: number): { snapshots: number; ms: number } | null {
  if (ord - prevOrd <= 1) return null;
  return { snapshots: ord - prevOrd - 1, ms: ts - prevTs };
}
