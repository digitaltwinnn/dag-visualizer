// The submitters READ side: one range of the `sub:` store family folded into a compact window.
// Pure — the route hands it the hashes it read. Rule 10 lives here: a bucket is MEASURED only when
// it lies wholly inside the sampler's measured span [from, to) at its tier and overlaps no HOLE (R20,
// the hours a gap left unread, `sub:…:holes`); the bucket holding `to` is still being written and is
// null, like History's partial edges. Outside the span, or in a hole, is null, never 0.
import { SUBMITTERS, type SubmitterKind } from "@/src/data/submitters";
import { stepMsOf } from "../trends/keys";
import { subHllKeyOf, subSlotOf, type SubTier } from "./keys";

/** How many organisations carry a hue of their own (the palette); every other one reads neutral. */
export const ORG_PALETTE_MAX = 7;

export interface SubmittersWindow {
  net: string;
  kind: SubmitterKind;
  unit: string;
  tier: SubTier;
  stepMs: number;
  /** Bucket start times, epoch ms, ascending. */
  buckets: number[];
  measured: { from: number; to: number } | null;
  /** The holes (R20) overlapping the range, ascending: inside `measured` yet not measured. */
  holes: { from: number; to: number }[];
  /** Organisation id → name, only for ids that have one. */
  names: Record<string, string>;
  /** Per organisation (full id); empty for devices. Null outside `measured`, 0 inside where quiet. */
  series: { id: string; points: (number | null)[] }[];
  /** Submitters per bucket, both kinds; null outside `measured`. Devices: the bucket's HLL count. */
  distinct: (number | null)[];
  /** Distinct ids across the measured part of the range; null when none of it is measured. Devices:
   *  PFCOUNT over every measured bucket's HLL key — the union, never a sum. */
  rangeDistinct: number | null;
  /** True for devices (R19): `distinct` and `rangeDistinct` are HyperLogLog ESTIMATES (~0.81%
   *  standard error), which every surface states as "about N"; organisations are exact. */
  estimate: boolean;
  /** The range's per-organisation sums, busiest first; devices give []. */
  totals: { id: string; updates: number }[];
  /** Organisations ever seen: the ids the 1d tier holds (a name alone is no sighting); 0 for devices. */
  seenTotal: number;
  /** Earliest 1d bucket any organisation appears in, epoch ms; null when none. */
  firstSeenMs: number | null;
  /** Up to ORG_PALETTE_MAX organisation ids, busiest of ALL TIME first (the 1d tier's sums, ties by
   *  id), the same whatever range is asked; the ids that carry a hue. Devices give []. */
  palette: string[];
}

export interface AssembleInput {
  net: string;
  tier: SubTier;
  fromMs: number;
  toMs: number;
  hashes: Record<string, Record<string, string>>;
  span: Record<string, string> | null;
  names: Record<string, string> | null;
  /** The holes hash (`subHolesKeyOf`): field = start ms, value = end ms. */
  holes?: Record<string, string> | null;
  /** Devices (R19): PFCOUNT of each measured bucket's HLL key (`measuredHllKeys`), and of their union. */
  devices?: { counts: Record<string, number>; union: number } | null;
  /** Every 1d year hash, for "N seen since <month year>". */
  yearHashes?: Record<string, Record<string, string>>;
}

const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** The measured span as numbers, or null when the sampler has not committed one. */
export function parseSpan(span: Record<string, string> | null): { from: number; to: number } | null {
  const from = num(span?.from), to = num(span?.to);
  return from !== null && to !== null && to > from ? { from, to } : null;
}

/** The holes hash as spans, ascending; an unreadable field is no hole. */
export function parseHoles(raw: Record<string, string> | null | undefined): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const [f, v] of Object.entries(raw ?? {})) {
    const from = num(f), to = num(String(v));
    if (from !== null && to !== null && to > from) out.push({ from, to });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** THE ONE RULE FOR A MEASURED BUCKET, which the read (`read.ts`) asks too: wholly inside the span
 *  at its tier and overlapping no hole. */
export function bucketMeasured(
  t: number,
  step: number,
  measured: { from: number; to: number } | null,
  holes: readonly { from: number; to: number }[],
): boolean {
  if (!measured || t < measured.from || t + step > measured.to) return false;
  return !holes.some((h) => t < h.to && t + step > h.from);
}

/** THE HLL KEYS A DEVICE RANGE COUNTS (R19): one per MEASURED bucket (`bucketMeasured`), so the
 *  union is taken over exactly what the window reads as measured. The read asks PFCOUNT of each and
 *  of all of them; no device id ever leaves the store. */
export function measuredHllKeys(
  net: string,
  tier: SubTier,
  fromMs: number,
  toMs: number,
  span: Record<string, string> | null,
  holesRaw: Record<string, string> | null | undefined,
): string[] {
  const step = stepMsOf(tier);
  const measured = parseSpan(span), holes = parseHoles(holesRaw);
  const out: string[] = [];
  for (let t = Math.floor(fromMs / step) * step; t < toMs; t += step) {
    if (bucketMeasured(t, step, measured, holes)) out.push(subHllKeyOf(net, tier, t));
  }
  return out;
}

/** `window=24h`: the 24 whole hours ending at the CURRENT hour (rule 10, final review 2026-11-27): it
 *  was anchored at the span's end, so a stalled sampler showed days-old figures as "the last 24 hours";
 *  anchored at now, the hours the sampler missed read as not measured. */
export function windowRange24h(nowMs: number): { fromMs: number; toMs: number } {
  const H = stepMsOf("1h");
  const toMs = Math.floor(nowMs / H) * H;
  return { fromMs: toMs - 24 * H, toMs };
}

function parseNames(raw: Record<string, string> | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(raw ?? {})) {
    try {
      const o = typeof v === "string" ? JSON.parse(v) : v;
      if (o && typeof o.name === "string" && o.name) out[id] = o.name;
    } catch { /* an unreadable value names no one */ }
  }
  return out;
}

/** `[bucket, id, count]` for every field of a hash whose bucket label is `bucket`. */
function readBucket(h: Record<string, string> | undefined, bucket: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!h) return out;
  for (const [f, v] of Object.entries(h)) {
    const bar = f.indexOf("|");
    if (bar < 0 || f.slice(0, bar) !== bucket) continue;
    const id = f.slice(bar + 1);
    if (id) out.set(id, num(String(v)) ?? 0);
  }
  return out;
}

export function assembleSubmitters(input: AssembleInput): SubmittersWindow {
  const { net, tier, fromMs, toMs, hashes } = input;
  const spec = SUBMITTERS[net];
  const step = stepMsOf(tier);
  const measured = parseSpan(input.span);
  const holes = parseHoles(input.holes);
  const names = parseNames(input.names);

  const buckets: number[] = [];
  for (let t = Math.floor(fromMs / step) * step; t < toMs; t += step) buckets.push(t);

  const isOrg = spec.kind === "organisation";
  const isMeasured = buckets.map((t) => bucketMeasured(t, step, measured, holes));
  const anyMeasured = isMeasured.some(Boolean);

  // DEVICES (R19): each bucket's HLL count, and the union's, as the read counted them.
  if (!isOrg) {
    const counts = input.devices?.counts ?? null;
    return {
      net, kind: spec.kind, unit: spec.unit, tier, stepMs: step, buckets,
      measured, holes: holes.filter((h) => h.from < toMs && h.to > (buckets[0] ?? fromMs)), names, series: [],
      distinct: buckets.map((t, i) => (isMeasured[i] && counts ? (counts[subHllKeyOf(net, tier, t)] ?? 0) : null)),
      rangeDistinct: anyMeasured && input.devices ? input.devices.union : null,
      estimate: true,
      totals: [], seenTotal: 0, firstSeenMs: null, palette: [],
    };
  }

  const sums = new Map<string, number>();
  const perBucket: (Map<string, number> | null)[] = buckets.map((t, i) => {
    if (!isMeasured[i]) return null;
    const { key, bucket } = subSlotOf(net, tier, t);
    return readBucket(hashes[key], bucket);
  });
  for (const m of perBucket) {
    if (!m) continue;
    for (const [id, n] of m) sums.set(id, (sums.get(id) ?? 0) + n);
  }
  const ids = [...sums.keys()];
  const series = ids.map((id) => ({ id, points: perBucket.map((m) => (m ? (m.get(id) ?? 0) : null)) }));
  const totals = [...sums].map(([id, updates]) => ({ id, updates }))
    .sort((a, b) => b.updates - a.updates || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  series.sort((a, b) => totals.findIndex((t) => t.id === a.id) - totals.findIndex((t) => t.id === b.id));

  let seenTotal = 0, firstSeenMs: number | null = null;
  const allTime = new Map<string, number>();
  {
    // SEEN is what the 1d tier holds: a name seeded for an organisation the walk never reached is a
    // name, not a sighting.
    const seen = new Set<string>();
    for (const [key, h] of Object.entries(input.yearHashes ?? {})) {
      const year = Number(key.slice(key.lastIndexOf(":") + 1));
      for (const f of Object.keys(h)) {
        const bar = f.indexOf("|");
        if (bar < 0) continue;
        const oid = f.slice(bar + 1);
        seen.add(oid);
        allTime.set(oid, (allTime.get(oid) ?? 0) + (num(String(h[f])) ?? 0));
        const [mo, da] = f.slice(0, bar).split("-").map(Number);
        const ms = Date.UTC(year, mo - 1, da);
        if (Number.isFinite(ms) && (firstSeenMs === null || ms < firstSeenMs)) firstSeenMs = ms;
      }
    }
    seenTotal = seen.size;
  }

  return {
    net, kind: spec.kind, unit: spec.unit, tier, stepMs: step, buckets,
    measured, holes: holes.filter((h) => h.from < toMs && h.to > (buckets[0] ?? fromMs)), names, series,
    distinct: perBucket.map((m) => (m ? m.size : null)),
    rangeDistinct: anyMeasured ? sums.size : null,
    estimate: false,
    totals, seenTotal, firstSeenMs,
    palette: [...allTime].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, ORG_PALETTE_MAX).map(([id]) => id),
  };
}
