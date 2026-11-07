import { BLOCK_WINDOW_TICKS, type BlockTick } from "@/src/data/blockWindow";
import { BLOCK_FRONTIER, isFrontierKey } from "@/src/data/blockReads";
import type { TipRead } from "@/src/engine/domain/blockBraid";

// THE BLOCKS REGISTER'S BAND READINGS — pure arithmetic over the block window and the held reads,
// so the cells stay a layout. The window lists ONLY block-bearing global snapshots, which is the
// whole honesty argument for the zeros below: a stretch of the hour with no tick in the window held
// no block, because a tick that held one would be listed.

const HOUR_MS = 3_600_000;
/** The sparkline's buckets over the last hour: five minutes each. */
export const BLOCK_BUCKETS = 12;

/** Which blocks a reading counts, and whether the window may be short. `chain` is the window's own
 *  network (`BlockWindow.chain`: null every network, `dag` the global's own blocks, else that chain's
 *  token blocks) — under a network filter the window also holds the DAG blocks sharing its ticks,
 *  which are not that network's. `cut` is a window its walk stopped short of (`BlockWindow.partial`
 *  non-empty): like a FULL window, what lies before its oldest tick is unknown. */
export interface BlockScope {
  chain?: string | null;
  cut?: boolean;
}

/** Every block one tick holds — the global's own (DAG) and the token blocks of each anchored
 *  snapshot — or, with `chain`, that network's alone. */
export function blocksInTick(t: BlockTick, chain: string | null = null): number {
  const token = (rows: BlockTick["metaSnaps"][string] | undefined) => (rows ?? []).reduce((n, r) => n + (r.blocks?.length ?? 0), 0);
  if (chain === "dag") return t.blocks.length;
  if (chain != null) return token(t.metaSnaps[chain]);
  let n = t.blocks.length;
  for (const rows of Object.values(t.metaSnaps)) n += token(rows);
  return n;
}

/** Blocks whose accepting global snapshot is within the last hour of `nowMs`, DAG + token (or the
 *  scope's network's). `floor` is true exactly when the window is FULL (or `cut`) and its oldest tick
 *  is newer than an hour ago: it stopped at its tick budget, so what came before is unknown and the
 *  count is "at least". A window below its cap holds all history, so its count is complete. */
export function blocksPerHour(ticks: readonly BlockTick[], nowMs: number, scope: BlockScope = {}): { count: number; floor: boolean } {
  let count = 0;
  let oldest = Infinity;
  for (const t of ticks) {
    const at = Date.parse(t.ts);
    oldest = Math.min(oldest, at);
    const age = nowMs - at;
    if (age >= 0 && age <= HOUR_MS) count += blocksInTick(t, scope.chain ?? null);
  }
  return { count, floor: (ticks.length >= BLOCK_WINDOW_TICKS || !!scope.cut) && oldest > nowMs - HOUR_MS };
}

/** The last hour as `BLOCK_BUCKETS` bins, OLDEST first. A bin holding no tick is zero blocks (see the
 *  header) — except one wholly older than a FULL window's oldest tick: the window stops at its tick
 *  budget, so what lay beyond it is unknown, and that bin is a gap (null), never a zero. */
export function blocksPerBucket(ticks: readonly BlockTick[], nowMs: number, scope: BlockScope = {}): (number | null)[] {
  const step = HOUR_MS / BLOCK_BUCKETS;
  const out: (number | null)[] = Array.from({ length: BLOCK_BUCKETS }, () => 0);
  let oldest = Infinity;
  for (const t of ticks) {
    const at = Date.parse(t.ts);
    oldest = Math.min(oldest, at);
    const age = nowMs - at;
    if (age < 0 || age > HOUR_MS) continue;
    const i = Math.min(BLOCK_BUCKETS - 1, BLOCK_BUCKETS - 1 - Math.floor(age / step));
    out[i] = (out[i] ?? 0) + blocksInTick(t, scope.chain ?? null);
  }
  if (ticks.length >= BLOCK_WINDOW_TICKS || scope.cut) {
    for (let i = 0; i < BLOCK_BUCKETS; i++) {
      // Bin i spans [now - (BUCKETS - i) * step, now - (BUCKETS - 1 - i) * step); known only from `oldest` on.
      if (nowMs - (BLOCK_BUCKETS - 1 - i) * step <= oldest) out[i] = null;
    }
  }
  return out;
}

/** Per chain, the active tips of its FRONTIER read (`${chain}:frontier`); null where there is no such
 *  read (rule 10: no read is not zero tips). `chains` names the chains asked after, beside those whose
 *  frontier key the reads already hold. */
export function openTipsByChain(
  reads: Readonly<Record<string, { tips: TipRead | null } | undefined>>,
  chains: readonly string[] = [],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const suffix = `:${BLOCK_FRONTIER}`;
  for (const key of Object.keys(reads)) if (isFrontierKey(key)) out[key.slice(0, -suffix.length)] = null;
  for (const c of chains) out[c] = null;
  for (const c of Object.keys(out)) out[c] = reads[`${c}${suffix}`]?.tips?.active.length ?? null;
  return out;
}

/** Milliseconds since the frontier read's snapshot was stamped; null with no read. */
export function frontierAge(read: { ts: string } | null | undefined, nowMs: number): number | null {
  if (!read) return null;
  const at = Date.parse(read.ts);
  return Number.isFinite(at) ? Math.max(0, nowMs - at) : null;
}
