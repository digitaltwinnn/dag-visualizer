// The submitters READ side: one range of the `sub:` store family folded into a compact window.
// Pure — the route hands it the hashes it read. Rule 10 lives here: a bucket is MEASURED only when
// it lies wholly inside the sampler's measured span [from, to) at its tier; the bucket holding `to`
// is still being written and is null, like History's partial edges. Outside the span is null, never 0.
import { SUBMITTERS, type SubmitterKind } from "@/src/data/submitters";
import { stepMsOf } from "../trends/keys";
import { subSlotOf, type SubTier } from "./keys";

export interface SubmittersWindow {
  net: string;
  kind: SubmitterKind;
  unit: string;
  tier: SubTier;
  stepMs: number;
  /** Bucket start times, epoch ms, ascending. */
  buckets: number[];
  measured: { from: number; to: number } | null;
  /** Organisation id → name, only for ids that have one. */
  names: Record<string, string>;
  /** Per organisation (full id); empty for devices. Null outside `measured`, 0 inside where quiet. */
  series: { id: string; points: (number | null)[] }[];
  /** Submitters per bucket, both kinds; null outside `measured`. */
  distinct: (number | null)[];
  /** Distinct ids across the measured part of the range; null when none of it is measured. */
  rangeDistinct: number | null;
  /** The range's per-organisation sums, busiest first; devices give []. */
  totals: { id: string; updates: number }[];
  /** Organisations ever seen (names hash plus the 1d tier); 0 for devices. */
  seenTotal: number;
  /** Earliest 1d bucket any organisation appears in, epoch ms; null when none. */
  firstSeenMs: number | null;
}

export interface AssembleInput {
  net: string;
  tier: SubTier;
  fromMs: number;
  toMs: number;
  hashes: Record<string, Record<string, string>>;
  span: Record<string, string> | null;
  names: Record<string, string> | null;
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

/** `window=24h`: the 24 whole hours ending at the newest whole measured hour (the current hour when
 *  nothing is measured, all null). */
export function windowRange24h(span: Record<string, string> | null, nowMs: number): { fromMs: number; toMs: number } {
  const H = stepMsOf("1h");
  const m = parseSpan(span);
  const toMs = Math.floor((m ? m.to : nowMs) / H) * H;
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
  const names = parseNames(input.names);

  const buckets: number[] = [];
  for (let t = Math.floor(fromMs / step) * step; t < toMs; t += step) buckets.push(t);

  const isOrg = spec.kind === "organisation";
  const sums = new Map<string, number>();
  const perBucket: (Map<string, number> | null)[] = buckets.map((t) => {
    if (!measured || t < measured.from || t + step > measured.to) return null;
    const { key, bucket } = subSlotOf(net, tier, t);
    return readBucket(hashes[key], bucket);
  });

  const union = new Set<string>();
  for (const m of perBucket) {
    if (!m) continue;
    for (const [id, n] of m) {
      union.add(id);
      if (isOrg) sums.set(id, (sums.get(id) ?? 0) + n);
    }
  }
  const ids = [...sums.keys()];
  const series = isOrg
    ? ids.map((id) => ({ id, points: perBucket.map((m) => (m ? (m.get(id) ?? 0) : null)) }))
    : [];
  const totals = [...sums].map(([id, updates]) => ({ id, updates }))
    .sort((a, b) => b.updates - a.updates || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  series.sort((a, b) => totals.findIndex((t) => t.id === a.id) - totals.findIndex((t) => t.id === b.id));

  let seenTotal = 0, firstSeenMs: number | null = null;
  if (isOrg) {
    const seen = new Set(Object.keys(input.names ?? {}));
    for (const [key, h] of Object.entries(input.yearHashes ?? {})) {
      const year = Number(key.slice(key.lastIndexOf(":") + 1));
      for (const f of Object.keys(h)) {
        const bar = f.indexOf("|");
        if (bar < 0) continue;
        seen.add(f.slice(bar + 1));
        const [mo, da] = f.slice(0, bar).split("-").map(Number);
        const ms = Date.UTC(year, mo - 1, da);
        if (Number.isFinite(ms) && (firstSeenMs === null || ms < firstSeenMs)) firstSeenMs = ms;
      }
    }
    seenTotal = seen.size;
  }

  return {
    net, kind: spec.kind, unit: spec.unit, tier, stepMs: step, buckets,
    measured, names, series,
    distinct: perBucket.map((m) => (m ? m.size : null)),
    rangeDistinct: perBucket.some((m) => m) ? union.size : null,
    totals, seenTotal, firstSeenMs,
  };
}
