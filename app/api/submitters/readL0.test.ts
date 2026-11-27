import { describe, it, expect } from "vitest";
import { readL0Snapshots } from "./readL0";
import type { MetaRec } from "../trends/bucketing";

const recs: MetaRec[] = [1, 2, 3, 4, 5].map((o) => ({ ordinal: o, timestamp: new Date(Date.UTC(2026, 10, 27, 14, o)).toISOString() }));
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("readL0Snapshots", () => {
  it("keeps record order whatever order the reads answer in", async () => {
    const res = await readL0Snapshots(recs, async (o) => {
      await new Promise((r) => setTimeout(r, (6 - o) * 2)); // the newest answers first
      return { value: { ordinal: o } };
    }, 3);
    expect(res.failedAt).toBeNull();
    expect(res.read.map((r) => r.rec.ordinal)).toEqual([1, 2, 3, 4, 5]);
    expect(res.read.map((r) => (r.root.value as { ordinal: number }).ordinal)).toEqual([1, 2, 3, 4, 5]);
  });

  it("holds only the contiguous prefix before the first failure", async () => {
    const res = await readL0Snapshots(recs, async (o) => {
      await tick();
      if (o === 3) throw new Error("L0 down");
      return { value: { ordinal: o } };
    }, 2);
    expect(res.failedAt).toBe(3);
    expect(res.read.map((r) => r.rec.ordinal)).toEqual([1, 2]);
  });

  it("counts a body that is not an object as a failure", async () => {
    const res = await readL0Snapshots(recs, async (o) => (o === 2 ? null : { value: {} }), 8);
    expect(res.failedAt).toBe(2);
    expect(res.read.map((r) => r.rec.ordinal)).toEqual([1]);
  });

  it("never runs more than `pool` reads at once", async () => {
    let inFlight = 0, peak = 0;
    await readL0Snapshots(recs, async () => {
      peak = Math.max(peak, ++inFlight);
      await tick();
      inFlight--;
      return {};
    }, 2);
    expect(peak).toBe(2);
  });

  it("a spent budget starts no new read and answers the prefix read so far, not as a failure", async () => {
    let started = 0;
    const res = await readL0Snapshots(recs, async (o) => { started++; await tick(); return { value: { ordinal: o } }; }, 2, () => started >= 3);
    expect(started).toBe(3);
    expect(res.failedAt).toBeNull();
    expect(res.read.map((r) => r.rec.ordinal)).toEqual([1, 2, 3]);
  });

  it("answers an empty batch", async () => {
    expect(await readL0Snapshots([], async () => ({}), 8)).toEqual({ read: [], failedAt: null });
  });
});
