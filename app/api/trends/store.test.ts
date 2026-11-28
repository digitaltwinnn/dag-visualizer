import { beforeEach, describe, expect, it, vi } from "vitest";

// The Upstash client faked at the module: what `wrap` sends, and in which shape.
const calls: unknown[][] = [];
const strings = new Map<string, unknown>();
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async get(k: string) { calls.push(["get", k]); return strings.get(k) ?? null; }
    async mget(...ks: string[]) { calls.push(["mget", ...ks]); return ks.map((k) => strings.get(k) ?? null); }
    multi() {
      const ops: unknown[][] = [];
      const tx = {
        hset: (...a: unknown[]) => { ops.push(["hset", ...a]); return tx; },
        hdel: (...a: unknown[]) => { ops.push(["hdel", ...a]); return tx; },
        set: (...a: unknown[]) => { ops.push(["set", ...a]); return tx; },
        expire: (...a: unknown[]) => { ops.push(["expire", ...a]); return tx; },
        exec: async () => { calls.push(["exec", ...ops]); return []; },
      };
      return tx;
    }
  },
}));

import { MGET_CHUNK, writeStore } from "./store";

describe("the store's string reads and writes (R22: Dor's sketches, no PF command)", () => {
  beforeEach(() => {
    calls.length = 0;
    strings.clear();
    process.env.UPSTASH_KV_REST_API_URL = "https://x";
    process.env.UPSTASH_KV_REST_API_TOKEN = "t";
  });

  it("MGET: no keys is no request; a long list is chunked at MGET_CHUNK and comes back in order", async () => {
    const s = writeStore();
    expect(await s.mget([])).toEqual([]);
    expect(calls).toEqual([]);
    const keys = Array.from({ length: 2 * MGET_CHUNK + 5 }, (_, i) => `k${i}`);
    for (const k of keys) if (Number(k.slice(1)) % 3 === 0) strings.set(k, `hll12:${k}`);
    const got = await s.mget(keys);
    expect(calls.map((c) => c.length - 1)).toEqual([MGET_CHUNK, MGET_CHUNK, 5]);
    expect(got).toEqual(keys.map((k) => (Number(k.slice(1)) % 3 === 0 ? `hll12:${k}` : null)));
  });

  it("GET answers the string, or null", async () => {
    const s = writeStore();
    strings.set("a", "hll12:AAAA");
    expect(await s.get("a")).toBe("hll12:AAAA");
    expect(await s.get("b")).toBeNull();
  });

  it("applyWrites SETs a write's `value` inside the one transaction, beside the hash writes", async () => {
    await writeStore().applyWrites([
      { key: "sk", map: {}, ttlS: null, value: "hll12:AAAA" },
      { key: "h", map: { "27-14": 5 }, ttlS: null },
    ]);
    expect(calls).toEqual([["exec", ["set", "sk", "hll12:AAAA"], ["hset", "h", { "27-14": 5 }]]]);
  });
});
