import { relativeAge } from "@/src/util/relativeAge";
// The block braid's arithmetic: pure rules for the Blocks register of the Snapshots view.
//
// Two rules, in plain words:
//  1. A LAYERED DAG DRAWING on the chamber's time axis (user, design round D2: "a DAG is shaped
//     differently usually, isn't there some algo for it?" — the Sugiyama method). Along the trail a
//     block stands on its own tick, which is time and never moves; its FORK SPREAD (`forkSpread`)
//     is the other axis — the chamber lays it VERTICALLY (round D8: "use the height instead"), so a
//     fork opens up and down over the floor's centre line. A block takes the BARYCENTER (mean) of
//     its placed parents' places, and blocks of one height sharing that barycenter split
//     symmetrically around it, so the main chain is a straight centre line, a fork opens into a
//     diamond, and it closes where the blocks rejoin. A block placed once KEEPS its place (the
//     caller hands the last layout back as `prior`), so the window sliding a block tick at a time
//     moves nothing already standing — a layout recomputed from the window re-dealt every block
//     whenever its oldest tick left (found live, D2). The spread is the FORK's, never the protocol's
//     block height (the user: "ignore the height").
//  2. Every reference a read states is drawn (`referenceSegments`): to the parent where it is
//     placed, else as a STUB toward the older side at the block's own place — the reference is a
//     read fact, only its far end is off the trail. A block whose read has not landed draws none.

export interface BlockRead {
  hash: string;
  height: number;
  parents: { hash: string; height: number }[];
  txCount: number;
  amount: number;
  fee: number;
  signers: number;
  /** Each transfer the block carries — source and destination addresses, amount and fee in the
   *  chain's own unit (the totals above are their sums). */
  transfers: BlockTransfer[];
}

/** One transfer inside a block. */
export interface BlockTransfer {
  from: string;
  to: string;
  amount: number;
  fee: number;
}

/**
 * Each block's place in the fork spread, in units of `spacing` (a layered drawing, heights from the
 * lowest up, so a parent is always placed before its child; the chamber lays it vertically):
 *  - a block placed before (`prior`) KEEPS its place — so neither a newer block arriving nor the
 *    window's oldest block leaving moves one already standing;
 *  - a block with a parent whose read is still `pending` waits (no place yet), so it is never seated
 *    against a parent that is about to move;
 *  - a new block takes the lattice place nearest the mean of its parents found (else the centre
 *    line) — the mean alone decays every fork into a fraction of a lane down a chain; new blocks of one
 *    height sharing that barycenter split symmetrically around it — `spacing` to each side for a
 *    pair — and where siblings already stand there, each new one takes the nearest free place
 *    (0, +1, −1, +2, … spacings), in tick order (hash on a tie).
 */
/** The lattice place nearest `m`, a half rounding TOWARD THE CENTRE LINE (review N2): `Math.round`
 *  sends +0.5 up to 1 but −0.5 up to 0, so a merge with the lane above rose off the centre while
 *  its mirror returned to it, and the braid drifted upward. Toward zero, a merge with either
 *  neighbour of the centre lands back on it, and every merge lands the same distance from the centre
 *  as its mirror. `+ 0` turns a −0 into 0. */
function latticeOf(m: number): number {
  return Math.sign(m) * Math.ceil(Math.abs(m) - 0.5) + 0;
}

export function forkSpread(
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
      // The LATTICE place nearest the parents' mean: a pure mean decays every fork into a sliver of a
      // lane down a long chain (each block averages two branches), so the trail read flat (D8).
      const bary = n ? latticeOf(sum / n) : 0;
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

/** How far a link's control points reach along the trail, as a share of the link's own run: the
 *  S-curve's shoulders (design round D8: "start horizontal, curve, end horizontal"). */
export const LINK_BEND = 0.4;
/** The segments one link is drawn in. */
export const LINK_SAMPLES = 12;

/**
 * One reference link as an S-CURVE: a cubic from `a` to `b` whose control points sit along the
 * trail's own axis only (`bend` × the run in x), so the curve LEAVES `a` and ARRIVES at `b`
 * horizontally and bends between them. `n + 1` points (xyz) into `out` from `offset`, the first
 * exactly `a` and the last exactly `b`; returns the next free offset. Event-time — the caller hands
 * a scratch array.
 */
export function sCurve(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  n: number,
  out: Float32Array | number[],
  offset = 0,
  bend: number = LINK_BEND,
): number {
  const k = bend * (b[0] - a[0]);
  const p1x = a[0] + k;
  const p2x = b[0] - k;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    out[offset++] = w0 * a[0] + w1 * p1x + w2 * p2x + w3 * b[0];
    out[offset++] = (w0 + w1) * a[1] + (w2 + w3) * b[1];
    out[offset++] = (w0 + w1) * a[2] + (w2 + w3) * b[2];
  }
  return offset;
}

/** The snapshots and time between two block ticks; null when they are adjacent. */
export function silentRun(prevOrd: number, ord: number, prevTs: number, ts: number): { snapshots: number; ms: number } | null {
  if (ord - prevOrd <= 1) return null;
  return { snapshots: ord - prevOrd - 1, ms: ts - prevTs };
}

/** A silent run states its length in words only past this many snapshots (a short gap is just a gap). */
export const STRETCH_WORDS_MIN = 200;
/** A silent stretch's flat label — "1,364 snapshots · 4h", the app's one short span (`relativeAge`)
 *  — or null for a run too short to word. ONE home for the between-ticks stretch and the front run
 *  (the live edge's silence), which the chamber wrote twice. */
export function stretchLabel(snapshots: number, ms: number): string | null {
  return snapshots > STRETCH_WORDS_MIN ? `${snapshots.toLocaleString()} snapshots · ${relativeAge(ms, true)}` : null;
}

/** WHAT THE FRONT OF THE TRANSACTION BLOCKS TRAIL STATES (user, 2026-11-10). In the LIVE window the
 *  FRONT RUN: the silence since the lead block tick up to the live global (`run`, worded by
 *  `stretchLabel`; none while the live global is itself the lead). Over a PINNED PAST window nothing
 *  may claim "now" — no front run, no live line — so the front states the window's AGE instead, ONE
 *  quiet label: how long ago its newest tick was, in the app's one short span ("3h ago",
 *  `relativeAge`). `pastNowMs` is the clock the age is read against, non-null only while a pinned
 *  past window is held; null: the live window. Ticks carry their own timestamp, parsed here. */
export type FrontMark = { kind: "run"; label: string | null } | { kind: "age"; label: string } | null;
export function frontMark(
  lead: { ordinal: number; timestamp: string } | null,
  live: { ordinal: number; timestamp: string } | null,
  pastNowMs: number | null,
): FrontMark {
  if (!lead) return null;
  if (pastNowMs != null) {
    const label = relativeAge(pastNowMs - Date.parse(lead.timestamp));
    return label ? { kind: "age", label } : null;
  }
  if (!live || live.ordinal <= lead.ordinal) return null;
  return { kind: "run", label: stretchLabel(live.ordinal - lead.ordinal, Math.max(0, Date.parse(live.timestamp) - Date.parse(lead.timestamp))) };
}

/** WHERE A BLOCK STANDS ACROSS THE BRAID, or null for not drawn (yet). `hold`: the window's reads
 *  are still landing; `read`: the block's own read (absent while unread or missed); `settled`: the
 *  window's reads have all landed; `z`: its place from `forkSpread`, absent where none was given.
 *  A read with no parents is a data block, never drawn. An unread block waits for the settle, then
 *  stands on the centre line (missed). ⚠️ A read block `forkSpread` left unplaced has a parent still
 *  in flight (review I1, 2026-11-09): it waits too — drawn on the centre line meanwhile, it jumped
 *  to its lattice place when the parent landed, breaking "laid out once" — and only after the
 *  settle (a parent that never lands) does it take the centre line. */
export function blockPlace(hold: boolean, read: { parents: readonly unknown[] } | undefined, settled: boolean, z: number | undefined): number | null {
  if (hold) return null;
  if (read && read.parents.length === 0) return null;
  if (!settled && (!read || z == null)) return null;
  return z ?? 0;
}
