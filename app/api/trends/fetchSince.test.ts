import { describe, it, expect } from "vitest";
import { listBetween, listSince, type ChainPage } from "./fetchSince";

// A fake chain served newest-first with exclusive cursors, the explorer's shape.
const chain = (n: number) => Array.from({ length: n }, (_, i) => ({ ordinal: n - i }));
const pager = (all: { ordinal: number }[], calls: number[]) =>
  async (limit: number, next?: string): Promise<ChainPage<{ ordinal: number }>> => {
    calls.push(limit);
    const start = next ? Number(next) : 0;
    const data = all.slice(start, start + limit);
    const after = start + data.length;
    return { data, next: after < all.length ? String(after) : undefined };
  };

describe("listSince", () => {
  it("covers a normal run with the single tip page", async () => {
    const calls: number[] = [];
    const { recs, gap } = await listSince(pager(chain(50), calls), 45);
    expect(calls).toEqual([60]);
    expect(recs.map((r) => r.ordinal)).toEqual([46, 47, 48, 49, 50]);
    expect(gap).toBe(false);
  });
  it("cursor-walks older pages until the cursor is provably covered", async () => {
    const calls: number[] = [];
    const { recs, gap } = await listSince(pager(chain(3000), calls), 100);
    expect(calls).toEqual([60, 1000, 1000, 1000]);
    expect(recs[0].ordinal).toBe(101);
    expect(recs.length).toBe(2900);
    expect(gap).toBe(false);
  });
  it("spends at most the 30K self-heal depth and reports the accepted gap", async () => {
    const calls: number[] = [];
    const { recs, gap } = await listSince(pager(chain(40000), calls), 100);
    expect(recs.length).toBeGreaterThanOrEqual(30000 - 1000);
    expect(recs.length).toBeLessThanOrEqual(30060);
    expect(gap).toBe(true);
  });
  it("an exhausted chain above a positive unreached cursor reports the gap", async () => {
    // records 501..1000 exist; cursor 100 was pruned away below them
    const all = Array.from({ length: 500 }, (_, i) => ({ ordinal: 1000 - i }));
    const { recs, gap } = await listSince(pager(all, []), 100);
    expect(recs.length).toBe(500);
    expect(gap).toBe(true); // oldest fetched (501) never touched cursor+1
  });
  // A NEW CHAIN IS READ FROM ITS FIRST SNAPSHOT (2026-10-07: BioFi's new address began on Sep 18
  // and its first days were never counted — a cold cursor took only the newest 60 records). Within
  // the same 30K self-heal depth; past it the uncovered history is a gap, said as one.
  it("a cold cursor reads the whole chain back to its first snapshot", async () => {
    const calls: number[] = [];
    const { recs, gap } = await listSince(pager(chain(2500), calls), -1);
    expect(recs.length).toBe(2500);
    expect(recs[0].ordinal).toBe(1);
    expect(gap).toBe(false);
  });
  it("a cold cursor on a chain longer than the depth reads the depth and reports the gap", async () => {
    const { recs, gap } = await listSince(pager(chain(40000), []), -1);
    expect(recs.length).toBeGreaterThanOrEqual(30000 - 1000);
    expect(gap).toBe(true);
  });
  it("an empty tip page is empty, not a gap", async () => {
    const { recs, gap } = await listSince(async () => ({ data: [] }), 100);
    expect(recs).toEqual([]);
    expect(gap).toBe(false);
  });
});

describe("listBetween", () => {
  // Transfers keyed by the snapshot that carried them: repeats and skips, newest first.
  const keys = [90, 90, 88, 80, 80, 80, 71, 60, 52, 52, 40];
  const recs = keys.map((k, i) => ({ k, i, timestamp: "2026-11-04T00:00:00.000Z" }));
  const sparse = (all: typeof recs, calls: number[]) =>
    async (limit: number, next?: string): Promise<ChainPage<(typeof recs)[number]>> => {
      calls.push(limit);
      const start = next ? Number(next) : 0;
      const data = all.slice(start, start + limit);
      const after = start + data.length;
      return { data, next: after < all.length ? String(after) : undefined };
    };
  it("answers the records strictly after the cursor and at or below upTo, oldest first", async () => {
    const calls: number[] = [];
    const { recs: got, gap } = await listBetween(sparse(recs, calls), (r) => r.k, 71, 88);
    expect(got.map((r) => r.k)).toEqual([80, 80, 80, 88]);
    expect(gap).toBe(false);
    expect(calls).toEqual([60]);
  });
  it("keeps a snapshot the walk beside it has not read for the next run", async () => {
    const { recs: got } = await listBetween(sparse(recs, []), (r) => r.k, 85, 89);
    expect(got.map((r) => r.k)).toEqual([88]);
  });
  it("reads a list that ends above the cursor whole, with no gap", async () => {
    const { recs: got, gap } = await listBetween(sparse(recs, []), (r) => r.k, 10, 99);
    expect(got.length).toBe(keys.length);
    expect(gap).toBe(false);
  });
  it("walks older pages until a record at or below the cursor proves the boundary passed", async () => {
    const long = Array.from({ length: 2500 }, (_, i) => ({ k: 3000 - i, i, timestamp: "2026-11-04T00:00:00.000Z" }));
    const calls: number[] = [];
    const { recs: got } = await listBetween(sparse(long, calls), (r) => r.k, 1000, 3000);
    expect(calls).toEqual([60, 1000, 1000]); // 2,060 records reach k 941, past the cursor
    expect(got[0]!.k).toBe(1001);
    expect(got.length).toBe(2000);
  });
  it("says GAP when the self-heal depth runs out before the boundary", async () => {
    const huge = Array.from({ length: 40000 }, (_, i) => ({ k: 50000 - i, i, timestamp: "2026-11-04T00:00:00.000Z" }));
    const { gap } = await listBetween(sparse(huge, []), (r) => r.k, 1, 50000);
    expect(gap).toBe(true);
  });
});
