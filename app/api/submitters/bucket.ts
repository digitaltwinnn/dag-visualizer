import { subField, subSlotOf, type SubTier } from "./keys";

const TIERS: SubTier[] = ["1h", "1d"];

/** Adds a tally into BOTH tiers' fields. Invariant: a day's 1d fields equal the sum (and, for
 *  devices, the union) of its 1h fields. A device's field value is its check-ins; distinctness
 *  is read from field presence. */
export function bucketSubmitters(
  inc: Map<string, Map<string, number>>,
  netId: string,
  tsMs: number,
  tally: { id: string; updates: number }[],
): void {
  for (const tier of TIERS) {
    const { key, bucket } = subSlotOf(netId, tier, tsMs);
    let fields = inc.get(key);
    if (!fields) inc.set(key, (fields = new Map()));
    for (const { id, updates } of tally) {
      const f = subField(bucket, id);
      fields.set(f, (fields.get(f) ?? 0) + updates);
    }
  }
}

/** Extends the measured span only when the read is contiguous with it; otherwise a new span
 *  starts at the read (an outage before it is not measured). */
export function nextSpan(
  prev: { from?: number; to?: number } | null,
  readFromMs: number,
  readToMs: number,
): { from: number; to: number } {
  if (prev?.from != null && prev.to != null && readFromMs <= prev.to) {
    return { from: Math.min(prev.from, readFromMs), to: Math.max(prev.to, readToMs) };
  }
  return { from: readFromMs, to: readToMs };
}
