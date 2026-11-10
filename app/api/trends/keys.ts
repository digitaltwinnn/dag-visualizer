// The trends store's key/field grammar — the ONE home for tier names, TTLs, bucket labels
// and window enumeration (spec: docs/superpowers/specs/2026-09-05-trends-timeseries-design.md).
// Everything is UTC: explorer timestamps are ISO-8601 Z, and a bucket label must mean the
// same instant regardless of which server derives it.

/** THE STORE'S NAMESPACE — the segment every key of every family embeds (`t:mainnet:…`,
 *  `geo:mainnet:…`, `stake:mainnet:…`, `ai:mainnet:…`). The store is shared by every deployment and
 *  holds years of data under it, so it is a fixed string, never derived: `keys.test.ts` pins it. */
export const STORE_NS = "mainnet";

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
export function slotOf(tier: Tier, tsMs: number): { key: string; bucket: string } {
  const d = new Date(Math.floor(tsMs / STEP_MS[tier]) * STEP_MS[tier]);
  const y = d.getUTCFullYear(), mo = p2(d.getUTCMonth() + 1), da = p2(d.getUTCDate());
  const h = p2(d.getUTCHours()), mi = p2(d.getUTCMinutes());
  if (tier === "5m") return { key: `t:${STORE_NS}:5m:${y}-${mo}-${da}`, bucket: `${h}:${mi}` };
  if (tier === "1h") return { key: `t:${STORE_NS}:1h:${y}-${mo}`, bucket: `${da}-${h}` };
  return { key: `t:${STORE_NS}:1d:${y}`, bucket: `${mo}-${da}` };
}

/** THE GEO FAMILY (2026-10-27) — where the fleet runs, one bucket per UTC day: `geo:mainnet:{YYYY}`,
 *  fields `MM-DD|f.cc.<cc>`, `f.cc.<id>.<cc>`, `f.isp.<key>`, `f.isp.<id>.<key>` (`fleetGeo.ts`).
 *  OUTSIDE the `t:mainnet:*` tiers on purpose, twice over: a rebuild WIPES that prefix
 *  (`scripts/rebuild-trends.ts`), and a gauge can never be re-derived — where nodes ran on a past
 *  day least of all; and `/api/trends` ships every series a tier hash holds, so History's payload
 *  would carry ~150 series it never draws. Keeps forever, like every tier. */
export function geoSlotOf(tsMs: number): { key: string; bucket: string } {
  const { bucket } = slotOf("1d", tsMs);
  return { key: `geo:${STORE_NS}:${new Date(tsMs).getUTCFullYear()}`, bucket };
}

/** A PROVIDER'S CITIES (2026-10-31): the fleet by city and provider, `MM-DD|f.site.<cc>.<city>.<key>`,
 *  so a note can say "Hetzner lost 3 nodes in Falkenstein" from a measurement. In the geo family's
 *  keep-forever prefix but its own hash, one per month: it is the family's widest series and only
 *  the last week is ever read, so a note's yearly read does not carry it. */
export function geoSitesSlotOf(tsMs: number): { key: string; bucket: string } {
  const { bucket } = slotOf("1d", tsMs);
  return { key: `geo:${STORE_NS}:sites:${new Date(tsMs).toISOString().slice(0, 7)}`, bucket };
}

/** DELEGATED STAKE PER VALIDATOR (2026-11-04): `MM-DD|f.stake.<v>`, `f.stakeAddrs.<v>`,
 *  `f.stakeLive.<v>` — each registered validator's delegated DAG, the addresses delegating to it
 *  and whether it stood in the cluster, the day's last hourly reading. `<v>` is the first 16 hex
 *  of the peer id (`stakeValidatorsKeyOf` maps it back). Its own keep-forever family for the geo
 *  family's two reasons — stake has no upstream history, so a rebuild must never wipe it, and
 *  ~550 fields a day would ride every History payload undrawn — one hash per month, like the
 *  sites, so a reader of a week does not pull a year. */
export function stakeSlotOf(tsMs: number): { key: string; bucket: string } {
  const { bucket } = slotOf("1d", tsMs);
  return { key: `stake:${STORE_NS}:${new Date(tsMs).toISOString().slice(0, 7)}`, bucket };
}

/** `<v>` → `{ id, name }` (the full peer id and the operator's own name), one hash,
 *  so a reader can name a validator that has since left the registry. */
export function stakeValidatorsKeyOf(): string {
  return `stake:${STORE_NS}:validators`;
}

/** provider key → the lookup's provider name (`fleetGeo.ts` `providerNames`), one hash per
 *  network, so a reader can name a host whose nodes have since gone. */
export function ispNamesKeyOf(): string {
  return `geo:${STORE_NS}:isp`;
}

export function fieldOf(bucket: string, series: string): string {
  return `${bucket}|${series}`;
}

/** Every slot from `fromMs` to `toMs` inclusive, oldest first — the read side's enumeration. */
export function slotsInWindow(
  tier: Tier, fromMs: number, toMs: number,
): { key: string; bucket: string; tsMs: number }[] {
  const step = STEP_MS[tier];
  const out: { key: string; bucket: string; tsMs: number }[] = [];
  for (let t = Math.floor(fromMs / step) * step; t <= toMs; t += step) {
    out.push({ ...slotOf(tier, t), tsMs: t });
  }
  return out;
}

export function cursorKeyOf(): string {
  return `t:${STORE_NS}:cursor`;
}

/** The cursor hash's field for when a run last READ a catalog chain, new records or none. Silence
 *  needs it: the cursor itself only moves on a record, so a chain with nothing new and a chain that
 *  failed leave the store the same, and the read route zero-fills both. */
export const chainReadField = (id: string): string => `read.${id}`;

/** Each chain's last read (ms), from the cursor hash. */
export function chainReadsOf(cursor: Record<string, string | number> | null): Record<string, number> {
  const reads: Record<string, number> = {};
  for (const [field, at] of Object.entries(cursor ?? {})) {
    const id = /^read\.(.+)$/.exec(field)?.[1];
    if (id) reads[id] = Number(at);
  }
  return reads;
}
export function lockKeyOf(): string {
  return `t:${STORE_NS}:lock`;
}
