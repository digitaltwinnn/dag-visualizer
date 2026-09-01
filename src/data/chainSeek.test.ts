import { describe, it, expect } from "vitest";
import { pageOfOrdinal, estimateOrdinal, dayStartMs, dayEndMs, tsInRange, seekOrdinalByTime } from "./chainSeek";

// The executable spec for the raw log's two non-arithmetic searches. The interpolation is the part
// worth pinning: it is what turns a ~21-probe binary search into a handful, and its failure modes
// (a degenerate span, a bracket that stops narrowing) are silent — a stalled walk just spins.

describe("pageOfOrdinal (the Snapshot column's whole mechanism)", () => {
  it("puts the newest ordinal on page 1 and genesis on the last", () => {
    expect(pageOfOrdinal(1000, 1000, 25)).toBe(1);
    expect(pageOfOrdinal(976, 1000, 25)).toBe(1); // 1000..976 is page 1
    expect(pageOfOrdinal(975, 1000, 25)).toBe(2);
    expect(pageOfOrdinal(1, 1000, 25)).toBe(40);
  });

  it("clamps rather than returning a page that cannot be fetched", () => {
    expect(pageOfOrdinal(99999, 1000, 25)).toBe(1);
    expect(pageOfOrdinal(0, 1000, 25)).toBe(40);
    expect(pageOfOrdinal(-5, 1000, 25)).toBe(40);
  });

  it("survives a walk with no arithmetic base yet", () => {
    expect(pageOfOrdinal(500, 0, 25)).toBe(1);
    expect(pageOfOrdinal(500, 1000, 0)).toBe(1);
  });
});

describe("estimateOrdinal (false position over a regular cadence)", () => {
  const lo = { ordinal: 1, value: 0 };
  const hi = { ordinal: 1001, value: 1000 };

  it("lands on the linear guess when the cadence is even", () => {
    expect(estimateOrdinal(500, lo, hi)).toBe(501);
    expect(estimateOrdinal(250, lo, hi)).toBe(251);
  });

  // The property that matters more than accuracy: the walk must always be able to narrow.
  it("always returns an ordinal STRICTLY inside the bracket", () => {
    for (const target of [-1e6, 0, 1, 999, 1000, 1e6]) {
      const g = estimateOrdinal(target, lo, hi);
      expect(g).toBeGreaterThan(lo.ordinal);
      expect(g).toBeLessThan(hi.ordinal);
    }
  });

  it("bisects instead of dividing by zero when two probes share a value", () => {
    const flat = estimateOrdinal(5, { ordinal: 0, value: 7 }, { ordinal: 100, value: 7 });
    expect(flat).toBe(50);
  });

  it("stops when the bracket is already adjacent", () => {
    expect(estimateOrdinal(5, { ordinal: 10, value: 0 }, { ordinal: 11, value: 100 })).toBe(11);
  });
});

describe("the date range", () => {
  it("reads a date input as UTC midnight, and its end as the next", () => {
    expect(dayStartMs("2026-09-01")).toBe(Date.parse("2026-09-01T00:00:00.000Z"));
    expect(dayEndMs("2026-09-01")).toBe(Date.parse("2026-09-02T00:00:00.000Z"));
  });

  // An unparsed bound must be NULL, never 0 — a 0 would silently search from 1970.
  it("refuses anything that is not a plain YYYY-MM-DD", () => {
    for (const bad of ["", "2026-9-1", "01/09/2026", "2026-09-01T00:00:00Z", "nonsense"]) {
      expect(dayStartMs(bad)).toBeNull();
      expect(dayEndMs(bad)).toBeNull();
    }
  });

  it("treats the range as half-open, so adjacent days cannot both claim a stamp", () => {
    const from = dayStartMs("2026-09-01");
    const to = dayEndMs("2026-09-01");
    expect(tsInRange("2026-09-01T00:00:00.000Z", from, to)).toBe(true);
    expect(tsInRange("2026-09-01T23:59:59.999Z", from, to)).toBe(true);
    expect(tsInRange("2026-09-02T00:00:00.000Z", from, to)).toBe(false);
    expect(tsInRange("2026-08-31T23:59:59.999Z", from, to)).toBe(false);
  });

  it("leaves an absent bound open, and rejects an unparsable stamp", () => {
    expect(tsInRange("2026-09-01T12:00:00.000Z", null, null)).toBe(true);
    expect(tsInRange("2026-09-01T12:00:00.000Z", Date.parse("2026-01-01T00:00:00Z"), null)).toBe(true);
    expect(tsInRange("not a stamp", null, null)).toBe(false);
  });
});

describe("seekOrdinalByTime (the walk the Age and Anchored-into columns spend)", () => {
  // A synthetic chain: ordinal N was stamped at `epoch + N * gap`. `loadPage` mirrors the real
  // route — the 25 rows at `before, before−1, …` — and counts probes, because the probe COUNT is
  // the property that justifies interpolating at all.
  const EPOCH = Date.parse("2024-01-01T00:00:00.000Z");
  const chain = (_latest: number, gapMs: (n: number) => number) => {
    let probes = 0;
    const at = (n: number) => new Date(EPOCH + gapMs(n)).toISOString();
    const loadPage = async (before: number) => {
      probes++;
      const rows = [];
      for (let n = before; n > Math.max(0, before - 25); n--) rows.push({ ordinal: n, ts: at(n) });
      return rows;
    };
    return { loadPage, at, probes: () => probes };
  };

  it("lands exactly on the first snapshot at or after the target", async () => {
    const c = chain(100_000, (n) => n * 10_000);
    const target = EPOCH + 60_000 * 10_000;
    const got = await seekOrdinalByTime(target, 100_000, c.loadPage);
    expect(got?.ordinal).toBe(60_000);
  });

  it("spends only a handful of probes on a 1M-ordinal chain", async () => {
    const c = chain(1_000_000, (n) => n * 10_000);
    const got = await seekOrdinalByTime(EPOCH + 777_777 * 10_000, 1_000_000, c.loadPage);
    expect(got?.ordinal).toBe(777_777);
    // A blind binary search over 1M is ~20; the whole point of false position is that this is far
    // fewer. Generous bound — it pins the ORDER, not a lucky number.
    expect(c.probes()).toBeLessThanOrEqual(8);
  });

  // The failure mode the header warns about: a chain that sped up biases every interpolation, so
  // the walk must still converge by bracketing rather than by trusting the estimate.
  it("still converges when the cadence changes over the chain's life", async () => {
    const c = chain(200_000, (n) => (n < 100_000 ? n * 60_000 : 100_000 * 60_000 + (n - 100_000) * 2_000));
    const target = EPOCH + 100_000 * 60_000 + 50_000 * 2_000;
    const got = await seekOrdinalByTime(target, 200_000, c.loadPage, 24);
    expect(got?.ordinal).toBe(150_000);
  });

  it("answers from the ends when the target is outside the chain's span", async () => {
    const c = chain(50_000, (n) => n * 10_000);
    expect((await seekOrdinalByTime(EPOCH - 1e9, 50_000, c.loadPage))?.ordinal).toBe(1);
    expect((await seekOrdinalByTime(EPOCH + 1e12, 50_000, c.loadPage))?.ordinal).toBe(50_000);
  });

  // The refusal is the point: a walk that ran out of probes has NOT searched the chain, and paging
  // somewhere plausible would let the reader believe it had.
  it("returns NULL rather than a plausible page when it runs out of probes", async () => {
    // A CURVED chain, because on a regular one a single interpolated probe already lands exactly —
    // which is the whole argument for interpolating, and makes a linear chain useless for testing
    // the give-up path.
    const c = chain(200_000, (n) => (n < 100_000 ? n * 60_000 : 100_000 * 60_000 + (n - 100_000) * 2_000));
    const got = await seekOrdinalByTime(EPOCH + 100_000 * 60_000 + 50_000 * 2_000, 200_000, c.loadPage, 1);
    expect(got).toBeNull();
  });

  // Cheap insurance against the guard above regressing: bisection alone would need ~20 probes here,
  // so a budget between the two only passes while interpolation is actually doing the work.
  it("beats bisection on a regular chain rather than merely matching it", async () => {
    const c = chain(1_000_000, (n) => n * 10_000);
    const got = await seekOrdinalByTime(EPOCH + 123_456 * 10_000, 1_000_000, c.loadPage, 6);
    expect(got?.ordinal).toBe(123_456);
  });

  it("refuses a chain with no arithmetic base", async () => {
    const c = chain(0, (n) => n);
    expect(await seekOrdinalByTime(EPOCH, 0, c.loadPage)).toBeNull();
  });
});
