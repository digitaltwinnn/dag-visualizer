// The trends store's key/field grammar — the ONE home for tier names, TTLs, bucket labels
// and window enumeration (spec: docs/superpowers/specs/2026-09-05-trends-timeseries-design.md).
// Everything is UTC: explorer timestamps are ISO-8601 Z, and a bucket label must mean the
// same instant regardless of which server derives it.

export type Tier = "5m" | "1h" | "1d";
export const TIERS: Tier[] = ["5m", "1h", "1d"];

// TTL IS the retention mechanism (Upstash usage contract) — and since 2026-09-10 EVERY tier
// keeps forever (user: the range zoom should sharpen to the finest grain that exists, and
// full-grain storage costs ~1.5 MB/day — pocket change against the read-bandwidth axis,
// which day-tile immutable caching protects). History still has FLOORS — the dates before
// which a tier's fields never existed; TIER_SINCE in src/data/trendWindow.ts is the client's
// map of them (one shared date since the 2026-09-11 clean-sheet walk rebuilt both fine tiers
// to the fine-history era's start).
export const TTL_S: Record<Tier, number | null> = { "5m": null, "1h": null, "1d": null };

const STEP_MS: Record<Tier, number> = { "5m": 300000, "1h": 3600000, "1d": 86400000 };
export function stepMsOf(tier: Tier): number {
  return STEP_MS[tier];
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** The (redis key, bucket label) a timestamp lands in, per tier. */
export function slotOf(net: string, tier: Tier, tsMs: number): { key: string; bucket: string } {
  const d = new Date(Math.floor(tsMs / STEP_MS[tier]) * STEP_MS[tier]);
  const y = d.getUTCFullYear(), mo = p2(d.getUTCMonth() + 1), da = p2(d.getUTCDate());
  const h = p2(d.getUTCHours()), mi = p2(d.getUTCMinutes());
  if (tier === "5m") return { key: `t:${net}:5m:${y}-${mo}-${da}`, bucket: `${h}:${mi}` };
  if (tier === "1h") return { key: `t:${net}:1h:${y}-${mo}`, bucket: `${da}-${h}` };
  return { key: `t:${net}:1d:${y}`, bucket: `${mo}-${da}` };
}

export function fieldOf(bucket: string, series: string): string {
  return `${bucket}|${series}`;
}

/** Every slot from `fromMs` to `toMs` inclusive, oldest first — the read side's enumeration. */
export function slotsInWindow(
  net: string, tier: Tier, fromMs: number, toMs: number,
): { key: string; bucket: string; tsMs: number }[] {
  const step = STEP_MS[tier];
  const out: { key: string; bucket: string; tsMs: number }[] = [];
  for (let t = Math.floor(fromMs / step) * step; t <= toMs; t += step) {
    out.push({ ...slotOf(net, tier, t), tsMs: t });
  }
  return out;
}

export function cursorKeyOf(net: string): string {
  return `t:${net}:cursor`;
}
export function lockKeyOf(net: string): string {
  return `t:${net}:lock`;
}
