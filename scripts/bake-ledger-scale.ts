// Calibrates the byte bar's width reference (spec §6.3). KB-per-tick is heavy-tailed — max/p95 was
// 88x in a 533-tick sample — so the bar scales to a FIXED p99 and clips the rare monster with an
// honest overflow multiplier, rather than rescaling the past every time one arrives.
//
// Run manually whenever the metagraph set or mainnet traffic changes:
//   npx tsx scripts/bake-ledger-scale.ts
import { METAGRAPHS } from "../src/engine/config";

const BE = "https://be-mainnet.constellationnetwork.io";
const LIMIT = 300;

async function snapsFor(id: string): Promise<{ timestamp: string; sizeInKB: number }[]> {
  try {
    const r = await fetch(`${BE}/currency/${id}/snapshots?limit=${LIMIT}`);
    if (!r.ok) return [];
    const j = (await r.json()) as { data?: { timestamp?: string; sizeInKB?: number }[] };
    return (j.data ?? []).map((s) => ({ timestamp: s.timestamp ?? "", sizeInKB: s.sizeInKB ?? 0 }));
  } catch {
    return [];
  }
}

async function main() {
  const byTick = new Map<string, number>();
  for (const m of METAGRAPHS) {
    for (const s of await snapsFor(m.id)) {
      if (!s.timestamp) continue;
      byTick.set(s.timestamp, (byTick.get(s.timestamp) ?? 0) + s.sizeInKB);
    }
  }
  const ticks = [...byTick.values()].sort((a, b) => a - b);
  if (ticks.length < 500) {
    console.warn(`only ${ticks.length} ticks sampled — raise LIMIT for a trustworthy p99`);
  }
  const at = (q: number) => ticks[Math.min(ticks.length - 1, Math.floor(ticks.length * q))];
  // The listed directory is not the whole story: a few anchors come from metagraphs that aren't
  // publicly listed, so the measured p99 is inflated by their observed byte share.
  const UNLISTED_SHARE = 1.08;
  const p99 = at(0.99) * UNLISTED_SHARE;
  console.log(`ticks=${ticks.length} p50=${at(0.5).toFixed(1)} p95=${at(0.95).toFixed(1)} ` +
              `p99=${at(0.99).toFixed(1)} max=${ticks[ticks.length - 1].toFixed(1)}`);
  console.log(`\nBYTE_SCALE_KB = ${Math.round(p99)}   // p99 of anchored KB/tick, +unlisted share`);
}

main();
