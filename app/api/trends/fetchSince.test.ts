import { describe, it, expect } from "vitest";
import { listSince, type ChainPage } from "./fetchSince";

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
  it("an empty tip page is empty, not a gap", async () => {
    const { recs, gap } = await listSince(async () => ({ data: [] }), 100);
    expect(recs).toEqual([]);
    expect(gap).toBe(false);
  });
});
