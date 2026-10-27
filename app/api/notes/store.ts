// The Upstash client behind ONE narrow interface, so the notes generator and routes test against
// an in-memory fake and the command budget stays auditable here. Same client pattern as
// `app/api/trends/store.ts` (REST, no pooling, the Vercel marketplace env vars), with one change:
// automatic deserialization is OFF. A note is stored as a JSON STRING, and the client would
// otherwise hand `get` back a parsed object, breaking the string contract of this interface.
import { Redis } from "@upstash/redis";

export interface NotesStore {
  get(key: string): Promise<string | null>;
  /** MGET: many values in ONE command (the warm pass's prefetch), null where absent. */
  mget(keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, ttlS: number): Promise<void>;
  /** SET NX EX: true when this caller took the lock. */
  lock(key: string, ttlS: number): Promise<boolean>;
  unlock(key: string): Promise<void>;
  /** INCR then EXPIRE in one MULTI; the new count. */
  incr(key: string, ttlS: number): Promise<number>;
  /** HINCRBY by one then EXPIRE in one MULTI (the day's stats hash). */
  hincr(key: string, field: string, ttlS: number): Promise<void>;
}

function client(): Redis {
  const url = process.env.UPSTASH_KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Upstash env missing");
  return new Redis({ url, token, automaticDeserialization: false });
}

function wrap(r: Redis): NotesStore {
  return {
    async get(key) {
      return (await r.get<string>(key)) ?? null;
    },
    async mget(keys) {
      if (!keys.length) return [];
      return (await r.mget<(string | null)[]>(...keys)).map((v) => v ?? null);
    },
    async set(key, value, ttlS) {
      await r.set(key, value, { ex: ttlS });
    },
    async lock(key, ttlS) {
      return (await r.set(key, "1", { nx: true, ex: ttlS })) === "OK";
    },
    async unlock(key) {
      await r.del(key);
    },
    async incr(key, ttlS) {
      const tx = r.multi();
      tx.incr(key);
      tx.expire(key, ttlS);
      const res = await tx.exec<[number, number]>();
      return Number(res[0]);
    },
    async hincr(key, field, ttlS) {
      const tx = r.multi();
      tx.hincrby(key, field, 1);
      tx.expire(key, ttlS);
      await tx.exec();
    },
  };
}

/** The notes client: the WRITE token (the generator writes, and reads its own cache). */
export function notesStore(): NotesStore {
  return wrap(client());
}

/** An in-memory NotesStore for tests: TTLs honoured against `Date.now()`, so fake timers drive
 *  them. A hash counter reads back through `get` as JSON, which is all a test needs of it. */
export function memoryNotesStore(): NotesStore {
  const values = new Map<string, { v: string; exp: number }>();
  const counts = new Map<string, { n: number; exp: number }>();
  const hashes = new Map<string, { h: Record<string, number>; exp: number }>();
  const live = <T extends { exp: number }>(m: Map<string, T>, key: string): T | undefined => {
    const e = m.get(key);
    if (e && e.exp <= Date.now()) {
      m.delete(key);
      return undefined;
    }
    return e;
  };
  const expiry = (ttlS: number) => Date.now() + ttlS * 1000;
  return {
    async get(key) {
      const v = live(values, key);
      if (v) return v.v;
      const h = live(hashes, key);
      return h ? JSON.stringify(h.h) : null;
    },
    async mget(keys) {
      return keys.map((k) => live(values, k)?.v ?? null);
    },
    async set(key, value, ttlS) {
      values.set(key, { v: value, exp: expiry(ttlS) });
    },
    async lock(key, ttlS) {
      if (live(values, key)) return false;
      values.set(key, { v: "1", exp: expiry(ttlS) });
      return true;
    },
    async unlock(key) {
      values.delete(key);
    },
    async incr(key, ttlS) {
      const n = (live(counts, key)?.n ?? 0) + 1;
      counts.set(key, { n, exp: expiry(ttlS) });
      return n;
    },
    async hincr(key, field, ttlS) {
      const h = live(hashes, key)?.h ?? {};
      h[field] = (h[field] ?? 0) + 1;
      hashes.set(key, { h, exp: expiry(ttlS) });
    },
  };
}
