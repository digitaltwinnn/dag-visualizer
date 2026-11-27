import { describe, it, expect } from "vitest";
import { runSubmitters, type SubmittersDeps } from "./runSubmitters";
import { subLockKeyOf, subNamesKeyOf, subSlotOf, subSpanKeyOf } from "./keys";
import { DED_ID } from "@/src/data/submitters";
import type { MetaRec } from "../trends/bucketing";
import type { ChainPage } from "../trends/fetchSince";
import type { TrendsStore, TrendsWrite } from "../trends/store";

// In-memory TrendsStore (runSample.test.ts's), counting transactions.
function memStore(): TrendsStore & { data: Map<string, Map<string, string>>; locked: boolean; applies: TrendsWrite[][] } {
  const data = new Map<string, Map<string, string>>();
  const s = {
    data, locked: false, applies: [] as TrendsWrite[][],
    async hgetall(key: string) { const h = data.get(key); return h ? Object.fromEntries(h) : null; },
    async hmget(key: string, fields: string[]) { const h = data.get(key); return fields.map((f) => h?.get(f) ?? null); },
    async hset(key: string, map: Record<string, string | number>) {
      let h = data.get(key);
      if (!h) data.set(key, (h = new Map()));
      for (const [f, v] of Object.entries(map)) h.set(f, String(v));
    },
    async expire() {},
    async acquireLock() { if (s.locked) return false; s.locked = true; return true; },
    async releaseLock() { s.locked = false; },
    async applyWrites(writes: TrendsWrite[]) {
      s.applies.push(writes);
      for (const w of writes) {
        let h = data.get(w.key);
        if (!h) data.set(w.key, (h = new Map()));
        for (const [f, v] of Object.entries(w.map)) h.set(f, String(v));
      }
    },
  };
  return s;
}

const MIN = 60000, HOUR = 3600000;
const NOW = Date.UTC(2026, 10, 27, 14, 10);
const PREV_HOUR = Date.UTC(2026, 10, 27, 13, 0);

/** One record a minute from 12:00 to 14:09 (130 records, ordinals 1000…1129): more than the
 *  tip page, so a first run pages back to the hour boundary. */
const CHAIN: MetaRec[] = Array.from({ length: 130 }, (_, i) => ({
  ordinal: 1000 + i,
  timestamp: new Date(Date.UTC(2026, 10, 27, 12, 0) + i * MIN).toISOString(),
}));
const tsOf = (o: number) => Date.parse(CHAIN.find((r) => r.ordinal === o)!.timestamp);

/** Every record carries one data block: two batches by `o1`, and one by `o2` on odd ordinals. */
function root(ordinal: number): Record<string, unknown> {
  const updates = [{ MetagraphBatchMessage: { orgId: "o1" } }, { MetagraphBatchMessage: { orgId: "o1" } }];
  if (ordinal % 2) updates.push({ MetagraphBatchMessage: { orgId: "o2" } });
  const blk = { proofs: [], value: { updates: updates.map((v) => ({ value: v })) } };
  return { value: { ordinal, dataApplication: { blocks: [Array.from(Buffer.from(JSON.stringify(blk)))] } }, proofs: [] };
}

/** A newest-first pager over the chain's records up to `tip`; `next` is an offset. */
function pager(tip: () => number) {
  return async (_id: string, limit: number, next?: string): Promise<ChainPage<MetaRec>> => {
    const all = CHAIN.filter((r) => r.ordinal <= tip()).reverse();
    const off = next ? Number(next) : 0;
    const data = all.slice(off, off + limit);
    return { data, next: off + limit < all.length ? String(off + limit) : undefined };
  };
}

function deps(store: TrendsStore, over: Partial<SubmittersDeps> = {}): SubmittersDeps {
  return {
    store,
    nets: [DED_ID],
    pageMeta: pager(() => 1129),
    fetchSnap: async (_net, o) => root(o),
    now: () => NOW,
    ...over,
  };
}

const span = (s: ReturnType<typeof memStore>) => s.data.get(subSpanKeyOf(DED_ID));
const h1 = (s: ReturnType<typeof memStore>, ts: number) => s.data.get(subSlotOf(DED_ID, "1h", ts).key);
const subData = (s: ReturnType<typeof memStore>) =>
  [...s.data].filter(([k]) => k.includes(":1h:") || k.includes(":1d:")).map(([k, h]) => [k, Object.fromEntries([...h].sort())]);

describe("runSubmitters", () => {
  it("first run: reads from the start of the previous UTC hour, buckets by timestamp, ONE transaction", async () => {
    const store = memStore();
    const res = await runSubmitters(deps(store));
    // 13:00 … 14:09 = ordinals 1060 … 1129.
    expect(res.read[DED_ID]).toBe(70);
    expect(res.failed[DED_ID]).toBeNull();
    expect(store.applies).toHaveLength(1);
    const sp = span(store)!;
    expect(sp.get("from")).toBe(String(PREV_HOUR));
    expect(sp.get("to")).toBe(String(tsOf(1129)));
    expect(sp.get("cursor")).toBe("1129");
    // The 13h hour: 60 records, 2 batches each by o1, 30 odd ordinals with one by o2.
    const hour = h1(store, PREV_HOUR)!;
    expect(hour.get("27-13|o1")).toBe("120");
    expect(hour.get("27-13|o2")).toBe("30");
    expect(hour.get("27-14|o1")).toBe("20");
    expect(hour.get("27-14|o2")).toBe("5");
    expect(hour.has("27-12|o1")).toBe(false); // before the boundary: not read
    expect(store.data.get(subSlotOf(DED_ID, "1d", NOW).key)!.get("11-27|o1")).toBe("140");
    expect(store.locked).toBe(false);
  });

  it("an L0 failure mid-batch counts the prefix only, and the next run resumes with no double count", async () => {
    // A clean run over the same records.
    const clean = memStore();
    await runSubmitters(deps(clean));

    const store = memStore();
    let down = true;
    const fetchSnap = async (_net: string, o: number) => {
      if (down && o === 1062) throw new Error("L0 502"); // the 3rd record of the batch
      return root(o);
    };
    const res = await runSubmitters(deps(store, { fetchSnap }));
    expect(res.read[DED_ID]).toBe(2);
    expect(res.failed[DED_ID]).toBe(1062);
    expect(span(store)!.get("cursor")).toBe("1061");
    expect(span(store)!.get("to")).toBe(String(tsOf(1061)));
    expect(span(store)!.get("from")).toBe(String(PREV_HOUR));
    expect(h1(store, PREV_HOUR)!.get("27-13|o1")).toBe("4");
    expect(h1(store, PREV_HOUR)!.get("27-13|o2")).toBe("1");

    down = false;
    const res2 = await runSubmitters(deps(store, { fetchSnap, now: () => NOW + MIN }));
    expect(res2.read[DED_ID]).toBe(68);
    expect(res2.failed[DED_ID]).toBeNull();
    expect(subData(store)).toEqual(subData(clean));
    expect(span(store)!.get("from")).toBe(String(PREV_HOUR)); // contiguous by ordinal: extended
    expect(span(store)!.get("to")).toBe(String(tsOf(1129)));
  });

  it("a held lock skips the run and writes nothing", async () => {
    const store = memStore();
    store.locked = true;
    const res = await runSubmitters(deps(store));
    expect(res.skipped).toBe("locked");
    expect(store.applies).toHaveLength(0);
    expect(store.locked).toBe(true);
  });

  it("takes the lock on the sub family's own key", async () => {
    const store = memStore();
    const keys: string[] = [];
    store.acquireLock = async (k: string) => { keys.push(k); return true; };
    await runSubmitters(deps(store));
    expect(keys).toEqual([subLockKeyOf()]);
  });

  it("a warm run contiguous by ordinal extends the span; a gap restarts it at the first record read", async () => {
    const store = memStore();
    let tip = 1100;
    await runSubmitters(deps(store, { pageMeta: pager(() => tip) }));
    expect(span(store)!.get("cursor")).toBe("1100");

    tip = 1129;
    await runSubmitters(deps(store, { pageMeta: pager(() => tip) }));
    expect(span(store)!.get("from")).toBe(String(PREV_HOUR));
    expect(span(store)!.get("to")).toBe(String(tsOf(1129)));

    // A hole: the chain's list no longer reaches the cursor (records 1130… are absent; the
    // stored cursor is set back past what the pager can prove).
    const gapped = memStore();
    await gapped.hset(subSpanKeyOf(DED_ID), { from: PREV_HOUR - 5 * HOUR, to: PREV_HOUR - 4 * HOUR, cursor: 900 });
    const res = await runSubmitters(deps(gapped));
    expect(res.read[DED_ID]).toBe(130);
    expect(span(gapped)!.get("from")).toBe(String(tsOf(1000)));
    expect(span(gapped)!.get("to")).toBe(String(tsOf(1129)));
    expect(span(gapped)!.get("cursor")).toBe("1129");
  });

  it("maxRecs reads the OLDEST records and leaves the rest, the span staying contiguous", async () => {
    const store = memStore();
    await runSubmitters(deps(store, { maxRecs: 50 }));
    expect(span(store)!.get("cursor")).toBe("1109");
    expect(span(store)!.get("to")).toBe(String(tsOf(1109)));
    const res = await runSubmitters(deps(store, { maxRecs: 50 }));
    expect(res.read[DED_ID]).toBe(20);
    expect(span(store)!.get("from")).toBe(String(PREV_HOUR));
    const clean = memStore();
    await runSubmitters(deps(clean));
    expect(subData(store)).toEqual(subData(clean));
  });

  it("a network whose list cannot be read reports -1 and moves nothing; the others still commit", async () => {
    const store = memStore();
    const OTHER = "DAG0other";
    const base = pager(() => 1129);
    const res = await runSubmitters(deps(store, {
      nets: [DED_ID, OTHER],
      pageMeta: async (id, limit, next) => { if (id === OTHER) throw new Error("explorer 504"); return base(id, limit, next); },
    }));
    expect(res.failed[OTHER]).toBe(-1);
    expect(res.read[OTHER]).toBe(0);
    expect(store.data.has(subSpanKeyOf(OTHER))).toBe(false);
    expect(span(store)!.get("cursor")).toBe("1129");
  });

  it("no submitters in a record writes no empty hash", async () => {
    const store = memStore();
    await runSubmitters(deps(store, { fetchSnap: async (_n, o) => ({ value: { ordinal: o } }) }));
    expect(store.applies).toHaveLength(1);
    expect(store.applies[0].map((w) => w.key)).toEqual([subSpanKeyOf(DED_ID)]);
    expect(store.applies[0].every((w) => Object.keys(w.map).length > 0)).toBe(true);
  });

  it("DED's names ride the same transaction, only those that changed", async () => {
    const store = memStore();
    await store.hset(subNamesKeyOf(DED_ID), { o1: JSON.stringify({ name: "Open Poker", source: "ded", namedAt: 1 }) });
    const res = await runSubmitters(deps(store, {
      dedLatest: async () => ({ data: [{ orgId: "o1", orgName: "Open Poker" }, { orgId: "o2", orgName: "Gate AI" }] }),
    }));
    expect(res.names).toBe(1);
    expect(store.applies).toHaveLength(1);
    const w = store.applies[0].find((x) => x.key === subNamesKeyOf(DED_ID))!;
    expect(Object.keys(w.map)).toEqual(["o2"]);
    expect(JSON.parse(String(w.map.o2))).toEqual({ name: "Gate AI", source: "ded", namedAt: NOW });
  });

  it("a names read that fails costs the run nothing", async () => {
    const store = memStore();
    const res = await runSubmitters(deps(store, { dedLatest: async () => { throw new Error("ded down"); } }));
    expect(res.names).toBe(0);
    expect(span(store)!.get("cursor")).toBe("1129");
  });
});
