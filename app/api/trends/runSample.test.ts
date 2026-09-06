import { describe, it, expect } from "vitest";
import { runSample, type SampleDeps } from "./runSample";
import type { TrendsStore } from "./store";

// In-memory TrendsStore — hash semantics only, enough for the orchestration contract.
function memStore(): TrendsStore & { data: Map<string, Map<string, string>>; ttls: Map<string, number>; locked: boolean } {
  const data = new Map<string, Map<string, string>>();
  const ttls = new Map<string, number>();
  const s = {
    data, ttls, locked: false,
    async hgetall(key: string) {
      const h = data.get(key);
      return h ? Object.fromEntries(h) : null;
    },
    async hmget(key: string, fields: string[]) {
      const h = data.get(key);
      return fields.map((f) => h?.get(f) ?? null);
    },
    async hset(key: string, map: Record<string, string | number>) {
      let h = data.get(key);
      if (!h) { h = new Map(); data.set(key, h); }
      for (const [f, v] of Object.entries(map)) h.set(f, String(v));
    },
    async expire(key: string, ttl: number) { ttls.set(key, ttl); },
    async acquireLock() { if (s.locked) return false; s.locked = true; return true; },
    async releaseLock() { s.locked = false; },
  };
  return s;
}

const iso = (h: number, m: number, sec = 0) => new Date(Date.UTC(2026, 8, 6, h, m, sec)).toISOString();

function deps(store: TrendsStore, over: Partial<SampleDeps> = {}): SampleDeps {
  return {
    net: "mainnet",
    metaIds: ["abc"],
    store,
    pageGlobals: async () => [
      { ordinal: 102, timestamp: iso(14, 0, 36), metagraphSnapshotCount: 2 },
      { ordinal: 101, timestamp: iso(14, 0, 8), metagraphSnapshotCount: 3 },
    ],
    pageMeta: async () => [{ ordinal: 9, timestamp: iso(14, 0, 8), fee: 500, sizeInKB: 10 }],
    fleet: async () => ({ total: 5, perNet: { dag: 5 }, layers: { l0: 5 }, countries: { DE: 5 } }),
    now: () => Date.UTC(2026, 8, 6, 14, 10),
    ...over,
  };
}

describe("runSample", () => {
  it("writes buckets, advances the cursor, sets TTLs, releases the lock", async () => {
    const store = memStore();
    const res = await runSample(deps(store));
    expect(res.skipped).toBeUndefined();
    expect(res.gap).toBe(false);
    const day = store.data.get("t:mainnet:5m:2026-09-06")!;
    expect(day.get("14:00|g.ticks")).toBe("2");
    expect(day.get("14:00|g.anchors")).toBe("5");
    expect(day.get("14:00|m.abc.snaps")).toBe("1");
    expect(day.get("14:00|g.feeFloor")).toBe("500");
    const cursor = store.data.get("t:mainnet:cursor")!;
    expect(cursor.get("g")).toBe("102");
    expect(cursor.get("m.abc")).toBe("9");
    expect(cursor.get("v")).toBe("1");
    expect(store.ttls.get("t:mainnet:5m:2026-09-06")).toBe(259200);
    expect(store.ttls.has("t:mainnet:1d:2026")).toBe(false); // forever tier: no TTL
    expect(store.locked).toBe(false);
  });
  it("merges across runs: counters add, gauges last-write-win", async () => {
    const store = memStore();
    await runSample(deps(store));
    await runSample(deps(store, {
      pageGlobals: async () => [
        { ordinal: 103, timestamp: iso(14, 1, 4), metagraphSnapshotCount: 4 },
        { ordinal: 102, timestamp: iso(14, 0, 36), metagraphSnapshotCount: 2 }, // pre-cursor, filtered
      ],
      pageMeta: async () => [],
    }));
    const day = store.data.get("t:mainnet:5m:2026-09-06")!;
    expect(day.get("14:00|g.ticks")).toBe("3");     // 2 + 1
    expect(day.get("14:00|g.anchors")).toBe("9");   // 5 + 4
    expect(store.data.get("t:mainnet:cursor")!.get("g")).toBe("103");
  });
  it("samples the fleet only when the current hour has no gauge yet", async () => {
    const store = memStore();
    let fleetCalls = 0;
    const d = deps(store, { fleet: async () => { fleetCalls++; return { total: 5, perNet: {}, layers: {}, countries: {} }; } });
    await runSample(d);
    await runSample({ ...d, pageGlobals: async () => [], pageMeta: async () => [] });
    expect(fleetCalls).toBe(1);
    expect(store.data.get("t:mainnet:1h:2026-09")!.get("06-14|f.nodes")).toBe("5");
  });
  it("a failed metagraph leaves its cursor unmoved and is reported", async () => {
    const store = memStore();
    const res = await runSample(deps(store, { pageMeta: async () => { throw new Error("503"); } }));
    expect(res.metaErrors).toEqual(["abc"]);
    expect(store.data.get("t:mainnet:cursor")!.get("m.abc")).toBeUndefined();
    expect(store.data.get("t:mainnet:cursor")!.get("g")).toBe("102"); // global still advanced
  });
  it("skips when locked", async () => {
    const store = memStore();
    store.locked = true;
    const res = await runSample(deps(store));
    expect(res.skipped).toBe("locked");
  });
  it("a fleet failure writes no gauge and does not spend the hour slot", async () => {
    const store = memStore();
    await runSample(deps(store, { fleet: async () => null }));
    expect(store.data.get("t:mainnet:1h:2026-09")?.get("06-14|f.nodes")).toBeUndefined();
  });
});
