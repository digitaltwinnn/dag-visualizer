// The Upstash client behind ONE narrow interface, so runSample tests against an in-memory
// fake and the command budget stays auditable here. REST + per-call pipelining is the
// Upstash usage contract (spec): no TCP pooling, hashes + EXPIRE only — and, for the submitters
// family alone, Dor's HyperLogLogs (PFADD / PFCOUNT, ruling R19).
import { Redis } from "@upstash/redis";

/** One key's writes in a transaction: `map` HSET, then `hdel` fields deleted (the submitters' holes,
 *  `walkHoles`), then `pfadd` elements added to the key as a HyperLogLog (Dor's devices, R19), then the
 *  EXPIRE. A key is a hash or an HLL, never both. */
export interface TrendsWrite { key: string; map: Record<string, number | string>; ttlS: number | null; hdel?: string[]; pfadd?: string[] }

export interface TrendsStore {
  hgetall(key: string): Promise<Record<string, string> | null>;
  hmget(key: string, fields: string[]): Promise<(string | null)[]>;
  hset(key: string, map: Record<string, string | number>): Promise<void>;
  expire(key: string, s: number): Promise<void>;
  /** PFADD: `ids` into the HyperLogLog at `key` (idempotent — re-adding an id changes nothing). */
  pfadd(key: string, ids: string[]): Promise<void>;
  /** PFCOUNT over `keys`: the estimated distinct count of their UNION (~0.81% standard error). */
  pfcount(keys: string[]): Promise<number>;
  /** PFCOUNT of each key on its own, in one pipelined request (a 30-day hourly read is 720 keys). */
  pfcountEach(keys: string[]): Promise<number[]>;
  acquireLock(key: string, ttlS: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
  /** Every HSET (+ EXPIRE) for this run, the cursor included, as ONE Upstash MULTI/EXEC —
   *  so a run's data writes and its cursor advance commit together or not at all. Without
   *  this, a later key's write failing after an earlier key's landed left the additive
   *  series double-counted on the retry (the cursor hadn't moved, so the same deltas
   *  re-merge into an already-updated key). */
  applyWrites(writes: TrendsWrite[]): Promise<void>;
}

function client(token: string | undefined): Redis {
  const url = process.env.UPSTASH_KV_REST_API_URL;
  if (!url || !token) throw new Error("Upstash env missing");
  return new Redis({ url, token });
}

function wrap(r: Redis): TrendsStore {
  return {
    async hgetall(key) {
      return (await r.hgetall<Record<string, string>>(key)) ?? null;
    },
    async hmget(key, fields) {
      if (!fields.length) return [];
      const res = await r.hmget<Record<string, string | null>>(key, ...fields);
      return fields.map((f) => (res ? (res[f] ?? null) : null));
    },
    async hset(key, map) {
      if (Object.keys(map).length) await r.hset(key, map);
    },
    async expire(key, s) {
      await r.expire(key, s);
    },
    async pfadd(key, ids) {
      if (ids.length) await r.pfadd(key, ...ids);
    },
    async pfcount(keys) {
      if (!keys.length) return 0;
      const [first, ...rest] = keys;
      return r.pfcount(first!, ...rest);
    },
    async pfcountEach(keys) {
      if (!keys.length) return [];
      const p = r.pipeline(); // reads only: a pipeline, not a transaction
      for (const k of keys) p.pfcount(k);
      return (await p.exec()) as number[];
    },
    async acquireLock(key, ttlS) {
      return (await r.set(key, "1", { nx: true, ex: ttlS })) === "OK";
    },
    async releaseLock(key) {
      // Unconditional DEL (not compare-and-delete) — safe only because the sampler's
      // maxDuration (300s) stays well under this lock's TTL (900s, see acquireLock's caller):
      // a run can never still be alive when its own lock would have expired and been
      // re-acquired by a later run, so there's nothing to steal. Bump maxDuration past the
      // TTL and this DEL can delete a NEWER run's lock out from under it.
      await r.del(key);
    },
    async applyWrites(writes) {
      if (!writes.length) return;
      const tx = r.multi(); // MULTI/EXEC — a real transaction, not the non-atomic .pipeline()
      for (const w of writes) {
        if (Object.keys(w.map).length) tx.hset(w.key, w.map);
        if (w.hdel?.length) tx.hdel(w.key, ...w.hdel);
        if (w.pfadd?.length) tx.pfadd(w.key, ...w.pfadd);
        if (w.ttlS != null) tx.expire(w.key, w.ttlS);
      }
      await tx.exec();
    },
  };
}

/** The sampler's client — the WRITE token. */
export function writeStore(): TrendsStore {
  return wrap(client(process.env.UPSTASH_KV_REST_API_TOKEN));
}
/** The public read route's client — the READ-ONLY token (least privilege, spec). */
export function readStore(): TrendsStore {
  return wrap(client(process.env.UPSTASH_KV_REST_API_READ_ONLY_TOKEN));
}
