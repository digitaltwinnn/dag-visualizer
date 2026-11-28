import { subField, subSketchKeyOf, subSlotOf, type SubTier } from "./keys";

const TIERS: SubTier[] = ["1h", "1d"];

/** Adds an ORGANISATION tally into BOTH tiers' fields. Invariant: a day's 1d fields equal the sum of
 *  its 1h fields (`bucket.test.ts`, and the walk's recompute in `runSubmitters.test.ts`). Its DEVICE
 *  form (R22): a day's sketch is the UNION of its hours' sketches — the sampler adds the same ids to
 *  both, and the walk's `dayWrite` rebuilds the day as the merge of its 24 hours. */
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

/** Per sketch key: its tier, a time inside its bucket (for the bucket's count field), the ids to add. */
export type DeviceAdds = Map<string, { tier: SubTier; tsMs: number; ids: Set<string> }>;

/** Collects a DEVICE tally's ids under BOTH tiers' sketch keys (R22, `subSketchKeyOf`): a set to add
 *  into the stored sketch, never a field. Adding is idempotent, so the day stays the union of its hours. */
export function bucketDevices(
  adds: DeviceAdds,
  netId: string,
  tsMs: number,
  tally: { id: string; updates: number }[],
): void {
  for (const tier of TIERS) {
    const key = subSketchKeyOf(netId, tier, tsMs);
    let e = adds.get(key);
    if (!e) adds.set(key, (e = { tier, tsMs, ids: new Set() }));
    for (const { id } of tally) e.ids.add(id);
  }
}

/** The measured span after a read of `[readFromMs, readToMs]`: `from` is KEPT whatever the read
 *  (ruling R20 — a gap is a HOLE, `holeOf`, never a restart that erases the history before it); `to`
 *  moves out to the read's end. With no span yet the read starts one. */
export function nextSpan(
  prev: { from?: number; to?: number } | null,
  readFromMs: number,
  readToMs: number,
): { from: number; to: number } {
  if (prev?.from != null && prev.to != null) {
    return { from: Math.min(prev.from, readFromMs), to: Math.max(prev.to, readToMs) };
  }
  return { from: readFromMs, to: readToMs };
}

const HOUR_MS = 3600000;

/** THE HOURS A GAP LEAVES UNMEASURED (R20): from the hour holding the span's old `to` (counted only up
 *  to it) to the END of the hour holding the first record read after the gap. That hour is taken in
 *  even when the record sits on its edge: metagraph snapshots share their global's timestamp, so a
 *  missed one may carry the very same stamp. */
export function holeOf(prevToMs: number, firstMs: number): { from: number; to: number } {
  return { from: Math.floor(prevToMs / HOUR_MS) * HOUR_MS, to: Math.floor(firstMs / HOUR_MS) * HOUR_MS + HOUR_MS };
}
