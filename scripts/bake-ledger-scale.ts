// Calibrates the byte bar's width reference (spec §6.3). KB-per-tick is heavy-tailed — max/p95 was
// 88x in a 533-tick sample — so the bar scales to a FIXED p99 and clips the rare monster with an
// honest overflow multiplier, rather than rescaling the past every time one arrives.
//
// ⚠️ THE WINDOW MUST BE COMPLETE PER TICK (rebake lesson, 2026-08-16): a fixed `limit` covers a
// different time span per metagraph — a fast batcher's 1000 newest snapshots spanned 65 MINUTES
// while a slow one's spanned months — so older ticks summed without the heaviest contributors and
// the p99 read 8× LOW (73 vs a true 545). Each metagraph is therefore PAGED (the explorer's
// `meta.next` cursor) back to one shared cutoff, and quantiles run only over ticks younger than
// the oldest fully-covered timestamp.
//
// Run manually whenever the metagraph set or mainnet traffic changes:
//   npx tsx scripts/bake-ledger-scale.ts
import { METAGRAPHS } from "../src/engine/config";

const BE = "https://be-mainnet.constellationnetwork.io";
const WINDOW_HOURS = 12;
const MAX_PAGES = 30; // safety valve — ~30k snapshots per metagraph

interface Snap { timestamp?: string; sizeInKB?: number }

async function page(url: string): Promise<{ data: Snap[]; next: string | null }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { data: [], next: null };
    const j = (await r.json()) as { data?: Snap[]; meta?: { next?: string } };
    return { data: j.data ?? [], next: j.meta?.next ?? null };
  } catch {
    return { data: [], next: null };
  }
}

async function main() {
  const cutoff = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();
  const byTick = new Map<string, number>();
  let windowStart = cutoff; // rises to the LATEST per-metagraph oldest, so every counted tick is complete
  for (const m of METAGRAPHS) {
    let url: string | null = `${BE}/currency/${m.id}/snapshots?limit=1000`;
    let oldest = "";
    let pages = 0;
    while (url && pages < MAX_PAGES) {
      const { data, next } = await page(url);
      if (!data.length) break;
      for (const s of data) {
        if (s.timestamp) byTick.set(s.timestamp, (byTick.get(s.timestamp) ?? 0) + (s.sizeInKB ?? 0));
      }
      oldest = data.reduce((a, s) => (s.timestamp && s.timestamp < a ? s.timestamp : a), data[0].timestamp ?? "");
      pages += 1;
      if (oldest < cutoff) break;
      url = next ? `${BE}/currency/${m.id}/snapshots?limit=1000&next=${next}` : null;
    }
    if (!oldest) continue; // no data — contributes nothing and constrains nothing
    console.log(`${m.id.slice(0, 8)} pages=${pages} oldest=${oldest.slice(0, 16)}`);
    if (oldest > windowStart) windowStart = oldest; // window shrinks to what THIS metagraph covers
  }
  const ticks = [...byTick.entries()]
    .filter(([t]) => t >= windowStart)
    .map(([, v]) => v)
    .sort((a, b) => a - b);
  if (ticks.length < 500) {
    console.warn(`only ${ticks.length} complete ticks — raise WINDOW_HOURS/MAX_PAGES for a trustworthy p99`);
  }
  const at = (q: number) => ticks[Math.min(ticks.length - 1, Math.floor(ticks.length * q))];
  // The listed directory is not the whole story: a few anchors come from metagraphs that aren't
  // publicly listed, so the measured p99 is inflated by their observed byte share.
  const UNLISTED_SHARE = 1.08;
  const p99 = at(0.99) * UNLISTED_SHARE;
  console.log(`complete window from ${windowStart.slice(0, 16)} — ticks=${ticks.length}`);
  console.log(`p50=${at(0.5).toFixed(1)} p95=${at(0.95).toFixed(1)} p99=${at(0.99).toFixed(1)} max=${ticks[ticks.length - 1].toFixed(1)}`);
  console.log(`\nBYTE_SCALE_KB = ${Math.round(p99)}   // p99 of anchored KB/tick, +unlisted share`);
}

main();
