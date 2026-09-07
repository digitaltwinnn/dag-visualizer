import { describe, it, expect } from "vitest";
import { listSince } from "./fetchSince";

// A fake chain served newest-first, the explorer's shape.
const chain = (n: number) => Array.from({ length: n }, (_, i) => ({ ordinal: n - i }));
const pager = (all: { ordinal: number }[], calls: number[]) => async (limit: number) => {
  calls.push(limit);
  return all.slice(0, limit);
};

describe("listSince", () => {
  it("returns only records past the cursor, oldest first", async () => {
    const { recs, gap } = await listSince(pager(chain(50), []), 45);
    expect(recs.map((r) => r.ordinal)).toEqual([46, 47, 48, 49, 50]);
    expect(gap).toBe(false);
  });
  it("grows 60 → 180 → 540 until the batch reaches the cursor", async () => {
    const calls: number[] = [];
    const { recs, gap } = await listSince(pager(chain(500), calls), 100);
    expect(calls).toEqual([60, 180, 540]);
    expect(recs[0].ordinal).toBe(101);
    expect(recs.length).toBe(400);
    expect(gap).toBe(false);
  });
  it("keeps growing to the 30K self-heal depth for a long outage", async () => {
    const calls: number[] = [];
    const { recs, gap } = await listSince(pager(chain(20000), calls), 100);
    expect(calls).toEqual([60, 180, 540, 1620, 4860, 14580, 20000 > 14580 ? 30000 : 0].filter((v) => v));
    expect(recs.length).toBe(19900);
    expect(gap).toBe(false);
  });
  it("caps at 30,000 and reports the accepted gap", async () => {
    const calls: number[] = [];
    const { recs, gap } = await listSince(pager(chain(40000), calls), 100);
    expect(calls[calls.length - 1]).toBe(30000);
    expect(gap).toBe(true);
    expect(recs.length).toBe(30000); // what it could get, still bucketed honestly
  });
  it("a cold cursor (-1) takes one page and reports no gap", async () => {
    const calls: number[] = [];
    const { recs, gap } = await listSince(pager(chain(500), calls), -1);
    expect(calls).toEqual([60]);
    expect(recs.length).toBe(60);
    expect(gap).toBe(false);
  });
  it("an empty page is empty, not a gap", async () => {
    const { recs, gap } = await listSince(async () => [], 100);
    expect(recs).toEqual([]);
    expect(gap).toBe(false);
  });
  it("a short page that never reached the cursor is a real gap, not a reached start", async () => {
    // Upstream clamps/prunes: a page shorter than the requested limit, but its oldest record
    // is still well past sinceOrdinal + 1 — the loop's short-page break must not read this as
    // "reached the chain start".
    const calls: number[] = [];
    const shortPager = async (limit: number) => {
      calls.push(limit);
      // Pretend upstream only ever has 40 records, starting at ordinal 461 (oldest) through 500.
      const all = Array.from({ length: 40 }, (_, i) => ({ ordinal: 500 - i }));
      return all.slice(0, limit);
    };
    const { recs, gap } = await listSince(shortPager, 100);
    expect(calls).toEqual([60]); // 40 < 60 → short page → loop breaks on the first call
    expect(recs.map((r) => r.ordinal)).toEqual(Array.from({ length: 40 }, (_, i) => 461 + i));
    expect(gap).toBe(true);
  });
});
