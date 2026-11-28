// TEST-ONLY: the in-memory `TrendsStore` the submitters and notes tests share, with the REAL CLIENT'S
// VALUE SHAPES (PR review I1/M12, 2026-11-28). Never imported by app code.
//
// Why it exists: the store wrapper (`store.ts`) keeps `@upstash/redis`'s `automaticDeserialization`
// on, so the client JSON-parses what it reads back — a stored "42" is the number 42, a stored JSON
// object an object. Fakes that handed back the strings they were given hid two production bugs (R22's
// PFCOUNT, and DED's names read as unreadable, I1). This one stores every value as the STRING Redis
// would hold and hands it back the way the client does:
// - HGETALL (`deserialize4` in the client): each value JSON-parsed, except a numeric string that is not
//   a safe integer, which stays the string; a value that does not parse stays the string. An empty
//   hash is null.
// - HMGET (`deserialize5`): each value JSON-parsed (no safe-integer exception), else the string; every
//   field absent is null for the whole reply, which the wrapper turns into nulls.
// - GET / MGET: the client's generic `parseResponse`, then the wrapper's `asString`.
// `fakeStore.test.ts` runs the real client against a stubbed fetch and holds these to it.
import type { TrendsStore, TrendsWrite } from "./store";

/** What Redis holds for a value written by the client (its `defaultSerializer`). */
const serial = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

/** One HGETALL value, as `@upstash/redis` hands it back. */
export function upstashHashValue(raw: string): unknown {
  try {
    const n = Number(raw);
    return !Number.isNaN(n) && !Number.isSafeInteger(n) ? raw : JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** One HMGET value, as `@upstash/redis` hands it back. */
export function upstashHmgetValue(raw: string | null): unknown {
  try {
    return JSON.parse(raw as string);
  } catch {
    return raw;
  }
}

/** One GET value through the client's `parseResponse` and the wrapper's `asString`. */
export function upstashStringValue(raw: string | null): string | null {
  if (raw == null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
    if (typeof v === "number" && v.toString() !== raw) v = raw;
  } catch {
    v = raw;
  }
  return v == null ? null : typeof v === "string" ? v : JSON.stringify(v);
}

export type FakeStore = TrendsStore & {
  /** The hashes as Redis holds them: every value a string. */
  data: Map<string, Map<string, string>>;
  /** The string keys (Dor's device sketches, R22) as Redis holds them. */
  str: Map<string, string>;
  locked: boolean;
  /** Every `applyWrites` call's writes, in order. */
  applies: TrendsWrite[][];
  /** Every key read (HGETALL / HMGET / GET), and `mget:<key>` for each MGET key, in order. */
  asked: string[];
};

export function fakeStore(): FakeStore {
  const data = new Map<string, Map<string, string>>();
  const str = new Map<string, string>();
  const put = (key: string, map: Record<string, unknown>) => {
    let h = data.get(key);
    if (!h) data.set(key, (h = new Map()));
    for (const [f, v] of Object.entries(map)) h.set(f, serial(v));
  };
  const s: FakeStore = {
    data, str, locked: false, applies: [], asked: [],
    async get(key) { s.asked.push(key); return upstashStringValue(str.get(key) ?? null); },
    async mget(keys) { s.asked.push(...keys.map((k) => `mget:${k}`)); return keys.map((k) => upstashStringValue(str.get(k) ?? null)); },
    async hgetall(key) {
      s.asked.push(key);
      const h = data.get(key);
      return h?.size ? Object.fromEntries([...h].map(([f, v]) => [f, upstashHashValue(v)])) : null;
    },
    async hmget(key, fields) {
      s.asked.push(key);
      const h = data.get(key);
      return fields.map((f) => (h?.has(f) ? upstashHmgetValue(h.get(f)!) : null));
    },
    async hset(key, map) { if (Object.keys(map).length) put(key, map); },
    async expire() {},
    async acquireLock() { if (s.locked) return false; s.locked = true; return true; },
    async releaseLock() { s.locked = false; },
    async applyWrites(writes) {
      s.applies.push(writes);
      for (const w of writes) {
        if (Object.keys(w.map).length) put(w.key, w.map);
        const h = data.get(w.key);
        if (h) {
          for (const f of w.hdel ?? []) h.delete(f);
          if (!h.size) data.delete(w.key);
        }
        if (w.value != null) str.set(w.key, w.value);
      }
    },
  };
  return s;
}
