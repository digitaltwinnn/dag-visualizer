// The specification for the trends window transforms (rule 4): every honesty cut is pinned
// here — the review found these rules shipping untested from components/, with a divergent
// second copy in TrendsDoc, and three edge-case bugs nothing could catch (findIndex -1 read
// as "no leading gap"; the client clock judging a CDN-cached payload's newest bucket; the
// leading partial month drawn whole while the trailing one was trimmed).
import { describe, expect, it } from "vitest";
import { cutRange, leadingTrim, monthlySum, sliceWindow, trimNewestPartial, type TrendsWindowData } from "./trendWindow";

const HOUR = 3_600_000;
const DAY = 86_400_000;

function win(startMs: number, stepMs: number, ticks: (number | null)[], now?: number): TrendsWindowData {
  return {
    buckets: ticks.map((_, i) => startMs + i * stepMs),
    stepMs,
    series: { "g.ticks": ticks, "m.x.snaps": ticks.map((v) => (v == null ? null : v * 2)) },
    now: now ?? startMs + ticks.length * stepMs,
  };
}

describe("trimNewestPartial", () => {
  it("drops the bucket the payload's own now still falls inside", () => {
    const w = win(0, HOUR, [1, 2, 3], 2 * HOUR + 1); // now inside bucket 2
    expect(trimNewestPartial(w).buckets).toEqual([0, HOUR]);
  });
  it("keeps a complete newest bucket — and judges by payload time, never the client clock", () => {
    const w = win(0, HOUR, [1, 2, 3], 3 * HOUR); // assembled exactly at the boundary
    expect(trimNewestPartial(w).buckets.length).toBe(3);
  });
  it("is a no-op on an empty window", () => {
    expect(trimNewestPartial(win(0, HOUR, [])).buckets).toEqual([]);
  });
});

describe("sliceWindow", () => {
  it("keeps the newest span, measured from the payload's newest bucket", () => {
    const w = win(0, HOUR, new Array<number>(48).fill(1));
    const s = sliceWindow(w, 24 * HOUR);
    expect(s.buckets.length).toBe(24);
    expect(s.buckets[0]).toBe(24 * HOUR);
    expect(s.series["m.x.snaps"].length).toBe(24);
  });
  it("returns the whole window when the span covers it", () => {
    const w = win(0, HOUR, [1, 2]);
    expect(sliceWindow(w, DAY).buckets.length).toBe(2);
  });
});

describe("leadingTrim", () => {
  it("drops the unmeasured prefix, keeping interior holes", () => {
    const w = win(0, DAY, [null, null, 5, null, 7]);
    const t = leadingTrim(w);
    expect(t.buckets[0]).toBe(2 * DAY);
    expect(t.series["g.ticks"]).toEqual([5, null, 7]);
  });
  it("trims a fully-unmeasured window to EMPTY — -1 is not 'no leading gap'", () => {
    const t = leadingTrim(win(0, DAY, [null, null, null]));
    expect(t.buckets).toEqual([]);
    expect(t.series["g.ticks"]).toEqual([]);
  });
  it("is identity when measurement starts at the first bucket", () => {
    const w = win(0, DAY, [1, 2]);
    expect(leadingTrim(w)).toEqual(w);
  });
});

describe("monthlySum", () => {
  const jan1 = Date.UTC(2026, 0, 1);
  it("sums counters per calendar month and keeps unmeasured months null", () => {
    const ticks: (number | null)[] = new Array(59).fill(1); // Jan (31) + Feb (28), complete
    const w = win(jan1, DAY, ticks, Date.UTC(2026, 3, 15)); // assembled mid-April
    const m = monthlySum(w);
    expect(m.buckets).toEqual([Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1)]);
    expect(m.series["g.ticks"]).toEqual([31, 28]);
  });
  it("trims the forming trailing month (payload assembled inside it)", () => {
    const ticks: (number | null)[] = new Array(40).fill(1); // Jan + early Feb
    const m = monthlySum(win(jan1, DAY, ticks, Date.UTC(2026, 1, 10)));
    expect(m.buckets).toEqual([Date.UTC(2026, 0, 1)]);
  });
  it("trims a partial LEADING month — the partial-edge rule reaches both ends", () => {
    const jan15 = Date.UTC(2026, 0, 15);
    const ticks: (number | null)[] = new Array(17 + 28).fill(1); // Jan 15-31 + all of Feb
    const m = monthlySum(win(jan15, DAY, ticks, Date.UTC(2026, 2, 5)));
    expect(m.buckets).toEqual([Date.UTC(2026, 1, 1)]);
    expect(m.series["g.ticks"]).toEqual([28]);
  });
});

describe("cutRange", () => {
  const t0 = Date.UTC(2026, 8, 1);
  it("keeps every bucket the range intersects, mid-bucket edges included", () => {
    const w = win(t0, HOUR, [1, 2, 3, 4, 5, 6]);
    // from inside bucket 1, to inside bucket 4 — both partial-touched buckets stay
    const c = cutRange(w, t0 + HOUR + 60_000, t0 + 4 * HOUR + 60_000);
    expect(c.buckets).toEqual([t0 + HOUR, t0 + 2 * HOUR, t0 + 3 * HOUR, t0 + 4 * HOUR]);
    expect(c.series["g.ticks"]).toEqual([2, 3, 4, 5]);
  });
  it("cuts to empty on a non-overlapping or inverted range instead of throwing", () => {
    const w = win(t0, HOUR, [1, 2, 3]);
    expect(cutRange(w, t0 + 10 * HOUR, t0 + 12 * HOUR).buckets).toEqual([]);
    expect(cutRange(w, t0 + 2 * HOUR, t0).buckets).toEqual([]);
  });
  it("is the whole window when the range covers it", () => {
    const w = win(t0, HOUR, [1, 2, 3]);
    expect(cutRange(w, t0 - HOUR, t0 + 10 * HOUR).buckets.length).toBe(3);
  });
});
