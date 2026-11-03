import { describe, it, expect } from "vitest";
import { ledgerFacts, type LedgerFactsInput } from "@/src/data/noteFactsLedger";
import { checkNote } from "@/src/data/noteHonesty";
import { pairsOf } from "@/src/data/testkit/notePairs";
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

  it("states the spacing as durations, written out", () => {
    const r = ledgerFacts(input())!;
    const [mean] = find(r, /^Mean spacing between global snapshots, recent/);
    const [longest] = find(r, /^Longest gap between global snapshots, recent/);
    expect(mean!.kind).toBe("duration");
    expect(mean!.value).toBeCloseTo(15, 9); // g.gapSum / g.ticks
    expect(mean!.text).toBe("15 seconds");
    expect(longest!.kind).toBe("duration");
    expect(longest!.value).toBe(40);
    expect(longest!.text).toBe("40 seconds");
  });

  it("states the metagraph snapshots anchored per global snapshot with one decimal, fees and data per hour, and the networks that anchored", () => {
    const r = ledgerFacts(input())!;
    const [per] = find(r, /anchored per global snapshot/);
    expect(per!.kind).toBe("amount");
    expect(per!.value).toBeCloseTo(3, 9);
    expect(per!.text).toBe("3");
    expect(find(r, /^Fees in DAG per hour, recent/)).toHaveLength(1);
    expect(find(r, /^Fees in DAG per hour, usual/)).toHaveLength(1);
    expect(find(r, /^Data in MB per hour, recent/)).toHaveLength(1);
    expect(find(r, /^Data in MB per hour, usual/)).toHaveLength(1);
    const [n] = find(r, /^Networks that anchored metagraph snapshots, recent/);
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

  it("counts unlisted chains as a floor: one more network, labelled at least", () => {
    const plain = ledgerFacts(input())!;
    expect(find(plain, /^Networks that anchored metagraph snapshots, recent$/)[0]!.value).toBe(2);
    const r = ledgerFacts(input({ recent: side(74, 5 * MIN, 20, { "m.xyz.snaps": row(74, () => 3) }) }))!;
    const [n] = find(r, /^Networks that anchored metagraph snapshots, recent, at least$/);
    expect(n!.value).toBe(3);
    expect(find(r, /^Networks that anchored metagraph snapshots, recent$/)).toHaveLength(0);
    expect(r.facts.some((f) => /listed/i.test(f.label))).toBe(false);
  });

  it("returns the full catalog in names", () => {
    expect(ledgerFacts(input())!.names).toEqual(expect.arrayContaining(["USDC.dag", "BioFi", "Dor"]));
  });
});

describe("ledgerFacts on a network", () => {
  it("states the snapshots per hour with a ratio naming the network", () => {
    const r = ledgerFacts(input({ subject: "usdc" }))!;
    expect(find(r, /^USDC\.dag metagraph snapshots anchored per hour, recent/)[0]!.value).toBeCloseTo(60, 9);
    expect(find(r, /^USDC\.dag metagraph snapshots anchored per hour, usual/)[0]!.value).toBeCloseTo(30, 9);
    const ratios = r.facts.filter((f) => f.kind === "ratio");
    expect(ratios).toHaveLength(1);
    expect(ratios[0]!.label).toContain("USDC.dag");
    expect(ratios[0]!.value).toBeCloseTo(2, 9);
    expect(r.facts.some((f) => /Dor|BioFi/.test(f.label))).toBe(false);
  });

  it("states its mean and longest spacing", () => {
    const r = ledgerFacts(input({ subject: "usdc" }))!;
    const [mean] = find(r, /^USDC\.dag mean spacing between metagraph snapshots, recent/);
    expect(mean!.kind).toBe("duration");
    expect(mean!.value).toBeCloseTo(20, 9); // gapSum 100 over 5 snapshots per bucket
    const [longest] = find(r, /^USDC\.dag longest gap between metagraph snapshots, recent/);
    expect(longest!.value).toBe(55);
    expect(longest!.text).toBe("55 seconds");
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

describe("ledgerFacts tags each change as a pair (R54)", () => {

  it("keys the usual and the recent reading of each rate, spacing, fee and data figure of the chamber", () => {
    const r = ledgerFacts(input())!;
    const p = pairsOf(r.facts);
    expect([...p.keys()]).toEqual([
      "Global snapshots per hour",
      "Mean spacing between global snapshots",
      "Fees in DAG per hour",
      "Data in MB per hour",
    ]);
    expect(p.get("Global snapshots per hour")).toEqual(["Global snapshots per hour, usual", 120, "Global snapshots per hour, recent", 240]);
    for (const [k, [from, fv, to, tv]] of p) {
      expect([from, to], k).toEqual([`${k}, usual`, `${k}, recent`]);
      expect(fv, k).toBe(find(r, new RegExp(`^${k}, usual$`))[0]!.value);
      expect(tv, k).toBe(find(r, new RegExp(`^${k}, recent$`))[0]!.value);
    }
  });

  it("never keys a floor: fees and data with an unmeasured unlisted channel are no pair", () => {
    const r = ledgerFacts(input({ recent: side(74, 5 * MIN, 20, { "u.cov": row(74, () => null) }) }))!;
    expect([...pairsOf(r.facts).keys()]).toEqual(["Global snapshots per hour", "Mean spacing between global snapshots"]);
  });

  it("keys a network's own rate and spacing", () => {
    const p = pairsOf(ledgerFacts(input({ subject: "usdc" }))!.facts);
    expect(p.get("USDC.dag metagraph snapshots anchored per hour")).toEqual([
      "USDC.dag metagraph snapshots anchored per hour, usual", 30, "USDC.dag metagraph snapshots anchored per hour, recent", 60,
    ]);
    expect(p.get("USDC.dag mean spacing between metagraph snapshots")).toEqual([
      "USDC.dag mean spacing between metagraph snapshots, usual", 20, "USDC.dag mean spacing between metagraph snapshots, recent", 20,
    ]);
    expect(p.size).toBe(2);
  });
});

// R71 (user, 2026-10-29: "change, else now"): the builder says which question the prompt asks.
describe("ledgerFacts says what the note leads with", () => {
  it("leads with change when a pair moved a tenth or more, naming every pair that did: recent at twice the usual moves the rate, the fees and the data, not the spacing", () => {
    expect(ledgerFacts(input())!.lead).toEqual({ kind: "change", moved: ["Global snapshots per hour", "Fees in DAG per hour", "Data in MB per hour"] });
  });
  it("leads with the reading itself when every pair held: the week at the recent rate", () => {
    expect(ledgerFacts(input({ week: side(168, HOUR, 240) }))!.lead).toEqual({ kind: "now" });
  });
  it("a move under a tenth is no change (240 against 228 an hour), one over it is (240 against 214)", () => {
    expect(ledgerFacts(input({ week: side(168, HOUR, 228) }))!.lead).toEqual({ kind: "now" });
    expect(ledgerFacts(input({ week: side(168, HOUR, 214) }))!.lead.kind).toBe("change");
  });
  it("names only the pair that moved: the fees alone", () => {
    const week = side(168, HOUR, 240, { "g.feeFloor": row(168, () => 240 * 2e7) });
    expect(ledgerFacts(input({ week }))!.lead).toEqual({ kind: "change", moved: ["Fees in DAG per hour"] });
  });
  it("with nothing usual to measure there is no pair, so the reading itself", () => {
    expect(ledgerFacts(input({ week: side(168, HOUR, 0, { "g.ticks": row(168, () => null) }) }))!.lead).toEqual({ kind: "now" });
  });
  it("a network's own pairs decide its note", () => {
    expect(ledgerFacts(input({ subject: "usdc" }))!.lead).toEqual({ kind: "change", moved: ["USDC.dag metagraph snapshots anchored per hour"] });
    expect(ledgerFacts(input({ subject: "usdc", week: side(168, HOUR, 240) }))!.lead).toEqual({ kind: "now" });
  });
});

// THE CARD'S ROWS (user, 2026-10-31: "do snapshots also"): a network's rhythm leaving its usual one.
describe("ledgerFacts' notable changes", () => {
  const weekSide = (over: Record<string, (number | null)[]>) => side(168, HOUR, 120, over, 0);
  it("a row for a network anchoring well off its usual pace", () => {
    const r = ledgerFacts(input({ week: weekSide({ "m.usdc.gapSum": row(168, () => 30 * 60) }) }))!; // 30 snapshots, 60s apart
    expect(r.changes?.[0]).toEqual({ kind: "faster", size: expect.any(Number), text: "USDC.dag sped up: a metagraph snapshot every 20 seconds, usually 1 minute", subject: { kind: "network", id: "usdc" } });
  });
  it("a row for a network that stopped, ahead of any pace", () => {
    const r = ledgerFacts(input({
      recent: side(74, 5 * MIN, 20, { "m.bio.snaps": row(74, () => 0), "m.bio.ticks": row(74, () => 0) }),
      week: weekSide({ "m.usdc.gapSum": row(168, () => 30 * 60) }),
    }))!;
    expect(r.changes?.slice(0, 2).map((c) => c.text)).toEqual(["BioFi went quiet", "USDC.dag sped up: a metagraph snapshot every 20 seconds, usually 1 minute"]);
  });
  // A DAY IS ONLY AN EVENT WHERE THE NETWORK HAS A DAILY RHYTHM (the review, 2026-11-02).
  const quietDay = side(74, 5 * MIN, 20, { "m.bio.snaps": row(74, () => 0), "m.bio.ticks": row(74, () => 0) });
  const texts = (r: ReturnType<typeof ledgerFacts>) => r!.changes?.map((c) => c.text) ?? [];
  it("no 'went quiet' for a network that anchors every few days", () => {
    const sparse = weekSide({ "m.bio.snaps": row(168, (i) => (i % 72 === 0 ? 1 : 0)), "m.bio.ticks": row(168, () => 0) });
    expect(texts(ledgerFacts(input({ recent: quietDay, week: sparse })))).not.toContain("BioFi went quiet");
  });
  it("a quiet network asks for its last snapshot", () => {
    const r = ledgerFacts(input({ recent: quietDay, week: weekSide({}) }))!;
    expect(r.changes?.find((c) => c.kind === "quiet")?.find).toEqual({ chain: "bio", last: true });
  });
  it("no 'became active' for a network's one snapshot of the week", () => {
    const one = (n: number, at: number) => ({ "m.bio.snaps": row(n, (i) => (i === at ? 1 : 0)), "m.bio.ticks": row(n, () => 0) });
    const r = ledgerFacts(input({ recent: side(74, 5 * MIN, 20, one(74, 30)), week: weekSide(one(168, 160)) }));
    expect(texts(r)).not.toContain("BioFi became active");
  });
  it("'became active' for a network that opened the week today", () => {
    const three = (n: number, at: number) => ({ "m.bio.snaps": row(n, (i) => (i === at ? 3 : 0)), "m.bio.ticks": row(n, () => 0) });
    const r = ledgerFacts(input({ recent: side(74, 5 * MIN, 20, three(74, 30)), week: weekSide(three(168, 160)) }));
    expect(texts(r)).toContain("BioFi became active");
  });
  it("no 'went quiet' over a day the spine has a hole in: an unmeasured bucket is not a zero", () => {
    const holed = { ...quietDay, series: { ...quietDay.series, "g.ticks": row(74, (i) => (i === 30 ? null : 20)) } };
    expect(texts(ledgerFacts(input({ recent: holed, week: weekSide({}) })))).not.toContain("BioFi went quiet");
  });
  it("no 'went quiet' for a chain the sampler has not been able to read", () => {
    const at = quietDay.now;
    expect(texts(ledgerFacts(input({ recent: quietDay, week: weekSide({}), chainReads: { bio: at - 3 * 3_600_000 } })))).not.toContain("BioFi went quiet");
    expect(texts(ledgerFacts(input({ recent: quietDay, week: weekSide({}), chainReads: { bio: at } })))).toContain("BioFi went quiet");
  });
  it("gives every row to what moved before the chamber's extremes", () => {
    const stopped = { "m.bio.snaps": row(74, () => 0), "m.bio.ticks": row(74, () => 0), "m.usdc.snaps": row(74, () => 0), "m.usdc.ticks": row(74, () => 0), "m.usdc.gapMax": row(74, () => 90) };
    const r = ledgerFacts(input({ recent: side(74, 5 * MIN, 20, stopped), week: weekSide({}) }))!;
    expect(r.changes?.slice(0, 2).map((c) => c.kind)).toEqual(["quiet", "quiet"]);
  });
  // A NETWORK'S OWN NOTE HAS ROWS TOO (user, 2026-11-02: "that 2.3 hour gap should be a notable event no?").
  describe("what a network's own note flags", () => {
    const stalled = { "m.usdc.gapMax": row(74, (i) => (i === 40 ? 8280 : 30)) };
    const usual = { "m.usdc.gapMax": row(168, () => 40) };
    it("a gap far past its usual widest one, stated against its normal spacing", () => {
      const r = ledgerFacts(input({ subject: "usdc", recent: side(74, 5 * MIN, 20, stalled), week: weekSide(usual) }))!;
      expect(r.changes).toContainEqual(expect.objectContaining({ kind: "pause", size: 8280, subject: { kind: "network", id: "usdc" }, text: "USDC.dag paused for 2.3 hours, normally a metagraph snapshot every 20 seconds" }));
    });
    it("names the bucket that gap ended in, for the snapshot to be found", () => {
      const r = ledgerFacts(input({ subject: "usdc", recent: side(74, 5 * MIN, 20, stalled), week: weekSide(usual) }))!;
      const at = T0 + 40 * 5 * MIN;
      expect(r.changes?.find((c) => c.kind === "pause")?.find).toEqual({ chain: "usdc", fromMs: at, toMs: at + 5 * MIN, gapS: 8280 });
    });
    it("no row for a gap of its usual size", () => {
      const r = ledgerFacts(input({ subject: "usdc", recent: side(74, 5 * MIN, 20, { "m.usdc.gapMax": row(74, () => 41) }), week: weekSide(usual) }))!;
      expect(r.changes ?? []).toEqual([]);
    });
    it("fees or data running far from their usual rate", () => {
      const fees = (n: number, f: number) => ({ "m.usdc.fee": row(n, () => f) });
      const r = ledgerFacts(input({ subject: "usdc", recent: side(74, 5 * MIN, 20, fees(74, 2e8)), week: weekSide(fees(168, 2e8)) }))!;
      expect(r.changes?.map((c) => c.kind)).toContain("high");
    });
  });
  it("on the whole network, a stall of global snapshots is one row, not one per network", () => {
    const stall = { "g.gapMax": row(74, (i) => (i === 40 ? 8280 : 30)), "m.usdc.gapMax": row(74, (i) => (i === 40 ? 8280 : 30)), "m.bio.gapMax": row(74, (i) => (i === 40 ? 8280 : 30)) };
    const usualGap = { "g.gapMax": row(168, () => 40), "m.usdc.gapMax": row(168, () => 40), "m.bio.gapMax": row(168, () => 40) };
    const r = ledgerFacts(input({ recent: side(74, 5 * MIN, 20, stall), week: side(168, HOUR, 120, usualGap, 0) }))!;
    const pauses = r.changes!.filter((c) => c.kind === "pause");
    expect(pauses).toHaveLength(1);
    expect(pauses[0]).toMatchObject({ subject: { kind: "network", id: "dag" }, text: "Global snapshots paused for 2.3 hours, normally one every 30 seconds" });
    expect(pauses[0]!.find).toMatchObject({ chain: null, gapS: 8280 });
    expect(r.changes!.some((c) => c.kind === "longest")).toBe(false); // the pause is that gap
  });
  // THE CHAMBER'S EXTREMES (user, 2026-11-01): a day where nothing moved still has a largest snapshot.
  it("the usual rhythm still names the longest gap", () => {
    expect(ledgerFacts(input())!.changes).toEqual([
      expect.objectContaining({ kind: "longest", size: -1, text: "USDC.dag had the longest gap, 55 seconds", subject: { kind: "network", id: "usdc" } }),
    ]);
  });
  it("names the largest global snapshot once the sampler holds one, ahead of the gap", () => {
    const r = ledgerFacts(input({ recent: side(74, 5 * MIN, 20, { "g.anchorsMax": row(74, (i) => (i === 30 ? 18 : 6)) }) }))!;
    expect(r.changes?.map((c) => c.text)).toEqual(["The largest global snapshot anchored 18 metagraph snapshots", "USDC.dag had the longest gap, 55 seconds"]);
    const at = T0 + 30 * 5 * MIN;
    expect(r.changes?.[0]).toMatchObject({ kind: "peak", subject: { kind: "self" }, find: { chain: null, fromMs: at, toMs: at + 5 * MIN, count: 18 } });
  });
  it("names none from before the sampler held one", () => {
    expect(ledgerFacts(input())!.changes?.some((c) => c.kind === "peak")).toBe(false);
  });
  it("a network's own note reads its own rhythm, and no other network's", () => {
    const r = ledgerFacts(input({ subject: "usdc", week: weekSide({ "m.usdc.gapSum": row(168, () => 30 * 60) }) }))!;
    expect(r.changes?.map((c) => c.subject)).toEqual([{ kind: "network", id: "usdc" }]);
  });
});
