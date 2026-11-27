import { describe, it, expect } from "vitest";
import { runSubmitters, walkHoles, walkRange, type SubmittersDeps, type WalkDeps } from "./runSubmitters";
import { assembleSubmitters } from "./assemble";
import { subHllKeyOf, subHolesKeyOf, subLockKeyOf, subNamesKeyOf, subSlotOf, subSpanKeyOf } from "./keys";
import { DED_ID, DOR_ID } from "@/src/data/submitters";
import type { MetaRec } from "../trends/bucketing";
import type { ChainPage } from "../trends/fetchSince";
import type { TrendsStore, TrendsWrite } from "../trends/store";

// In-memory TrendsStore (runSample.test.ts's), counting transactions. A HyperLogLog is an exact Set
// here: PFCOUNT's ~0.81% error is the store's, not the sampler's.
function memStore(): TrendsStore & { data: Map<string, Map<string, string>>; hll: Map<string, Set<string>>; locked: boolean; applies: TrendsWrite[][] } {
  const data = new Map<string, Map<string, string>>();
  const hll = new Map<string, Set<string>>();
  const add = (key: string, ids: readonly string[]) => {
    let h = hll.get(key);
    if (!h) hll.set(key, (h = new Set()));
    for (const id of ids) h.add(id);
  };
  const s = {
    data, hll, locked: false, applies: [] as TrendsWrite[][],
    async pfadd(key: string, ids: string[]) { add(key, ids); },
    async pfcount(keys: string[]) { return new Set(keys.flatMap((k) => [...(hll.get(k) ?? [])])).size; },
    async pfcountEach(keys: string[]) { return keys.map((k) => hll.get(k)?.size ?? 0); },
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
        for (const f of w.hdel ?? []) h.delete(f);
        if (!h.size) data.delete(w.key);
        if (w.pfadd?.length) add(w.key, w.pfadd);
      }
    },
  };
  return s;
}

const MIN = 60000, HOUR = 3600000;
/** Two organisations (ids are UUIDs: `submitters.ts` counts no other shape). */
const O1 = "00000000-0000-4000-8000-000000000001", O2 = "00000000-0000-4000-8000-000000000002";
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
  const updates = [{ MetagraphBatchMessage: { orgId: O1 } }, { MetagraphBatchMessage: { orgId: O1 } }];
  if (ordinal % 2) updates.push({ MetagraphBatchMessage: { orgId: O2 } });
  const blk = { proofs: [], value: { updates: updates.map((v) => ({ value: v })) } };
  return { value: { ordinal, dataApplication: { blocks: [Array.from(Buffer.from(JSON.stringify(blk)))] } }, proofs: [] };
}

/** Dor: every record carries one data block of two check-ins, by devices `ordinal % 5` and
 *  `(ordinal + 1) % 5` — hex ids, cut to 16 characters by `submitters.ts`. */
const dev = (k: number) => String(k).padEnd(40, "f");
function dorRoot(ordinal: number): Record<string, unknown> {
  const updates = [{ publicId: dev(ordinal % 5) }, { publicId: dev((ordinal + 1) % 5) }];
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

const span = (s: ReturnType<typeof memStore>, net = DED_ID) => s.data.get(subSpanKeyOf(net));
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
    expect(hour.get(`27-13|${O1}`)).toBe("120");
    expect(hour.get(`27-13|${O2}`)).toBe("30");
    expect(hour.get(`27-14|${O1}`)).toBe("20");
    expect(hour.get(`27-14|${O2}`)).toBe("5");
    expect(hour.has(`27-12|${O1}`)).toBe(false); // before the boundary: not read
    expect(store.data.get(subSlotOf(DED_ID, "1d", NOW).key)!.get(`11-27|${O1}`)).toBe("140");
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
    expect(h1(store, PREV_HOUR)!.get(`27-13|${O1}`)).toBe("4");
    expect(h1(store, PREV_HOUR)!.get(`27-13|${O2}`)).toBe("1");

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

  it("a warm run contiguous by ordinal extends the span; a gap keeps its from and records a hole", async () => {
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
    // R20: the span KEEPS its from; the gap's hours are a hole, from the hour holding the old `to`
    // (09:00) to the end of the hour holding the first record read (12:00 → 13:00).
    expect(span(gapped)!.get("from")).toBe(String(PREV_HOUR - 5 * HOUR));
    expect(span(gapped)!.get("to")).toBe(String(tsOf(1129)));
    expect(span(gapped)!.get("cursor")).toBe("1129");
    expect(Object.fromEntries(gapped.data.get(subHolesKeyOf(DED_ID))!)).toEqual({ [String(PREV_HOUR - 4 * HOUR)]: String(PREV_HOUR) });
    expect(gapped.applies).toHaveLength(1); // the hole rides the run's one transaction
  });

  it("a second gap from the same hour keeps the hole's later end", async () => {
    const store = memStore();
    await store.hset(subSpanKeyOf(DED_ID), { from: PREV_HOUR - 5 * HOUR, to: PREV_HOUR - 4 * HOUR, cursor: 900 });
    await store.hset(subHolesKeyOf(DED_ID), { [String(PREV_HOUR - 4 * HOUR)]: String(PREV_HOUR + 5 * HOUR) });
    await runSubmitters(deps(store));
    expect(store.data.get(subHolesKeyOf(DED_ID))!.get(String(PREV_HOUR - 4 * HOUR))).toBe(String(PREV_HOUR + 5 * HOUR));
  });

  it("a contiguous run writes no hole", async () => {
    const store = memStore();
    await runSubmitters(deps(store, { pageMeta: pager(() => 1100) }));
    await runSubmitters(deps(store));
    expect(store.data.has(subHolesKeyOf(DED_ID))).toBe(false);
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

  it("a deadline passed mid-batch commits the prefix as a truncation, and the next run resumes to clean totals", async () => {
    const clean = memStore();
    await runSubmitters(deps(clean));

    // A slow L0: each read costs the fake clock 10 s; the run's budget is 100 s.
    const store = memStore();
    let clock = NOW;
    const slow = { now: () => clock, fetchSnap: async (_n: string, o: number) => { clock += 10000; return root(o); } };
    const res = await runSubmitters(deps(store, { ...slow, deadlineMs: NOW + 100000, pool: 1 }));
    expect(res.read[DED_ID]).toBe(10);
    expect(res.failed[DED_ID]).toBeNull();
    expect(store.applies).toHaveLength(1);
    expect(span(store)!.get("cursor")).toBe("1069");
    expect(span(store)!.get("to")).toBe(String(tsOf(1069)));
    expect(span(store)!.get("from")).toBe(String(PREV_HOUR));

    // The default budget: 200 s from the run's own start.
    const res2 = await runSubmitters(deps(store, { ...slow, pool: 1 }));
    expect(res2.read[DED_ID]).toBe(20);
    const res3 = await runSubmitters(deps(store, { now: () => NOW + HOUR / 6 }));
    expect(res3.read[DED_ID]).toBe(40);
    expect(span(store)!.get("from")).toBe(String(PREV_HOUR)); // contiguous throughout
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

  it("Dor: device ids go into the hour's and the day's HyperLogLog in the one transaction, never into fields (R19)", async () => {
    const store = memStore();
    const res = await runSubmitters(deps(store, { nets: [DOR_ID], fetchSnap: async (_n, o) => dorRoot(o) }));
    expect(res.read[DOR_ID]).toBe(70);
    expect(store.applies).toHaveLength(1);
    expect(store.applies[0].filter((w) => w.pfadd).map((w) => w.key).sort()).toEqual(
      [subHllKeyOf(DOR_ID, "1d", NOW), subHllKeyOf(DOR_ID, "1h", PREV_HOUR), subHllKeyOf(DOR_ID, "1h", NOW)].sort(),
    );
    expect(await store.pfcountEach([subHllKeyOf(DOR_ID, "1h", PREV_HOUR), subHllKeyOf(DOR_ID, "1d", NOW)])).toEqual([5, 5]);
    expect([...store.data.keys()].filter((k) => k.includes(":1h:") || k.includes(":1d:"))).toEqual([]);
    expect(span(store, DOR_ID)!.get("cursor")).toBe("1129");
  });

  it("a names read that fails costs the run nothing", async () => {
    const store = memStore();
    const res = await runSubmitters(deps(store, { dedLatest: async () => { throw new Error("ded down"); } }));
    expect(res.names).toBe(0);
    expect(span(store)!.get("cursor")).toBe("1129");
  });
});

// THE BACK-FILL WALK (`walkRange`, `scripts/walk-submitters.ts`): oldest hour first up to the
// sampler's span.from, SETS not increments, each day's 1d recomputed from its stored 1h fields.
describe("walkRange", () => {
  const DAY = 24 * HOUR;
  const D0 = Date.UTC(2026, 10, 25), D1 = D0 + DAY, D2 = D1 + DAY;
  /** One record every 10 minutes from D0 00:00 to D2 14:00 (ordinals 5000 … 5372). */
  const W: MetaRec[] = Array.from({ length: 373 }, (_, i) => ({ ordinal: 5000 + i, timestamp: new Date(D0 + i * 10 * MIN).toISOString() }));
  const wTs = (o: number) => Date.parse(W[o - 5000].timestamp);
  const NOW_W = D2 + 14 * HOUR + 10 * MIN;
  const SPAN_FROM = D2 + 13 * HOUR; // the sampler's first run: the start of the previous hour

  const wPager = async (_id: string, limit: number, next?: string): Promise<ChainPage<MetaRec>> => {
    const all = W.slice().reverse();
    const off = next ? Number(next) : 0;
    return { data: all.slice(off, off + limit), next: off + limit < all.length ? String(off + limit) : undefined };
  };
  /** An inclusive cursor ON the oldest record at/after `ms`; undefined: all older; null: none older. */
  const cursorAt = async (_net: string, ms: number): Promise<string | undefined | null> => {
    if (Date.parse(W[0].timestamp) >= ms) return null;
    const nf = W.slice().reverse();
    const firstOlder = nf.findIndex((r) => Date.parse(r.timestamp) < ms);
    return firstOlder === 0 ? undefined : String(firstOlder - 1);
  };
  /** The walk never reads a record the sampler owns: such a read fails the walk. */
  const walkSnap = async (_net: string, o: number) => {
    if (wTs(o) >= SPAN_FROM) throw new Error(`read a sampler record: ${o}`);
    return root(o);
  };
  const wdeps = (store: TrendsStore, over: Partial<WalkDeps> = {}): WalkDeps => ({
    store, pageMeta: wPager, cursorAt, fetchSnap: walkSnap, pool: 3, sleep: async () => {}, ...over,
  });
  async function sampled() {
    const store = memStore();
    await runSubmitters({ store, nets: [DED_ID], pageMeta: wPager, fetchSnap: async (_n, o) => root(o), now: () => NOW_W });
    return store;
  }
  const field = (s: ReturnType<typeof memStore>, tier: "1h" | "1d", ts: number, id: string) => {
    const { key, bucket } = subSlotOf(DED_ID, tier, ts);
    return s.data.get(key)?.get(`${bucket}|${id}`);
  };
  const sum1h = (s: ReturnType<typeof memStore>, day: number, id: string) => {
    let t = 0;
    for (let h = 0; h < 24; h++) t += Number(field(s, "1h", day + h * HOUR, id) ?? 0);
    return String(t);
  };
  const progress = () => {};

  it("writes each hour as a SET of its tally, never reads or writes an hour the sampler owns, and a rerun changes nothing", async () => {
    const store = await sampled();
    expect(span(store)!.get("from")).toBe(String(SPAN_FROM));
    const samplerHours = [13, 14].map((h) => [field(store, "1h", D2 + h * HOUR, O1), field(store, "1h", D2 + h * HOUR, O2)]);
    expect(samplerHours).toEqual([["12", "3"], ["2", undefined]]); // 14:00 is ordinal 5372, even

    const days: number[] = [];
    const res = await walkRange(wdeps(store), DED_ID, D0, SPAN_FROM, (p) => days.push(p.tsMs));
    expect(res.failedAt).toBeNull();
    expect(res.nextMs).toBe(SPAN_FROM);
    expect(res.read).toBe(2 * 144 + 13 * 6);
    expect(days).toEqual([D1, D2, SPAN_FROM]); // progress once a day
    // 6 records an hour: 12 batches by o1, 3 by o2 (odd ordinals).
    expect(field(store, "1h", D0, O1)).toBe("12");
    expect(field(store, "1h", D0, O2)).toBe("3");
    expect(field(store, "1h", D2 + 12 * HOUR, O1)).toBe("12");
    // The sampler's hours untouched.
    expect([13, 14].map((h) => [field(store, "1h", D2 + h * HOUR, O1), field(store, "1h", D2 + h * HOUR, O2)])).toEqual(samplerHours);
    // 1d = Σ1h, the boundary day's from ALL its hours (the sampler's included).
    for (const d of [D0, D1, D2]) for (const id of [O1, O2]) expect(field(store, "1d", d, id)).toBe(sum1h(store, d, id));
    expect(field(store, "1d", D0, O1)).toBe("288");
    expect(field(store, "1d", D2, O1)).toBe(String(85 * 2));

    const once = subData(store);
    await walkRange(wdeps(store), DED_ID, D0, SPAN_FROM, progress);
    expect(subData(store)).toEqual(once);
  });

  it("a walk stopped by a failed read leaves 1d = Σ1h, and resumed at its hour equals one uninterrupted walk", async () => {
    const clean = await sampled();
    await walkRange(wdeps(clean), DED_ID, D0, SPAN_FROM, progress);

    const store = await sampled();
    const BAD = 5000 + 144 + 5 * 6 + 2; // D1 05:20
    const res = await walkRange(wdeps(store, { fetchSnap: async (n, o) => { if (o === BAD) throw new Error("L0 502"); return walkSnap(n, o); } }), DED_ID, D0, SPAN_FROM, progress);
    expect(res.failedAt).toBe(BAD);
    expect(res.nextMs).toBe(D1 + 5 * HOUR);
    expect(res.lowered).toBe(false);
    expect(span(store)!.get("from")).toBe(String(SPAN_FROM));
    expect(field(store, "1h", D1 + 5 * HOUR, O1)).toBeUndefined(); // the failed hour is not written
    expect(field(store, "1d", D1, O1)).toBe(sum1h(store, D1, O1));
    expect(field(store, "1d", D1, O1)).toBe(String(5 * 12));

    const res2 = await walkRange(wdeps(store), DED_ID, D0, SPAN_FROM, progress, res.nextMs);
    expect(res2.failedAt).toBeNull();
    expect(res2.lowered).toBe(true);
    expect(subData(store)).toEqual(subData(clean));
    expect(span(store)).toEqual(span(clean));
  });

  it("span.from moves to the walk's start only once the walk reaches it; to and cursor stay the sampler's", async () => {
    const store = await sampled();
    const before = new Map(span(store)!);
    const short = await walkRange(wdeps(store), DED_ID, D0, D1, progress);
    expect(short.lowered).toBe(false);
    expect(span(store)).toEqual(before);

    const full = await walkRange(wdeps(store), DED_ID, D0, SPAN_FROM, progress);
    expect(full.lowered).toBe(true);
    expect(span(store)!.get("from")).toBe(String(D0));
    expect(span(store)!.get("to")).toBe(before.get("to"));
    expect(span(store)!.get("cursor")).toBe(before.get("cursor"));
  });

  it("never walks past span.from, whatever toMs asks", async () => {
    const store = await sampled();
    const res = await walkRange(wdeps(store), DED_ID, D0, NOW_W, progress);
    expect(res.failedAt).toBeNull(); // walkSnap would have failed on a sampler record
    expect(res.nextMs).toBe(SPAN_FROM);
    expect(res.lowered).toBe(true);
  });

  it("recomputes the boundary day and lowers the span under the sampler's lock, waiting for it", async () => {
    const store = await sampled();
    store.locked = true;
    let waits = 0;
    const res = await walkRange(wdeps(store, { sleep: async () => { waits++; store.locked = false; } }), DED_ID, D2, SPAN_FROM, progress);
    expect(waits).toBe(1);
    expect(res.lowered).toBe(true);
    expect(store.locked).toBe(false);
    expect(field(store, "1d", D2, O1)).toBe(sum1h(store, D2, O1));
  });

  it("refuses without a measured span: the sampler must run first", async () => {
    await expect(walkRange(wdeps(memStore()), DED_ID, D0, SPAN_FROM, progress)).rejects.toThrow(/span/);
  });

  it("walkHoles fills a hole's hours, recomputes its days, deletes the hole, and its buckets read measured", async () => {
    const clean = await sampled();
    await walkRange(wdeps(clean), DED_ID, D0, SPAN_FROM, progress);

    const store = await sampled();
    await walkRange(wdeps(store), DED_ID, D0, SPAN_FROM, progress);
    // A gap's hours: D1 05:00 and 06:00 lost from the store, the day's 1d stale, the hole recorded.
    const k1h = subSlotOf(DED_ID, "1h", D1).key;
    for (const f of [...store.data.get(k1h)!.keys()]) if (f.startsWith("26-05|") || f.startsWith("26-06|")) store.data.get(k1h)!.delete(f);
    await store.hset(subSlotOf(DED_ID, "1d", D1).key, { [`11-26|${O1}`]: 1 });
    await store.hset(subHolesKeyOf(DED_ID), { [String(D1 + 5 * HOUR)]: String(D1 + 7 * HOUR) });
    const read = (s: ReturnType<typeof memStore>) => assembleSubmitters({
      net: DED_ID, tier: "1h", fromMs: D1, toMs: D1 + 24 * HOUR,
      hashes: { [k1h]: Object.fromEntries(s.data.get(k1h)!) },
      span: Object.fromEntries(span(s)!), names: null,
      holes: s.data.has(subHolesKeyOf(DED_ID)) ? Object.fromEntries(s.data.get(subHolesKeyOf(DED_ID))!) : null,
    });
    expect(read(store).distinct.slice(4, 8)).toEqual([2, null, null, 2]);

    const res = await walkHoles(wdeps(store), DED_ID);
    expect(res).toEqual({ filled: 1, left: 0, failedAt: null, read: 12 });
    expect(store.data.has(subHolesKeyOf(DED_ID))).toBe(false);
    expect(subData(store)).toEqual(subData(clean));
    expect(field(store, "1d", D1, O1)).toBe(sum1h(store, D1, O1));
    expect(read(store).distinct.slice(4, 8)).toEqual([2, 2, 2, 2]);
    expect(store.locked).toBe(false);
  });

  it("walkHoles leaves a hole the sampler is still inside, and a failed read leaves its hole", async () => {
    const store = await sampled();
    await store.hset(subHolesKeyOf(DED_ID), { [String(D2 + 13 * HOUR)]: String(D2 + 15 * HOUR) });
    let reads = 0;
    const res = await walkHoles(wdeps(store, { fetchSnap: async (n, o) => { reads++; return walkSnap(n, o); } }), DED_ID);
    expect(res).toEqual({ filled: 0, left: 1, failedAt: null, read: 0 });
    expect(reads).toBe(0);

    const bad = await sampled();
    await bad.hset(subHolesKeyOf(DED_ID), { [String(D1)]: String(D1 + 2 * HOUR) });
    const r2 = await walkHoles(wdeps(bad, { fetchSnap: async (n, o) => { if (o === 5000 + 144 + 7) throw new Error("L0 502"); return walkSnap(n, o); } }), DED_ID);
    expect(r2.failedAt).toBe(5000 + 144 + 7);
    expect(r2.filled).toBe(0);
    expect(bad.data.get(subHolesKeyOf(DED_ID))!.get(String(D1))).toBe(String(D1 + 2 * HOUR));
  });

  it("Dor: the walk PFADDs each hour's devices into the hour's and the day's HLL, idempotent, with no fields (R19)", async () => {
    const dorSnap = async (_n: string, o: number) => { if (wTs(o) >= SPAN_FROM) throw new Error(`read a sampler record: ${o}`); return dorRoot(o); };
    const store = memStore();
    await runSubmitters({ store, nets: [DOR_ID], pageMeta: wPager, fetchSnap: async (_n, o) => dorRoot(o), now: () => NOW_W });
    const res = await walkRange(wdeps(store, { fetchSnap: dorSnap }), DOR_ID, D0, SPAN_FROM, progress);
    expect(res.failedAt).toBeNull();
    expect(res.lowered).toBe(true);
    expect(await store.pfcount([subHllKeyOf(DOR_ID, "1h", D0)])).toBe(5);
    expect(await store.pfcount([subHllKeyOf(DOR_ID, "1d", D1)])).toBe(5);
    expect([...store.data.keys()].filter((k) => k.includes(":1h:") || k.includes(":1d:"))).toEqual([]);
    const once = [...store.hll].map(([k, v]) => [k, [...v].sort()]);
    await walkRange(wdeps(store, { fetchSnap: dorSnap }), DOR_ID, D0, SPAN_FROM, progress);
    expect([...store.hll].map(([k, v]) => [k, [...v].sort()])).toEqual(once);
  });
});
