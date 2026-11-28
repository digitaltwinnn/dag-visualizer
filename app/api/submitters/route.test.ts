import { beforeEach, describe, expect, it, vi } from "vitest";
import { DED_ID, DOR_ID } from "@/src/data/submitters";
import { addIds, encodeSketch, newSketch } from "./sketch";

const calls: string[] = [];
const fail = { on: false };
const holes: { value: Record<string, string> | null } = { value: null };
const NOW = Date.UTC(2026, 10, 27, 10, 20);
const H = 3600000;
const SKETCH = encodeSketch(addIds(newSketch(), ["d1", "d2", "d3"]));
const counts: { value: Record<string, string> | null } = { value: null };
vi.mock("@/app/api/trends/store", () => ({
  readStore: () => ({
    hgetall: async (k: string) => {
      calls.push(k);
      if (fail.on) throw new Error("down");
      if (k.endsWith(":span")) return { from: String(Date.UTC(2026, 10, 1)), to: String(Date.UTC(2026, 10, 27, 8, 30)) };
      if (k.endsWith(":holes")) return holes.value;
      if (k.includes(":1h:")) return counts.value;
      return null;
    },
    mget: async (keys: string[]) => { calls.push(...keys.map((k) => `mget:${k}`)); return keys.map((_, i) => (i === 0 ? SKETCH : null)); },
  }),
}));

import { GET } from "./route";

const get = (qs: string) => GET(new Request(`http://x/api/submitters${qs}`));

describe("GET /api/submitters", () => {
  beforeEach(() => { calls.length = 0; fail.on = false; holes.value = null; counts.value = null; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });

  it("rejects a network without a submitter table and a bad range", async () => {
    expect((await get("?net=USDC&window=24h")).status).toBe(400);
    expect((await get(`?net=${DED_ID}`)).status).toBe(400);
    expect((await get(`?net=${DED_ID}&from=5&to=5`)).status).toBe(400);
    expect((await get(`?net=${DED_ID}&from=x&to=5`)).status).toBe(400);
  });

  it("window=24h reads the 24 whole hours ending at the current hour, and sets the cache header", async () => {
    const r = await get(`?net=${DED_ID}&window=24h`);
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    const w = await r.json();
    expect(w.tier).toBe("1h");
    expect(w.buckets).toHaveLength(24);
    // NOW is 10:20 and the span ends 08:30: the window is anchored at now (09:00 the last whole
    // hour), so the hours after the span read as not measured, never yesterday's figures.
    expect(w.buckets[23]).toBe(Date.UTC(2026, 10, 27, 9));
    expect(w.buckets[0]).toBe(Date.UTC(2026, 10, 27, 9) - 23 * H);
    expect(w.distinct.slice(-2)).toEqual([null, null]);
    expect(calls).toContain(`sub:mainnet:${DED_ID}:1h:2026-11`);
  });

  it("reads the holes hash: a bucket in a hole is not measured (R20)", async () => {
    const from = Date.UTC(2026, 10, 26, 0), to = from + 3 * H;
    holes.value = { [String(from + H)]: String(from + 2 * H) };
    const w = await (await get(`?net=${DED_ID}&from=${from}&to=${to}`)).json();
    expect(calls).toContain(`sub:mainnet:${DED_ID}:holes`);
    expect(w.distinct).toEqual([0, null, 0]);
    expect(w.holes).toEqual([{ from: from + H, to: from + 2 * H }]);
  });

  it("Dor: per-bucket counts from the tier hash, the range from its sketches by MGET — no PF command, no device field (R22)", async () => {
    const from = Date.UTC(2026, 10, 26, 0), to = from + 3 * H;
    counts.value = { "26-00": "9", "26-02": "4" };
    const w = await (await get(`?net=${DOR_ID}&from=${from}&to=${to}`)).json();
    expect(w).toMatchObject({ kind: "device", estimate: true, rangeDistinct: 3, distinct: [9, 0, 4] });
    expect(calls.filter((k) => k.startsWith("mget:"))).toEqual([0, 1, 2].map((i) => `mget:sub:mainnet:${DOR_ID}:sketch:1h:2026-11-26-0${i}`));
    expect(calls).toContain(`sub:mainnet:${DOR_ID}:1h:2026-11`);
    expect(calls.some((k) => k.includes(":1d:"))).toBe(false); // no all-time palette for devices
  });

  it("picks the 1d tier for a range over 30 days, and reads each daily year hash once (PR review I3)", async () => {
    const to = Date.UTC(2026, 10, 27, 10), from = to - 40 * 86400000;
    const w = await (await get(`?net=${DED_ID}&from=${from}&to=${to}`)).json();
    expect(w.tier).toBe("1d");
    // the range's hashes are the year hashes the all-time palette reads too: one HGETALL, not two
    expect(calls.filter((k) => k === `sub:mainnet:${DED_ID}:1d:2026`)).toHaveLength(1);
  });

  it("rejects a from or to off an hour edge, uncached (PR review I3: the key space is the HUD's own)", async () => {
    const h = Date.UTC(2026, 10, 26, 0);
    for (const qs of [`from=${h + 1}&to=${h + 3 * H}`, `from=${h}&to=${h + 3 * H - 1}`, `from=${h + 0.5}&to=${h + H}`]) {
      const r = await get(`?net=${DOR_ID}&${qs}`);
      expect(r.status).toBe(400);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(calls).toEqual([]); // nothing read for it
    expect((await get(`?net=${DOR_ID}&from=${h}&to=${h + 3 * H}`)).status).toBe(200);
  });

  it("answers a store failure with 503 and no-store, so a CDN never caches it", async () => {
    fail.on = true;
    const r = await get(`?net=${DED_ID}&window=24h`);
    expect(r.status).toBe(503);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
});
