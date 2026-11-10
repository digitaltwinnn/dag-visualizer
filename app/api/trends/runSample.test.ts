import { chainReadField } from "./keys";
import { describe, it, expect } from "vitest";
import { runSample, type SampleDeps } from "./runSample";
import type { TrendsStore, TrendsWrite } from "./store";

// In-memory TrendsStore — hash semantics only, enough for the orchestration contract.
// `applyWrites` mirrors Upstash's real MULTI/EXEC all-or-nothing semantics: when
// `failApply` is set it throws WITHOUT mutating `data`/`ttls`, so a test can assert that a
// transaction failure persists nothing (data + cursor together, per the store's contract).
function memStore(): TrendsStore & { data: Map<string, Map<string, string>>; ttls: Map<string, number>; locked: boolean; failApply: boolean } {
  const data = new Map<string, Map<string, string>>();
  const ttls = new Map<string, number>();
  const s = {
    data, ttls, locked: false, failApply: false,
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
    async applyWrites(writes: TrendsWrite[]) {
      if (s.failApply) throw new Error("transaction failed");
      for (const w of writes) {
        let h = data.get(w.key);
        if (!h) { h = new Map(); data.set(w.key, h); }
        for (const [f, v] of Object.entries(w.map)) h.set(f, String(v));
        if (w.ttlS != null) ttls.set(w.key, w.ttlS);
      }
    },
  };
  return s;
}

const iso = (h: number, m: number, sec = 0) => new Date(Date.UTC(2026, 8, 6, h, m, sec)).toISOString();

function deps(store: TrendsStore, over: Partial<SampleDeps> = {}): SampleDeps {
  return {
    metaIds: ["abc"],
    store,
    pageGlobals: async () => ({ data: [
      { ordinal: 102, timestamp: iso(14, 0, 36), metagraphSnapshotCount: 2 },
      { ordinal: 101, timestamp: iso(14, 0, 8), metagraphSnapshotCount: 3 },
    ] }),
    pageMeta: async () => ({ data: [{ ordinal: 9, timestamp: iso(14, 0, 8), fee: 500, sizeInKB: 10 }] }),
    fleet: async () => ({ total: 5, perNet: { dag: 5 }, layers: { l0: 5 }, countries: { DE: 5 } }),
    now: () => Date.UTC(2026, 8, 6, 14, 10),
    ...over,
  };
}

describe("runSample", () => {
  it("writes buckets, advances the cursor, sets NO expiry (keep-forever, 2026-09-10), releases the lock", async () => {
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
    expect(cursor.get("mTs.abc")).toBe(String(Date.UTC(2026, 8, 6, 14, 0, 8)));
    expect(cursor.get("v")).toBe("1");
    expect(cursor.get(chainReadField("abc"))).toBe(String(Date.UTC(2026, 8, 6, 14, 10)));
    expect(store.ttls.get("t:mainnet:5m:2026-09-06")).toBeUndefined();
    expect(store.ttls.has("t:mainnet:1d:2026")).toBe(false); // forever tier: no TTL
    expect(store.locked).toBe(false);
  });
  it("merges across runs: counters add, gauges last-write-win", async () => {
    const store = memStore();
    await runSample(deps(store));
    await runSample(deps(store, {
      pageGlobals: async () => ({ data: [
        { ordinal: 103, timestamp: iso(14, 1, 4), metagraphSnapshotCount: 4 },
        { ordinal: 102, timestamp: iso(14, 0, 36), metagraphSnapshotCount: 2 }, // pre-cursor, filtered
      ] }),
      pageMeta: async () => ({ data: [] }),
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
    await runSample({ ...d, pageGlobals: async () => ({ data: [] }), pageMeta: async () => ({ data: [] }) });
    expect(fleetCalls).toBe(1);
    expect(store.data.get("t:mainnet:1h:2026-09")!.get("06-14|f.nodes")).toBe("5");
  });
  it("writes where the fleet runs into the geo family, keep-forever, with its provider names", async () => {
    const store = memStore();
    const geo = {
      countries: { DE: 5 }, providers: { "hetzner-online-gmbh": 5 },
      perNetCountries: { dag: { DE: 5 } }, perNetProviders: { dag: { "hetzner-online-gmbh": 5 } },
      providerNames: { "hetzner-online-gmbh": "Hetzner Online GmbH" },
      sites: { "DE.Falkenstein.hetzner-online-gmbh": 5 },
    };
    await runSample(deps(store, { fleet: async () => ({ total: 5, perNet: { dag: 5 }, layers: {}, countries: { DE: 5 }, geo }) }));
    expect(store.data.get("geo:mainnet:sites:2026-09")!.get("09-06|f.site.DE.Falkenstein.hetzner-online-gmbh")).toBe("5");
    const day = store.data.get("geo:mainnet:2026")!;
    expect(day.get("09-06|f.cc.DE")).toBe("5");
    expect(day.get("09-06|f.isp.dag.hetzner-online-gmbh")).toBe("5");
    expect(store.data.get("geo:mainnet:isp")!.get("hetzner-online-gmbh")).toBe("Hetzner Online GmbH");
    expect(store.ttls.has("geo:mainnet:2026")).toBe(false);
    expect(store.ttls.has("geo:mainnet:isp")).toBe(false);
    // The tiers' own country gauge is unchanged: the deployed History reader still finds it.
    expect(store.data.get("t:mainnet:1d:2026")!.get("09-06|f.cc.DE")).toBe("5");
  });
  it("a fleet read without a geo tally writes nothing to the geo family", async () => {
    const store = memStore();
    await runSample(deps(store));
    expect([...store.data.keys()].some((k) => k.startsWith("geo:"))).toBe(false);
  });
  it("a failed metagraph leaves its cursor unmoved and is reported", async () => {
    const store = memStore();
    const res = await runSample(deps(store, { pageMeta: async () => { throw new Error("503"); } }));
    expect(res.metaErrors).toEqual(["abc"]);
    expect(store.data.get("t:mainnet:cursor")!.get("m.abc")).toBeUndefined();
    expect(store.data.get("t:mainnet:cursor")!.get(chainReadField("abc"))).toBeUndefined();
    expect(store.data.get("t:mainnet:cursor")!.get("g")).toBe("102"); // global still advanced
  });
  it("samples the UNLISTED chains for their own count, outside the floors, and marks the buckets it measured them in", async () => {
    const store = memStore();
    const res = await runSample(deps(store, {
      unlistedIds: async () => ["unl"],
      pageMeta: async (id) => ({ data: [{ ordinal: 1, timestamp: iso(14, 0, 8), fee: id === "unl" ? 200 : 500, sizeInKB: 2 }] }),
    }));
    expect(res.metaErrors).toEqual([]);
    const day = store.data.get("t:mainnet:5m:2026-09-06")!;
    expect(day.get("14:00|m.unl.snaps")).toBe("1");
    expect(day.get("14:00|g.feeFloor")).toBe("500"); // the catalog chain alone
    expect(day.get("14:00|u.cov")).toBe("0");
  });

  it("no unlisted coverage when their list failed or one of their chains did — never a claimed zero", async () => {
    const listDown = memStore();
    await runSample(deps(listDown, { unlistedIds: async () => null }));
    expect(listDown.data.get("t:mainnet:5m:2026-09-06")!.get("14:00|u.cov")).toBeUndefined();
    const chainDown = memStore();
    const res = await runSample(deps(chainDown, {
      unlistedIds: async () => ["unl"],
      pageMeta: async (id) => {
        if (id === "unl") throw new Error("504");
        return { data: [{ ordinal: 9, timestamp: iso(14, 0, 8), fee: 500, sizeInKB: 10 }] };
      },
    }));
    expect(res.metaErrors).toEqual(["unl"]);
    expect(chainDown.data.get("t:mainnet:5m:2026-09-06")!.get("14:00|u.cov")).toBeUndefined();
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
  it("a failed transaction persists nothing — data and cursor together, lock still released", async () => {
    const store = memStore();
    store.failApply = true;
    await expect(runSample(deps(store))).rejects.toThrow();
    expect(store.data.get("t:mainnet:5m:2026-09-06")).toBeUndefined();
    expect(store.data.get("t:mainnet:cursor")).toBeUndefined();
    expect(store.locked).toBe(false);
  });
  it("a rejected global fetch propagates, writes nothing, and releases the lock", async () => {
    const store = memStore();
    const d = deps(store, { pageGlobals: async () => { throw new Error("503"); } });
    await expect(runSample(d)).rejects.toThrow();
    expect(store.data.get("t:mainnet:cursor")).toBeUndefined();
    expect(store.locked).toBe(false);
  });
});

describe("runSample transfers (2026-11-04)", () => {
  // A warm store: the spine read through global 100, the chain through its snapshot 8.
  const warm = () => {
    const store = memStore();
    store.data.set("t:mainnet:cursor", new Map([["g", "100"], ["gTs", String(Date.UTC(2026, 8, 6, 13, 59, 40))], ["m.abc", "8"], ["mTs.abc", String(Date.UTC(2026, 8, 6, 13, 59, 40))]]));
    return store;
  };
  const dagTx = [
    { snapshotOrdinal: 103, timestamp: iso(14, 1, 4), amount: 9e8 }, // newer than the spine read: next run's
    { snapshotOrdinal: 102, timestamp: iso(14, 0, 36), amount: 2e8, fee: 1e6 },
    { snapshotOrdinal: 101, timestamp: iso(14, 0, 8), amount: 1e8 },
    { snapshotOrdinal: 99, timestamp: iso(13, 58, 0), amount: 5e8 }, // already counted
  ];
  const pageTransfers = (fail?: string) => async (chain: string) => {
    if (chain === fail) throw new Error("504");
    return { data: chain === "dag" ? dagTx : [{ snapshotOrdinal: 9, timestamp: iso(14, 0, 8), amount: 3e8 }, { snapshotOrdinal: 8, timestamp: iso(13, 59, 40), amount: 1e8 }] };
  };
  it("counts the DAG's transfers for the global span it read, marks those buckets measured, and moves its own cursor", async () => {
    const store = warm();
    const res = await runSample(deps(store, { pageTransfers: pageTransfers() }));
    expect(res.txErrors).toEqual([]);
    const five = store.data.get("t:mainnet:5m:2026-09-06")!;
    expect(five.get("14:00|g.tx")).toBe("2");
    expect(five.get("14:00|g.txAmt")).toBe("3");
    expect(five.get("13:55|x.cov")).toBe("0"); // from the previous run's newest global
    expect(five.get("14:00|x.cov")).toBe("0");
    const cursor = store.data.get("t:mainnet:cursor")!;
    expect(cursor.get("x")).toBe("102");
    expect(cursor.get("xTs")).toBe(String(Date.UTC(2026, 8, 6, 14, 0, 36)));
  });
  it("counts a network's token transfers for the snapshots its walk passed, on its own cursor", async () => {
    const store = warm();
    await runSample(deps(store, { pageTransfers: pageTransfers() }));
    expect(store.data.get("t:mainnet:5m:2026-09-06")!.get("14:00|m.abc.tx")).toBe("1");
    expect(store.data.get("t:mainnet:cursor")!.get("x.abc")).toBe("9");
  });
  it("a failed DAG list keeps its cursor and claims no coverage; the spine still advances", async () => {
    const store = warm();
    const res = await runSample(deps(store, { pageTransfers: pageTransfers("dag") }));
    expect(res.txErrors).toEqual(["dag"]);
    const cursor = store.data.get("t:mainnet:cursor")!;
    // A FIRST read that fails pins x where it started, so the next run reads this span again.
    expect(cursor.get("x")).toBe("100");
    expect(cursor.get("g")).toBe("102");
    expect(store.data.get("t:mainnet:5m:2026-09-06")!.has("14:00|x.cov")).toBe(false);
    const again = await runSample(deps(store, { pageTransfers: pageTransfers() }));
    expect(again.txErrors).toEqual([]);
    expect(store.data.get("t:mainnet:5m:2026-09-06")!.get("14:00|g.tx")).toBe("2");
    expect(store.data.get("t:mainnet:cursor")!.get("x")).toBe("102");
  });
  it("a failed token list keeps that chain's transfer cursor where the read started, and its snapshots still land", async () => {
    const store = warm();
    const res = await runSample(deps(store, { pageTransfers: pageTransfers("abc") }));
    expect(res.txErrors).toEqual(["abc"]);
    // Cold before the run: pinned at the snapshot cursor the read started from, NOT the new one —
    // otherwise snapshot 9's transfers would never be read (review, 2026-11-05).
    expect(store.data.get("t:mainnet:cursor")!.get("x.abc")).toBe("8");
    expect(store.data.get("t:mainnet:cursor")!.get("m.abc")).toBe("9");
    await runSample(deps(store, { pageTransfers: pageTransfers() }));
    expect(store.data.get("t:mainnet:5m:2026-09-06")!.get("14:00|m.abc.tx")).toBe("1");
    expect(store.data.get("t:mainnet:cursor")!.get("x.abc")).toBe("9");
  });
  it("a cold spine starts the transfer cursor at this run's newest global and claims nothing", async () => {
    const store = memStore();
    await runSample(deps(store, { pageTransfers: pageTransfers() }));
    expect(store.data.get("t:mainnet:cursor")!.get("x")).toBe("102");
    expect(store.data.get("t:mainnet:5m:2026-09-06")!.has("14:00|g.tx")).toBe(false);
  });
});

describe("runSample stake (2026-11-04)", () => {
  const reading = { total: 300, live: 250, delegations: 5, validators: 2, perValidator: [{ key: "aaaaaaaaaaaaaaaa", id: "a".repeat(128), name: "EUROPA", dag: 250, addrs: 4, live: true }] };
  it("samples the registry once per hour, keep-forever, with each validator's name", async () => {
    const store = memStore();
    let calls = 0;
    const d = deps(store, { stake: async () => { calls++; return reading; } });
    await runSample(d);
    await runSample({ ...d, pageGlobals: async () => ({ data: [] }), pageMeta: async () => ({ data: [] }) });
    expect(calls).toBe(1);
    expect(store.data.get("t:mainnet:1h:2026-09")!.get("06-14|f.stake")).toBe("300");
    expect(store.data.get("stake:mainnet:2026-09")!.get("09-06|f.stake.aaaaaaaaaaaaaaaa")).toBe("250");
    expect(JSON.parse(store.data.get("stake:mainnet:validators")!.get("aaaaaaaaaaaaaaaa")!)).toEqual({ id: "a".repeat(128), name: "EUROPA" });
    expect(store.ttls.has("stake:mainnet:2026-09")).toBe(false);
  });
  it("an unread registry writes nothing and leaves the hour to the next run", async () => {
    const store = memStore();
    let calls = 0;
    const d = deps(store, { stake: async () => { calls++; return calls === 1 ? null : reading; } });
    await runSample(d);
    expect(store.data.get("t:mainnet:1h:2026-09")!.has("06-14|f.stake")).toBe(false);
    await runSample({ ...d, pageGlobals: async () => ({ data: [] }), pageMeta: async () => ({ data: [] }) });
    expect(store.data.get("t:mainnet:1h:2026-09")!.get("06-14|f.stake")).toBe("300");
  });
});
