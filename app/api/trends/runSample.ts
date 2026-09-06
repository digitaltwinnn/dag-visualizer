// One sampler run: cursor → grow-until-cursor fetches → bucket → merge-write one key per
// tier → advance cursor. Dependency-injected so the whole contract is unit-tested; the
// route provides the real deps. Command budget per run: 1 lock + 1 hgetall (cursor) +
// ≤1 hmget/hset pair per touched tier key + ≤3 expire + 1 cursor hset + 1 del ≈ 12.
import { TTL_S, cursorKeyOf, lockKeyOf, slotOf, fieldOf, type Tier } from "./keys";
import { mergeVals } from "./merge";
import {
  bucketGlobals, bucketMetas, bucketFleet,
  type FleetCounts, type GlobalRec, type IncMap, type MetaRec,
} from "./bucketing";
import { listSince } from "./fetchSince";
import type { TrendsStore } from "./store";

export interface SampleDeps {
  net: string;
  metaIds: string[];
  store: TrendsStore;
  pageGlobals(limit: number): Promise<GlobalRec[]>;
  pageMeta(id: string, limit: number): Promise<MetaRec[]>;
  /** Fleet counts, or null when the loaders failed — null writes NOTHING (an absent gauge
   *  is an honest gap; a zeroed fleet would be a fabricated reading). */
  fleet(): Promise<FleetCounts | null>;
  now(): number;
}

export interface SampleResult {
  skipped?: "locked";
  wroteFields: number;
  gap: boolean;
  metaErrors: string[];
}

const tierOfKey = (key: string): Tier => key.split(":")[2] as Tier;

export async function runSample(deps: SampleDeps): Promise<SampleResult> {
  const { net, store } = deps;
  if (!(await store.acquireLock(lockKeyOf(net), 300))) {
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

    // Per-metagraph, in parallel; a failure moves nothing for that id (self-heals next run).
    const metaErrors: string[] = [];
    const settled = await Promise.allSettled(
      deps.metaIds.map(async (id) => {
        const since = cur[`m.${id}`] != null ? Number(cur[`m.${id}`]) : -1;
        const r = await listSince((limit) => deps.pageMeta(id, limit), since);
        return { id, r };
      }),
    );
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      if (s.status === "rejected") { metaErrors.push(deps.metaIds[i]); continue; }
      const { id, r } = s.value;
      if (r.recs.length) {
        bucketMetas(inc, net, id, r.recs);
        cursorNext[`m.${id}`] = r.recs[r.recs.length - 1].ordinal;
      }
    }

    // Fleet gauge, once per hour: sample only when the CURRENT hour slot has no reading yet
    // (idempotent across runs and restarts — no boundary bookkeeping).
    const hourSlot = slotOf(net, "1h", deps.now());
    const [hasFleet] = await store.hmget(hourSlot.key, [fieldOf(hourSlot.bucket, "f.nodes")]);
    if (hasFleet == null) {
      const fleet = await deps.fleet();
      if (fleet) bucketFleet(inc, net, deps.now(), fleet);
    }

    // Merge-write: one hmget + hset per touched tier key.
    let wroteFields = 0;
    for (const [key, fields] of inc) {
      const names = [...fields.keys()];
      const prev = await store.hmget(key, names);
      const out: Record<string, number> = {};
      names.forEach((f, i) => {
        const p = prev[i] == null ? undefined : Number(prev[i]);
        out[f] = mergeVals(f.split("|")[1], p, fields.get(f)!);
      });
      await store.hset(key, out);
      const ttl = TTL_S[tierOfKey(key)];
      if (ttl != null) await store.expire(key, ttl);
      wroteFields += names.length;
    }

    if (Object.keys(cursorNext).length > 1) await store.hset(cursorKeyOf(net), cursorNext);
    return { wroteFields, gap: g.gap, metaErrors };
  } finally {
    await store.releaseLock(lockKeyOf(net));
  }
}
