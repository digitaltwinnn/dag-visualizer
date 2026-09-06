// The Upstash client behind ONE narrow interface, so runSample tests against an in-memory
// fake and the command budget stays auditable here. REST + per-call pipelining is the
// Upstash usage contract (spec): no TCP pooling, hashes + EXPIRE only.
import { Redis } from "@upstash/redis";

export interface TrendsWrite { key: string; map: Record<string, number | string>; ttlS: number | null }

export interface TrendsStore {
  hgetall(key: string): Promise<Record<string, string> | null>;
  hmget(key: string, fields: string[]): Promise<(string | null)[]>;
  hset(key: string, map: Record<string, string | number>): Promise<void>;
  expire(key: string, s: number): Promise<void>;
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
    async acquireLock(key, ttlS) {
      return (await r.set(key, "1", { nx: true, ex: ttlS })) === "OK";
    },
    async releaseLock(key) {
      await r.del(key);
    },
    async applyWrites(writes) {
      if (!writes.length) return;
      const tx = r.multi(); // MULTI/EXEC — a real transaction, not the non-atomic .pipeline()
      for (const w of writes) {
        if (Object.keys(w.map).length) tx.hset(w.key, w.map);
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
