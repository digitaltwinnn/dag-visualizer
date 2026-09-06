// Records → per-tier bucket increments. Buckets are assigned by each record's OWN timestamp
// (never fetch time), which is what makes bucket resolution independent of run cadence.
// The IncMap folds repeats WITHIN a run through the same merge ops the store applies
// ACROSS runs, so both layers speak one semantics (merge.ts).
import { TIERS, slotOf, fieldOf, type Tier } from "./keys";
import { mergeVals } from "./merge";

export interface GlobalRec { ordinal: number; timestamp: string; metagraphSnapshotCount?: number; blocks?: unknown[] }
export interface MetaRec { ordinal: number; timestamp: string; fee?: number; sizeInKB?: number }
export interface FleetCounts {
  total: number;
  perNet: Record<string, number>;
  layers: Record<string, number>;
  countries: Record<string, number>;
}

/** redis key → field → value (merge-folded within this run). */
export type IncMap = Map<string, Map<string, number>>;

export function addInc(inc: IncMap, net: string, tsMs: number, series: string, value: number, tiers: Tier[] = TIERS): void {
  for (const tier of tiers) {
    const { key, bucket } = slotOf(net, tier, tsMs);
    const field = fieldOf(bucket, series);
    let m = inc.get(key);
    if (!m) { m = new Map(); inc.set(key, m); }
    m.set(field, mergeVals(series, m.get(field), value));
  }
}

/** Global spine: ticks/anchors/blocks sums, gap stats, and the g.ticks COVERAGE zero-fill.
 *  `prevTickTsMs` is the previous run's newest tick — the cross-run gap boundary; null on
 *  a cold cursor (first gap starts at the first in-batch pair, nothing is invented). */
export function bucketGlobals(inc: IncMap, net: string, recs: GlobalRec[], prevTickTsMs: number | null): void {
  let prev = prevTickTsMs;
  for (const r of recs) {
    const t = Date.parse(r.timestamp);
    addInc(inc, net, t, "g.ticks", 1);
    addInc(inc, net, t, "g.anchors", typeof r.metagraphSnapshotCount === "number" ? r.metagraphSnapshotCount : 0);
    addInc(inc, net, t, "g.blocks", Array.isArray(r.blocks) ? r.blocks.length : 0);
    if (prev != null) {
      const gap = Math.max(0, Math.round((t - prev) / 1000));
      addInc(inc, net, t, "g.gapMax", gap);
      addInc(inc, net, t, "g.gapSum", gap);
    }
    prev = t;
  }
  // COVERAGE (rule 10): every 5m bucket the batch spans gets a g.ticks field even when no
  // tick landed in it, so the read side can tell "measured, empty" from "not measured".
  if (recs.length >= 2) {
    const from = Date.parse(recs[0].timestamp);
    const to = Date.parse(recs[recs.length - 1].timestamp);
    for (let t = from; t <= to; t += 300000) addInc(inc, net, t, "g.ticks", 0, ["5m"]);
  }
}

/** One metagraph's snapshots: exact per-net sums plus the tracked-total floors. */
export function bucketMetas(inc: IncMap, net: string, id: string, recs: MetaRec[]): void {
  for (const r of recs) {
    const t = Date.parse(r.timestamp);
    addInc(inc, net, t, `m.${id}.snaps`, 1);
    addInc(inc, net, t, `m.${id}.fee`, r.fee || 0);
    addInc(inc, net, t, `m.${id}.kb`, r.sizeInKB || 0);
    addInc(inc, net, t, "g.feeFloor", r.fee || 0);
    addInc(inc, net, t, "g.kbFloor", r.sizeInKB || 0);
  }
}

/** Fleet gauges: hourly + daily tiers only (point samples), per-country daily only
 *  (cardinality control — spec). */
export function bucketFleet(inc: IncMap, net: string, tsMs: number, fleet: FleetCounts): void {
  const tiers: Tier[] = ["1h", "1d"];
  addInc(inc, net, tsMs, "f.nodes", fleet.total, tiers);
  for (const [id, n] of Object.entries(fleet.perNet)) addInc(inc, net, tsMs, `f.nodes.${id}`, n, tiers);
  for (const [layer, n] of Object.entries(fleet.layers)) addInc(inc, net, tsMs, `f.layer.${layer}`, n, tiers);
  for (const [cc, n] of Object.entries(fleet.countries)) addInc(inc, net, tsMs, `f.cc.${cc}`, n, ["1d"]);
}
