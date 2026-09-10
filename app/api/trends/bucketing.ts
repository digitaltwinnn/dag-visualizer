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
  // COVERAGE (rule 10): every bucket the batch spans — IN EVERY TIER — gets a g.ticks field
  // even when no tick landed in it, so the read side can tell "measured, empty" from "not
  // measured". The hourly/daily tiers were exempt until 2026-09-10 on the silent assumption
  // that every hour holds ticks; the Sep 8 chain stall (consecutive ordinals 4h07m apart,
  // 10:40→14:47 UTC) broke it, and the 7D/30D windows painted a MEASURED chain silence in
  // the not-sampled gray instead of the stall amber. Stepping by the bucket width from an
  // arbitrary offset covers consecutive buckets and cannot skip one (the ledger's fuzz note,
  // same day); the final partial bucket is marked by its own record.
  //   And the fill starts at the CROSS-RUN BOUNDARY (prevTickTsMs, the previous run's newest
  // tick) when it is known: a batch-only span leaves a stall that crosses a run boundary
  // marked by NEITHER run — caught live twice the same day (Sep 10's 13.5-min stall at
  // 10:22→10:35 straddled two cron runs and read gray; the lone unhealed Sep-9 10:55 bucket
  // was the same blind spot, its evidence erased by repair before the mechanism was found).
  const fillFrom = prevTickTsMs ?? (recs.length >= 2 ? Date.parse(recs[0].timestamp) : null);
  if (fillFrom != null && recs.length >= 1) {
    const to = Date.parse(recs[recs.length - 1].timestamp);
    for (let t = fillFrom; t <= to; t += 300000) addInc(inc, net, t, "g.ticks", 0, ["5m"]);
    for (let t = fillFrom; t <= to; t += 3600000) addInc(inc, net, t, "g.ticks", 0, ["1h"]);
    for (let t = fillFrom; t <= to; t += 86400000) addInc(inc, net, t, "g.ticks", 0, ["1d"]);
  }
}

/** One metagraph's snapshots: exact per-net sums plus the tracked-total floors.
 *
 *  `gapChain` opts INTO per-network gap stats (m.{id}.gapSum / m.{id}.gapMax — the metagraph
 *  Continuity reading, 2026-09-07): pass the previous run's newest record timestamp (null to
 *  open a fresh chain, e.g. after an accepted gap). Omit it entirely when record order isn't
 *  guaranteed oldest→newest — the rebuild script's page streams — and no gap is invented. */
export function bucketMetas(inc: IncMap, net: string, id: string, recs: MetaRec[], gapChain?: number | null): void {
  let prev = gapChain === undefined ? undefined : gapChain;
  for (const r of recs) {
    const t = Date.parse(r.timestamp);
    addInc(inc, net, t, `m.${id}.snaps`, 1);
    addInc(inc, net, t, `m.${id}.fee`, r.fee || 0);
    addInc(inc, net, t, `m.${id}.kb`, r.sizeInKB || 0);
    addInc(inc, net, t, "g.feeFloor", r.fee || 0);
    addInc(inc, net, t, "g.kbFloor", r.sizeInKB || 0);
    if (prev !== undefined) {
      if (prev != null) {
        const gap = Math.max(0, Math.round((t - prev) / 1000));
        addInc(inc, net, t, `m.${id}.gapSum`, gap);
        addInc(inc, net, t, `m.${id}.gapMax`, gap);
      }
      prev = t;
    }
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
