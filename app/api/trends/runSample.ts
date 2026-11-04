// One sampler run: cursor → grow-until-cursor fetches → bucket → merge-write one key per
// tier → advance cursor. Dependency-injected so the whole contract is unit-tested; the
// route provides the real deps. Command budget per run: 1 lock + 1 hgetall (cursor) +
// 1 hmget per touched tier or geo key (reads, pre-transaction) + 1 applyWrites MULTI/EXEC
// (every touched key's HSET + EXPIRE, plus the cursor HSET) + 1 del ≈ 8. The explorer side adds one
// small transfer-list read per chain that sealed snapshots since the last run, plus the DAG's.
//
// TRANSFERS RIDE THE SNAPSHOTS THAT CARRIED THEM (2026-11-04). A transfer list is keyed by the
// snapshot ordinal that sealed each transfer, so each list is read for exactly the ordinals the
// snapshot walk beside it has now passed: the DAG's for the global span (its own cursor `x`/`xTs`,
// so a failed transfer read never stalls the spine), a network's for its own chain (`x.<id>`,
// `xTs.<id>`). A list that failed keeps its cursor and the next run reads the span again; the
// buckets the DAG list was read for carry `x.cov` (`markTransferCoverage`).
//
// The write phase is ALL-OR-NOTHING (data + cursor together): the hmgets read prior values
// first (race-free — the lock excludes every other run), the merged maps are computed in
// memory, and only then does ONE applyWrites transaction commit everything. A run that
// dies mid-write-phase leaves the store exactly as it was — no key half-updated, no cursor
// advanced past data that didn't land — so the NEXT run's hmget reads are still consistent
// with what actually got merged, and nothing double-counts.
import { TTL_S, chainReadField, cursorKeyOf, lockKeyOf, ispNamesKeyOf, slotOf, fieldOf, type Tier } from "./keys";
import { mergeVals } from "./merge";
import {
  bucketGlobals, bucketMetas, bucketFleet, bucketFleetGeo, bucketStake, bucketTransfers, markTransferCoverage, markUnlistedCoverage,
  type FleetCounts, type GlobalRec, type IncMap, type MetaRec, type TxRec,
} from "./bucketing";
import { listBetween, listSince, type ChainPage } from "./fetchSince";
import type { StakeReading } from "./stake";
import { stakeValidatorsKeyOf } from "./keys";
import type { TrendsStore, TrendsWrite } from "./store";

export interface SampleDeps {
  net: string;
  metaIds: string[];
  /** The UNLISTED chains to sample for their own count (the explorer's list less every tracked
   *  address), or null when that list could not be read — then no unlisted coverage is marked. */
  unlistedIds?: () => Promise<string[] | null>;
  store: TrendsStore;
  pageGlobals(limit: number, next?: string): Promise<ChainPage<GlobalRec>>;
  pageMeta(id: string, limit: number, next?: string): Promise<ChainPage<MetaRec>>;
  /** Fleet counts, or null when the loaders failed — null writes NOTHING (an absent gauge
   *  is an honest gap; a zeroed fleet would be a fabricated reading). */
  fleet(): Promise<FleetCounts | null>;
  /** One page of a transfer list, newest first: `"dag"` for the DAG's own, else a network's token
   *  (2026-11-04). Absent: no transfers are read. */
  pageTransfers?(chain: "dag" | string, limit: number, next?: string): Promise<ChainPage<TxRec>>;
  /** The delegated-staking registry's reading, or null when it could not be read — null writes
   *  nothing and leaves the hour to the next run (2026-11-04). Absent: no stake is sampled. */
  stake?(): Promise<StakeReading | null>;
  now(): number;
}

export interface SampleResult {
  skipped?: "locked";
  wroteFields: number;
  gap: boolean;
  metaErrors: string[];
  /** The transfer lists that could not be read this run (`"dag"` or a chain id). */
  txErrors?: string[];
}

const tierOfKey = (key: string): Tier => key.split(":")[2] as Tier;
/** The geo family has no tier segment and keeps forever (`keys.ts` `geoSlotOf`). */
const ttlOfKey = (key: string): number | null => (key.split(":")[0] !== "t" ? null : TTL_S[tierOfKey(key)]); // geo and stake keep forever
const txKey = (r: TxRec): number => r.snapshotOrdinal;

export async function runSample(deps: SampleDeps): Promise<SampleResult> {
  const { net, store } = deps;
  // Lock TTL 900 s — WELL above the route's maxDuration (300 s), per the releaseLock
  // invariant in store.ts: an unconditional DEL is only safe while no run can outlive its
  // own lock.
  if (!(await store.acquireLock(lockKeyOf(net), 900))) {
    return { skipped: "locked", wroteFields: 0, gap: false, metaErrors: [] };
  }
  try {
    const cursorKey = cursorKeyOf(net);
    const cur = (await store.hgetall(cursorKey)) ?? {};
    const gSince = cur.g != null ? Number(cur.g) : -1;
    const gTs = cur.gTs != null ? Number(cur.gTs) : null;

    const inc: IncMap = new Map();
    const cursorNext: Record<string, string | number> = { v: 1 };

    // Global spine.
    const g = await listSince(deps.pageGlobals, gSince);
    if (g.recs.length) {
      bucketGlobals(inc, net, g.recs, g.gap ? null : gTs); // an accepted gap breaks the gap chain too
      const newest = g.recs[g.recs.length - 1];
      cursorNext.g = newest.ordinal;
      cursorNext.gTs = Date.parse(newest.timestamp);
    }

    // The DAG's transfers, for the global span read so far. A first run with a known spine starts
    // the transfer cursor at the spine's (nothing before it is claimed); a cold spine starts it at
    // this run's newest global, whose own transfers were sealed before any coverage is claimed.
    const txErrors: string[] = [];
    const gNew = cursorNext.g != null ? Number(cursorNext.g) : gSince >= 0 ? gSince : null;
    const gNewTs = cursorNext.gTs != null ? Number(cursorNext.gTs) : gTs;
    if (deps.pageTransfers && gNew != null && gNewTs != null) {
      const x = cur.x != null ? Number(cur.x) : gSince >= 0 ? gSince : null;
      const xTs = cur.xTs != null ? Number(cur.xTs) : gSince >= 0 ? gTs : null;
      if (x == null || xTs == null) {
        cursorNext.x = gNew;
        cursorNext.xTs = gNewTs;
      } else if (gNew > x) {
        try {
          const r = await listBetween((limit, next) => deps.pageTransfers!("dag", limit, next), txKey, x, gNew);
          bucketTransfers(inc, net, "dag", r.recs);
          // Past the self-heal depth only what was read is claimed (rule 10).
          const from = r.gap ? (r.recs.length ? Date.parse(r.recs[0].timestamp) : gNewTs) : xTs;
          markTransferCoverage(inc, net, from, gNewTs);
          cursorNext.x = gNew;
          cursorNext.xTs = gNewTs;
        } catch {
          txErrors.push("dag");
        }
      }
    }

    // Per-metagraph, in parallel; a failure moves nothing for that id (self-heals next run).
    // The UNLISTED chains ride the same walk (their own cursors), counted but kept out of the floors.
    const metaErrors: string[] = [];
    const unlisted = deps.unlistedIds ? await deps.unlistedIds().catch(() => null) : null;
    const unlistedSet = new Set(unlisted ?? []);
    const ids = [...deps.metaIds, ...(unlisted ?? []).filter((id) => !deps.metaIds.includes(id))];
    const settled = await Promise.allSettled(
      ids.map(async (id) => {
        const since = cur[`m.${id}`] != null ? Number(cur[`m.${id}`]) : -1;
        const r = await listSince((limit, next) => deps.pageMeta(id, limit, next), since);
        // The chain's token transfers, for the snapshots its walk has now passed. A cold transfer
        // cursor starts at the chain's snapshot cursor (−1 for a chain never read: from genesis,
        // as its snapshot walk did). A failed read is reported and moves nothing for transfers.
        const upTo = r.recs.length ? r.recs[r.recs.length - 1].ordinal : since;
        const upToTs = r.recs.length ? Date.parse(r.recs[r.recs.length - 1].timestamp) : cur[`mTs.${id}`] != null ? Number(cur[`mTs.${id}`]) : null;
        const xFrom = cur[`x.${id}`] != null ? Number(cur[`x.${id}`]) : since;
        let tx: { recs: TxRec[]; upTo: number; upToTs: number | null } | "failed" | null = null;
        if (deps.pageTransfers && upTo > xFrom) {
          tx = await listBetween((limit, next) => deps.pageTransfers!(id, limit, next), txKey, xFrom, upTo)
            .then((t) => ({ recs: t.recs, upTo, upToTs }))
            .catch(() => "failed" as const);
        }
        return { id, r, tx };
      }),
    );
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      if (s.status === "rejected") { metaErrors.push(ids[i]); continue; }
      const { id, r, tx } = s.value;
      if (tx === "failed") txErrors.push(id);
      else if (tx) {
        bucketTransfers(inc, net, id, tx.recs);
        cursorNext[`x.${id}`] = tx.upTo;
        if (tx.upToTs != null) cursorNext[`xTs.${id}`] = tx.upToTs;
      }
      if (!unlistedSet.has(id)) cursorNext[chainReadField(id)] = deps.now();
      if (r.recs.length) {
        // The per-chain gap chain rides its own timestamp cursor; an accepted gap breaks the
        // chain (null) exactly as the global spine's does.
        const prevTs = cur[`mTs.${id}`] != null ? Number(cur[`mTs.${id}`]) : null;
        bucketMetas(inc, net, id, r.recs, r.gap ? null : prevTs, !unlistedSet.has(id));
        cursorNext[`m.${id}`] = r.recs[r.recs.length - 1].ordinal;
        cursorNext[`mTs.${id}`] = Date.parse(r.recs[r.recs.length - 1].timestamp);
      }
    }

    // The buckets this run measured the unlisted channels in — only when their list was read and
    // every one of their chains answered (a partial read must not claim the bucket's whole count).
    if (unlisted && !metaErrors.some((id) => unlistedSet.has(id))) markUnlistedCoverage(inc);

    // Fleet gauge, once per hour: sample only when the CURRENT hour slot has no reading yet
    // (idempotent across runs and restarts — no boundary bookkeeping).
    const hourSlot = slotOf(net, "1h", deps.now());
    const [hasFleet] = await store.hmget(hourSlot.key, [fieldOf(hourSlot.bucket, "f.nodes")]);
    let ispNames: Record<string, string> = {};
    if (hasFleet == null) {
      const fleet = await deps.fleet();
      if (fleet) bucketFleet(inc, net, deps.now(), fleet);
      if (fleet?.geo) {
        bucketFleetGeo(inc, net, deps.now(), fleet.geo);
        ispNames = fleet.geo.providerNames;
      }
    }

    // Delegated stake, once per hour, on its own slot (a fleet failure never spends it).
    let validators: Record<string, string> = {};
    if (deps.stake) {
      const [hasStake] = await store.hmget(hourSlot.key, [fieldOf(hourSlot.bucket, "f.stake")]);
      if (hasStake == null) {
        const reading = await deps.stake().catch(() => null);
        if (reading) {
          bucketStake(inc, net, deps.now(), reading);
          validators = Object.fromEntries(reading.perValidator.map((v) => [v.key, JSON.stringify({ id: v.id, name: v.name })]));
        }
      }
    }

    // Compute every touched key's merged map first (hmget reads stay per-key, as before —
    // the lock makes read-then-transact race-free); the cursor advance rides along as one
    // more write in the SAME transaction, so data and cursor commit together or not at all.
    let wroteFields = 0;
    const writes: TrendsWrite[] = [];
    for (const [key, fields] of inc) {
      const names = [...fields.keys()];
      const prev = await store.hmget(key, names);
      const out: Record<string, number> = {};
      names.forEach((f, i) => {
        const p = prev[i] == null ? undefined : Number(prev[i]);
        out[f] = mergeVals(f.split("|")[1], p, fields.get(f)!);
      });
      writes.push({ key, map: out, ttlS: ttlOfKey(key) });
      wroteFields += names.length;
    }

    // Provider names ride the same transaction: a stored key is never written without its name.
    if (Object.keys(ispNames).length) writes.push({ key: ispNamesKeyOf(net), map: ispNames, ttlS: null });
    if (Object.keys(validators).length) writes.push({ key: stakeValidatorsKeyOf(net), map: validators, ttlS: null });
    if (Object.keys(cursorNext).length > 1) writes.push({ key: cursorKeyOf(net), map: cursorNext, ttlS: null });
    if (writes.length) await store.applyWrites(writes);
    return { wroteFields, gap: g.gap, metaErrors, txErrors };
  } finally {
    await store.releaseLock(lockKeyOf(net));
  }
}
