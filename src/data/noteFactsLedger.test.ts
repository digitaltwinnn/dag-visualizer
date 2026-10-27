import { describe, it, expect } from "vitest";
import { ledgerFacts, type LedgerFactsInput } from "@/src/data/noteFactsLedger";
import { checkNote } from "@/src/data/noteHonesty";
import { formatSeconds } from "@/src/data/trendSeries";
import type { TrendsWindowData } from "@/src/data/trendWindow";

const MIN = 60_000;
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 27, 0);

const NAMES = { usdc: "USDC.dag", bio: "BioFi", dor: "Dor" };

const row = (n: number, f: (i: number) => number | null): (number | null)[] => Array.from({ length: n }, (_, i) => f(i));

function win(n: number, stepMs: number, series: Record<string, (number | null)[]>, start = T0): TrendsWindowData {
  return { buckets: row(n, (i) => start + i * stepMs) as number[], stepMs, series, now: start + n * stepMs + 1000 };
}

/** One hour's worth of the chamber, scaled: `k` is the global snapshots per bucket, `u` whether the unlisted
 *  channels were measured. A bucket here is `per` of an hour (12 five-minute buckets, 1 hourly). */
function side(n: number, stepMs: number, k: number, over: Record<string, (number | null)[]> = {}, u: number | null = 0): TrendsWindowData {
  return win(n, stepMs, {
    "g.ticks": row(n, () => k),
    "g.anchors": row(n, () => k * 3),
    "g.gapSum": row(n, () => k * 15),
    "g.gapMax": row(n, () => 40),
    "g.feeFloor": row(n, () => k * 1e7),
    "g.kbFloor": row(n, () => k * 1024),
    "u.cov": row(n, () => u),
    "m.usdc.snaps": row(n, () => k / 4),
    "m.usdc.ticks": row(n, () => k / 2),
    "m.usdc.gapSum": row(n, () => (k / 4) * 20),
    "m.usdc.gapMax": row(n, () => 55),
    "m.bio.snaps": row(n, () => k / 8),
    "m.bio.ticks": row(n, () => k / 8),
    "m.dor.snaps": row(n, () => 0),
    "m.dor.ticks": row(n, () => 0),
    ...over,
  });
}

// Recent runs at 20 global snapshots per five minutes (240 an hour); the week at 120 an hour: twice.
function input(patch: Partial<LedgerFactsInput> = {}): LedgerFactsInput {
  return { subject: "all", recent: side(74, 5 * MIN, 20), week: side(168, HOUR, 120, {}, 0), names: NAMES, ...patch };
}

const find = (r: NonNullable<ReturnType<typeof ledgerFacts>>, re: RegExp, kind?: string) =>
  r.facts.filter((f) => re.test(f.label) && (!kind || f.kind === kind));

describe("ledgerFacts on the whole chamber", () => {
  it("states the recent rate, the usual rate and a ratio of 2.00, the ratio naming no network", () => {
    const r = ledgerFacts(input())!;
    const [recent] = find(r, /^Global snapshots per hour, recent/);
    const [usual] = find(r, /^Global snapshots per hour, usual/);
    expect(recent!.value).toBeCloseTo(240, 9);
    expect(usual!.value).toBeCloseTo(120, 9);
    const [ratio] = find(r, /^Global snapshots per hour, ratio/, "ratio");
    expect(ratio!.value).toBeCloseTo(2, 9);
    expect(ratio!.text).toBe("2.00");
    for (const f of r.facts.filter((x) => x.kind === "ratio")) for (const n of Object.values(NAMES)) expect(f.label).not.toContain(n);
  });

  it("is the same for subject dag", () => {
    expect(ledgerFacts(input({ subject: "dag" }))!.facts).toEqual(ledgerFacts(input())!.facts);
  });

  it("states the spacing as durations whose text is formatSeconds", () => {
    const r = ledgerFacts(input())!;
    const [mean] = find(r, /^Mean spacing between global snapshots, recent/);
    const [longest] = find(r, /^Longest gap between global snapshots, recent/);
    expect(mean!.kind).toBe("duration");
    expect(mean!.value).toBeCloseTo(15, 9); // g.gapSum / g.ticks
    expect(mean!.text).toBe(formatSeconds(mean!.value));
    expect(longest!.kind).toBe("duration");
    expect(longest!.value).toBe(40);
    expect(longest!.text).toBe(formatSeconds(40));
  });

  it("states the snapshots anchored per global snapshot with one decimal, fees and data per hour, and the networks that anchored", () => {
    const r = ledgerFacts(input())!;
    const [per] = find(r, /anchored per global snapshot/);
    expect(per!.kind).toBe("amount");
    expect(per!.value).toBeCloseTo(3, 9);
    expect(per!.text).toBe("3");
    expect(find(r, /^Fees in DAG per hour, recent/)).toHaveLength(1);
    expect(find(r, /^Fees in DAG per hour, usual/)).toHaveLength(1);
    expect(find(r, /^Data in MB per hour, recent/)).toHaveLength(1);
    expect(find(r, /^Data in MB per hour, usual/)).toHaveLength(1);
    const [n] = find(r, /^Networks that anchored snapshots, recent/);
    expect(n!.value).toBe(2); // Dor created nothing
  });

  it("measures per hour over measured buckets only: a hole is neither a zero nor extrapolated", () => {
    const holey = side(74, 5 * MIN, 20, { "g.ticks": row(74, (i) => (i < 30 ? null : 20)) });
    const [recent] = find(ledgerFacts(input({ recent: holey }))!, /^Global snapshots per hour, recent/);
    expect(recent!.value).toBeCloseTo(240, 9);
  });

  it("labels fees and data a floor, with no wrong ratio, where the unlisted channels went unmeasured", () => {
    const r = ledgerFacts(input({ recent: side(74, 5 * MIN, 20, { "u.cov": row(74, () => null) }) }))!;
    const [fees] = find(r, /^Fees in DAG per hour, recent/);
    expect(fees!.label).toContain(", at least");
    expect(find(r, /^Fees in DAG per hour, usual/)[0]!.label).not.toContain("at least");
    expect(r.facts.some((f) => f.kind === "ratio" && /Fees|Data/.test(f.label))).toBe(false);
  });

  it("gives no ratio when the week has nothing measured", () => {
    const r = ledgerFacts(input({ week: side(168, HOUR, 120, { "g.ticks": row(168, () => null) }) }))!;
    expect(find(r, /^Global snapshots per hour, recent/)).toHaveLength(1);
    expect(find(r, /^Global snapshots per hour, usual/)).toHaveLength(0);
    expect(r.facts.some((f) => f.kind === "ratio")).toBe(false);
  });

  it("returns null when recent has no covered bucket", () => {
    expect(ledgerFacts(input({ recent: side(74, 5 * MIN, 20, { "g.ticks": row(74, () => null) }) }))).toBeNull();
    expect(ledgerFacts(input({ recent: win(0, 5 * MIN, {}) }))).toBeNull();
  });

  it("returns the full catalog in names", () => {
    expect(ledgerFacts(input())!.names).toEqual(expect.arrayContaining(["USDC.dag", "BioFi", "Dor"]));
  });
});

describe("ledgerFacts on a network", () => {
  it("states the snapshots per hour with a ratio naming the network", () => {
    const r = ledgerFacts(input({ subject: "usdc" }))!;
    expect(find(r, /^USDC\.dag snapshots anchored per hour, recent/)[0]!.value).toBeCloseTo(60, 9);
    expect(find(r, /^USDC\.dag snapshots anchored per hour, usual/)[0]!.value).toBeCloseTo(30, 9);
    const ratios = r.facts.filter((f) => f.kind === "ratio");
    expect(ratios).toHaveLength(1);
    expect(ratios[0]!.label).toContain("USDC.dag");
    expect(ratios[0]!.value).toBeCloseTo(2, 9);
    expect(r.facts.some((f) => /Dor|BioFi/.test(f.label))).toBe(false);
  });

  it("states its mean and longest spacing", () => {
    const r = ledgerFacts(input({ subject: "usdc" }))!;
    const [mean] = find(r, /^USDC\.dag mean spacing between snapshots, recent/);
    expect(mean!.kind).toBe("duration");
    expect(mean!.value).toBeCloseTo(20, 9); // gapSum 100 over 5 snapshots per bucket
    const [longest] = find(r, /^USDC\.dag longest gap between snapshots, recent/);
    expect(longest!.value).toBe(55);
    expect(longest!.text).toBe(formatSeconds(55));
  });

  it("states the share of the global snapshots it was part of, between 0 and 1", () => {
    const r = ledgerFacts(input({ subject: "usdc" }))!;
    const [share] = find(r, /was part of/, "share");
    expect(share!.label).toContain("USDC.dag");
    expect(share!.value).toBeCloseTo(0.5, 9);
    expect(share!.text).toBe("50%");
    expect(share!.value).toBeGreaterThan(0);
    expect(share!.value).toBeLessThanOrEqual(1);
  });

  it("returns null for a network with nothing measured", () => {
    expect(ledgerFacts(input({ subject: "ghost" }))).toBeNull();
  });
});

describe("ledgerFacts as a gate-passing source", () => {
  it("accepts an honest sentence and rejects one with a number the facts do not hold", () => {
    const r = ledgerFacts(input())!;
    expect(checkNote("Global snapshots arrived at twice the usual rate.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Global snapshots rose by 100% against the usual.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Global snapshots rose by 70% against the usual.", r.facts, r.names).ok).toBe(false);
    expect(checkNote("The longest gap was 3 minutes.", r.facts, r.names).ok).toBe(false);
    const n = ledgerFacts(input({ subject: "usdc" }))!;
    expect(checkNote("USDC.dag was part of 50% of the global snapshots.", n.facts, n.names).ok).toBe(true);
    expect(checkNote("USDC.dag was part of 80% of the global snapshots.", n.facts, n.names).ok).toBe(false);
  });
});
