// The Upstash client behind ONE narrow interface, so runSample tests against an in-memory
// fake and the command budget stays auditable here. REST + per-call pipelining is the
// Upstash usage contract (spec): no TCP pooling, hashes + EXPIRE only — and, for the submitters
// family alone, plain string values (SET / GET / MGET): Dor's device sketches (ruling R22,
// `app/api/submitters/sketch.ts`). No PF command: the read-only token is refused PFCOUNT.
import { Redis } from "@upstash/redis";

/** One key's writes in a transaction: `map` HSET, then `hdel` fields deleted (the submitters' holes,
 *  `walkHoles`), then `value` SET as the key's plain string (Dor's device sketch, R22), then the
 *  EXPIRE. A key is a hash or a string, never both. */
export interface TrendsWrite { key: string; map: Record<string, number | string>; ttlS: number | null; hdel?: string[]; value?: string }

/** A hash field's value as the client hands it back. `@upstash/redis` JSON-parses every HGETALL and
 *  HMGET value (`automaticDeserialization`, on): a stored "42" comes back the NUMBER 42, a stored JSON
 *  object an OBJECT, and only a value that does not parse (or, on HGETALL, a number that is not a safe
 *  integer) the raw string. So a reader never assumes a string: `Number(v)` for a count, and a JSON
 *  field read in either form (`names.ts` `stored`). The test fake does the same
 *  (`fakeStore.ts`, pinned to the real client by `fakeStore.test.ts`). */
export type HashValue = unknown;
/** One hash as HGETALL hands it back (`HashValue`). */
export type StoredHash = Record<string, HashValue>;

export interface TrendsStore {
  hgetall(key: string): Promise<StoredHash | null>;
  /** Each field's value in `fields`' order, null where absent. */
  hmget(key: string, fields: string[]): Promise<HashValue[]>;
  hset(key: string, map: Record<string, string | number>): Promise<void>;
  expire(key: string, s: number): Promise<void>;
  /** GET: a string key's value, null when absent. */
  get(key: string): Promise<string | null>;
  /** MGET: each key's value in `keys`' order, null where absent; chunked at MGET_CHUNK keys a request. */
  mget(keys: string[]): Promise<(string | null)[]>;
  acquireLock(key: string, ttlS: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
  /** Every HSET (+ EXPIRE) for this run, the cursor included, as ONE Upstash MULTI/EXEC —
   *  so a run's data writes and its cursor advance commit together or not at all. Without
   *  this, a later key's write failing after an earlier key's landed left the additive
   *  series double-counted on the retry (the cursor hadn't moved, so the same deltas
   *  re-merge into an already-updated key). */
  applyWrites(writes: TrendsWrite[]): Promise<void>;
}

/** Keys per MGET request. A device sketch is ~5.5 KB stored, but the client's default
 *  `responseEncoding: "base64"` encodes every value again in transit, so it is ~7.3 KB on the wire and
 *  a full chunk ~730 KB. */
export const MGET_CHUNK = 100;

/** A string value as stored. `automaticDeserialization` stays on (the hashes rely on it): the only
 *  strings stored are `hll12:` sketches, which never parse as JSON, so they come back untouched. */
const asString = (v: unknown): string | null => (v == null ? null : typeof v === "string" ? v : JSON.stringify(v));

function client(token: string | undefined): Redis {
  const url = process.env.UPSTASH_KV_REST_API_URL;
  if (!url || !token) throw new Error("Upstash env missing");
  return new Redis({ url, token });
}

function wrap(r: Redis): TrendsStore {
  return {
    async hgetall(key) {
      return (await r.hgetall<StoredHash>(key)) ?? null;
    },
    async hmget(key, fields) {
      if (!fields.length) return [];
      const res = await r.hmget<Record<string, HashValue>>(key, ...fields);
      return fields.map((f) => (res ? (res[f] ?? null) : null));
    },
    async hset(key, map) {
      if (Object.keys(map).length) await r.hset(key, map);
    },
    async expire(key, s) {
      await r.expire(key, s);
    },
    async get(key) {
      return asString(await r.get<unknown>(key));
    },
    async mget(keys) {
      const chunks: string[][] = [];
      for (let i = 0; i < keys.length; i += MGET_CHUNK) chunks.push(keys.slice(i, i + MGET_CHUNK));
      const got = await Promise.all(chunks.map((c) => r.mget<unknown[]>(...c)));
      return got.flat().map(asString);
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
        if (w.value != null) tx.set(w.key, w.value);
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
