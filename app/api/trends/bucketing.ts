// Records → per-tier bucket increments. Buckets are assigned by each record's OWN timestamp
// (never fetch time), which is what makes bucket resolution independent of run cadence.
// The IncMap folds repeats WITHIN a run through the same merge ops the store applies
// ACROSS runs, so both layers speak one semantics (merge.ts).
import { TIERS, slotOf, fieldOf, geoSitesSlotOf, geoSlotOf, stakeSlotOf, type Tier } from "./keys";
import type { FleetGeo } from "./fleetGeo";
import type { StakeReading } from "./stake";
import { mergeVals } from "./merge";

export interface GlobalRec { ordinal: number; timestamp: string; metagraphSnapshotCount?: number; blocks?: unknown[] }
/** One transfer, DAG or a network's token (2026-11-04): `snapshotOrdinal` is the snapshot that
 *  carried it — the global for a DAG transfer, the network's own for a token transfer — and
 *  `timestamp` that snapshot's time. Amount and fee are in datum (1e-8 of the token). */
export interface TxRec { snapshotOrdinal: number; timestamp: string; amount?: number; fee?: number }
export interface MetaRec { ordinal: number; timestamp: string; fee?: number; sizeInKB?: number; blocks?: unknown[] }
export interface FleetCounts {
  /** The whole fleet — absent when the DAG's count is unknown this sample (its clusters could not
   *  be read): `f.nodes` is then not written, an honest gap, never a lower total (2026-10-29). */
  total?: number;
  perNet: Record<string, number>;
  /** Per-network per-layer role tallies — f.layer.{id}.{role} (2026-09-11). */
  perNetLayers?: Record<string, Record<string, number>>;
  /** Per-network node TYPE counts — f.type.{id}.{key} (2026-09-29; key = `roleKey`). Unlike the
   *  role tallies above these PARTITION the network's nodes (each node has one type), so they sum
   *  to f.nodes.{id} and can be stacked. */
  perNetTypes?: Record<string, Record<string, number>>;
  layers: Record<string, number>;
  countries: Record<string, number>;
  /** Where the fleet runs, for the geo family (2026-10-27) — absent when the tally was not
   *  taken, which writes nothing there (an honest gap). */
  geo?: FleetGeo;
}

/** redis key → field → value (merge-folded within this run). */
export type IncMap = Map<string, Map<string, number>>;

export function addInc(inc: IncMap, tsMs: number, series: string, value: number, tiers: Tier[] = TIERS): void {
  for (const tier of tiers) {
    const { key, bucket } = slotOf(tier, tsMs);
    const field = fieldOf(bucket, series);
    let m = inc.get(key);
    if (!m) { m = new Map(); inc.set(key, m); }
    m.set(field, mergeVals(series, m.get(field), value));
  }
}

/** Global spine: ticks/anchors/blocks sums, gap stats, and the g.ticks COVERAGE zero-fill.
 *  `prevTickTsMs` is the previous run's newest tick — the cross-run gap boundary; null on
 *  a cold cursor (first gap starts at the first in-batch pair, nothing is invented). */
export function bucketGlobals(inc: IncMap, recs: GlobalRec[], prevTickTsMs: number | null): void {
  let prev = prevTickTsMs;
  for (const r of recs) {
    const t = Date.parse(r.timestamp);
    addInc(inc, t, "g.ticks", 1);
    const anchored = typeof r.metagraphSnapshotCount === "number" ? r.metagraphSnapshotCount : 0;
    addInc(inc, t, "g.anchors", anchored);
    addInc(inc, t, "g.anchorsMax", anchored); // the largest global snapshot, the Snapshots card's row
    addInc(inc, t, "g.blocks", Array.isArray(r.blocks) ? r.blocks.length : 0);
    if (prev != null) {
      const gap = Math.max(0, Math.round((t - prev) / 1000));
      addInc(inc, t, "g.gapMax", gap);
      addInc(inc, t, "g.gapSum", gap);
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
    for (let t = fillFrom; t <= to; t += 300000) addInc(inc, t, "g.ticks", 0, ["5m"]);
    for (let t = fillFrom; t <= to; t += 3600000) addInc(inc, t, "g.ticks", 0, ["1h"]);
    for (let t = fillFrom; t <= to; t += 86400000) addInc(inc, t, "g.ticks", 0, ["1d"]);
  }
}

/** One metagraph's snapshots: exact per-net sums plus the tracked-total floors.
 *
 *  `gapChain` opts INTO per-network gap stats (m.{id}.gapSum / m.{id}.gapMax — the metagraph
 *  Continuity reading, 2026-09-07) and the anchoring count (m.{id}.ticks, 2026-10-08): pass the previous run's newest record timestamp (null to
 *  open a fresh chain, e.g. after an accepted gap). Omit it entirely when record order isn't
 *  guaranteed oldest→newest — the rebuild script's page streams — and no gap is invented. */
export function bucketMetas(inc: IncMap, id: string, recs: MetaRec[], gapChain?: number | null, floors = true): void {
  let prev = gapChain === undefined ? undefined : gapChain;
  for (const r of recs) {
    const t = Date.parse(r.timestamp);
    addInc(inc, t, `m.${id}.snaps`, 1);
    addInc(inc, t, `m.${id}.fee`, r.fee || 0);
    addInc(inc, t, `m.${id}.kb`, r.sizeInKB || 0);
    // Each network's own sealed blocks (2026-09-11 — transfers of its token and a data
    // network's application records ride in blocks; the raw cron records carry the array).
    addInc(inc, t, `m.${id}.blocks`, Array.isArray(r.blocks) ? r.blocks.length : 0);
    // The floors are the CATALOG's (the fee card's "every network summed" lower bound): an unlisted
    // chain sampled for its own count stays out of them (`floors: false`).
    if (floors) {
      addInc(inc, t, "g.feeFloor", r.fee || 0);
      addInc(inc, t, "g.kbFloor", r.sizeInKB || 0);
    }
    if (prev !== undefined) {
      if (prev != null) {
        const gap = Math.max(0, Math.round((t - prev) / 1000));
        addInc(inc, t, `m.${id}.gapSum`, gap);
        addInc(inc, t, `m.${id}.gapMax`, gap);
      }
      // ANCHORINGS — the global ticks that carried this chain's snapshots (user, 2026-10-08: "I
      // think they created one every 3s, but anchored to global only ~30s"). A metagraph snapshot
      // carries the stamp of the global it anchored into, so a new stamp in an ordered stream is a
      // new anchoring; a stamp equal to the previous run's newest is a tick that straddled two
      // runs and was counted by the first. Rides the gap chain's ordering guarantee, for the same
      // reason the gaps do.
      if (t !== prev) addInc(inc, t, `m.${id}.ticks`, 1);
      prev = t;
    }
  }
}

/** Fleet gauges: hourly + daily tiers only (point samples), per-country daily only
 *  (cardinality control — spec). */
export function bucketFleet(inc: IncMap, tsMs: number, fleet: FleetCounts): void {
  const tiers: Tier[] = ["1h", "1d"];
  if (fleet.total != null) addInc(inc, tsMs, "f.nodes", fleet.total, tiers);
  for (const [id, n] of Object.entries(fleet.perNet)) addInc(inc, tsMs, `f.nodes.${id}`, n, tiers);
  for (const [layer, n] of Object.entries(fleet.layers)) addInc(inc, tsMs, `f.layer.${layer}`, n, tiers);
  for (const [id, roles] of Object.entries(fleet.perNetLayers ?? {}))
    for (const [layer, n] of Object.entries(roles)) addInc(inc, tsMs, `f.layer.${id}.${layer}`, n, tiers);
  for (const [id, types] of Object.entries(fleet.perNetTypes ?? {}))
    for (const [key, n] of Object.entries(types)) addInc(inc, tsMs, `f.type.${id}.${key}`, n, tiers);
  for (const [cc, n] of Object.entries(fleet.countries)) addInc(inc, tsMs, `f.cc.${cc}`, n, ["1d"]);
}

/** The geo family's daily gauges (`keys.ts` `geoSlotOf`): the day's LAST hourly reading, as
 *  every `f.*` gauge merges ("set"). Written beside, not instead of, the tiers' `f.cc.<cc>`. */
export function bucketFleetGeo(inc: IncMap, tsMs: number, geo: FleetGeo): void {
  const { key, bucket } = geoSlotOf(tsMs);
  let m = inc.get(key);
  if (!m) { m = new Map(); inc.set(key, m); }
  const put = (series: string, v: number) => m.set(fieldOf(bucket, series), mergeVals(series, m.get(fieldOf(bucket, series)), v));
  for (const [cc, n] of Object.entries(geo.countries)) put(`f.cc.${cc}`, n);
  for (const [k, n] of Object.entries(geo.providers)) put(`f.isp.${k}`, n);
  for (const [id, by] of Object.entries(geo.perNetCountries)) for (const [cc, n] of Object.entries(by)) put(`f.cc.${id}.${cc}`, n);
  for (const [id, by] of Object.entries(geo.perNetProviders)) for (const [k, n] of Object.entries(by)) put(`f.isp.${id}.${k}`, n);
  const sites = Object.entries(geo.sites);
  if (!sites.length) return;
  const slot = geoSitesSlotOf(tsMs);
  let own = inc.get(slot.key);
  if (!own) { own = new Map(); inc.set(slot.key, own); }
  for (const [site, n] of sites) {
    const field = fieldOf(slot.bucket, `f.site.${site}`);
    own.set(field, mergeVals(`f.site.${site}`, own.get(field), n));
  }
}

/** TRANSFERS (2026-11-04 — user: transactions were "missing in the trends view"). Every transfer
 *  a chain's list holds, bucketed by its snapshot's time: the DAG's own as `g.tx` (count),
 *  `g.txAmt` (DAG moved) and `g.txFee` (datum), a network's token as `m.<id>.tx` / `.txAmt` (in its
 *  own token, so never summed across networks) / `.txFee`. Counters, every tier. */
export function bucketTransfers(inc: IncMap, chain: "dag" | string, recs: readonly TxRec[]): void {
  const p = chain === "dag" ? "g" : `m.${chain}`;
  for (const r of recs) {
    const t = Date.parse(r.timestamp);
    addInc(inc, t, `${p}.tx`, 1);
    addInc(inc, t, `${p}.txAmt`, (Number(r.amount) || 0) / 1e8);
    addInc(inc, t, `${p}.txFee`, Number(r.fee) || 0);
  }
}

/** THE TRANSFERS' COVERAGE MARKER (2026-11-04): `x.cov` on every bucket, in every tier, from
 *  `fromMs` to `toMs` (both ends' buckets included) — the span whose DAG transfer list was read,
 *  so a bucket with no transfer reads as measured-none and a bucket nobody read (before the
 *  sampler shipped, before the fill reached, a failed read) as not measured. History's
 *  covered-counter zero-fill would otherwise claim every `g.ticks` bucket since 2025 transferred
 *  nothing. A presence marker, so "set" (`merge.ts`). */
export function markTransferCoverage(inc: IncMap, fromMs: number, toMs: number, tiers: Tier[] = TIERS): void {
  if (!(toMs >= fromMs)) return;
  for (const tier of tiers) {
    const step = tier === "5m" ? 300_000 : tier === "1h" ? 3_600_000 : 86_400_000;
    for (let t = fromMs; t <= toMs; t += step) addInc(inc, t, "x.cov", 0, [tier]);
    addInc(inc, toMs, "x.cov", 0, [tier]);
  }
}

/** DELEGATED STAKE (2026-11-04, `stake.ts`): the registry's totals as hourly + daily gauges —
 *  `f.stake` (DAG delegated), `f.stake.live` (to validators in the cluster), `f.stake.delegations`,
 *  `f.stake.validators` — and each validator's own reading in the stake family (`stakeSlotOf`),
 *  the day's last hourly reading. */
export function bucketStake(inc: IncMap, tsMs: number, s: StakeReading): void {
  const tiers: Tier[] = ["1h", "1d"];
  addInc(inc, tsMs, "f.stake", s.total, tiers);
  addInc(inc, tsMs, "f.stake.live", s.live, tiers);
  addInc(inc, tsMs, "f.stake.delegations", s.delegations, tiers);
  addInc(inc, tsMs, "f.stake.validators", s.validators, tiers);
  const { key, bucket } = stakeSlotOf(tsMs);
  let m = inc.get(key);
  if (!m) { m = new Map(); inc.set(key, m); }
  for (const v of s.perValidator) {
    m.set(fieldOf(bucket, `f.stake.${v.key}`), v.dag);
    m.set(fieldOf(bucket, `f.stakeAddrs.${v.key}`), v.addrs);
    m.set(fieldOf(bucket, `f.stakeLive.${v.key}`), v.live ? 1 : 0);
  }
}

/** THE UNLISTED COVERAGE MARKER (2026-10-08). The unlisted channels' count is measured from their
 *  own chains (`m.<address>.snaps`, sampled with `floors: false`), and a bucket in which nobody read
 *  them must read as NOT MEASURED, never as zero unlisted — the honesty `g.ticks` gives the spine.
 *  So every bucket the run's global batch covered (each `g.ticks` field it wrote, the spine's own
 *  coverage) gets a `u.cov` field — called only when EVERY unlisted chain read succeeded. An hour or
 *  a day is marked by any one good run inside it; a run that failed for a chain moved that chain's
 *  cursor nowhere, so the next good run reads its records into the same buckets (they merge). */
export function markUnlistedCoverage(inc: IncMap): void {
  for (const fields of inc.values()) {
    for (const f of [...fields.keys()]) {
      if (!f.endsWith("|g.ticks")) continue;
      const cov = f.slice(0, -"g.ticks".length) + "u.cov";
      if (!fields.has(cov)) fields.set(cov, 0);
    }
  }
}

const DAY_MS = 86_400_000;

/** WHICH OF A NEWEST→OLDEST WALK'S STAMPS ARE FINAL (2026-10-26 — user: "why save it in one go …
 *  to avoid it fails at the very end and you need to start all over?"). A walk that pages a chain
 *  newest→oldest has seen every record newer than the oldest it holds, so every UTC DAY after the
 *  oldest stamp's day is COMPLETE — including the predecessor its first record's gap is measured
 *  from, which is the newest stamp left behind. `pending` is everything walked and not yet written;
 *  the answer is the complete days (`batch`, oldest→newest), that predecessor (`pred`, null when
 *  nothing older is held) and what stays pending. Written day by day, a died walk loses at most
 *  the day it was inside. */
export function finalDays(pending: readonly number[]): { batch: number[]; pred: number | null; rest: number[] } {
  let oldest = Infinity;
  for (const t of pending) if (t < oldest) oldest = t;
  if (oldest === Infinity) return { batch: [], pred: null, rest: [] };
  const cut = Math.floor(oldest / DAY_MS) * DAY_MS + DAY_MS;
  const batch = pending.filter((t) => t >= cut).sort((a, b) => a - b);
  const rest = pending.filter((t) => t < cut);
  let pred: number | null = null;
  for (const t of rest) if (pred == null || t > pred) pred = t;
  return { batch, pred, rest };
}

/** A sorted run of one chain's stamps as its per-bucket GAPS and ANCHORINGS — the gaps backfill's
 *  arithmetic, one home whether a run is a whole chain or one batch of `finalDays`. Each stamp's gap
 *  is measured from the one before it (`pred` for the first; none when `pred` is null, so the walk's
 *  oldest record opens the chain), and a stamp distinct from its predecessor is one global snapshot
 *  that carried the chain. */
export function stampRun(run: readonly number[], pred: number | null, onGap: (tsMs: number, gapS: number) => void, onTick: (tsMs: number) => void): void {
  let prev = pred;
  for (const t of run) {
    if (prev != null) onGap(t, Math.max(0, Math.round((t - prev) / 1000)));
    if (prev == null || t !== prev) onTick(t);
    prev = t;
  }
}
