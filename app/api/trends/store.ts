// The Upstash client behind ONE narrow interface, so runSample tests against an in-memory
// fake and the command budget stays auditable here. REST + per-call pipelining is the
// Upstash usage contract (spec): no TCP pooling, hashes + EXPIRE only.
import { Redis } from "@upstash/redis";

export interface TrendsStore {
  hgetall(key: string): Promise<Record<string, string> | null>;
  hmget(key: string, fields: string[]): Promise<(string | null)[]>;
  hset(key: string, map: Record<string, string | number>): Promise<void>;
  expire(key: string, s: number): Promise<void>;
  acquireLock(key: string, ttlS: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
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
