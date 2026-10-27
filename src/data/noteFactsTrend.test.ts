import { describe, it, expect } from "vitest";
import { trendFacts, type TrendFactsInput } from "@/src/data/noteFactsTrend";
import { checkNote } from "@/src/data/noteHonesty";
import { factsBlock } from "@/src/data/noteFacts";
import type { TrendsWindowData } from "@/src/data/trendWindow";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1);

const NAMES = { usdc: "USDC.dag", bio: "BioFi", dor: "Dor" };
const BLURBS = { usdc: "a dollar stablecoin on the hypergraph", bio: "a lending app", dor: "a data marketplace" };

const row = (n: number, f: (i: number) => number | null): (number | null)[] => Array.from({ length: n }, (_, i) => f(i));

/** A daily window of `n` buckets from `start`; `now` is past the last bucket, so nothing is partial. */
function win(n: number, series: Record<string, (number | null)[]>, start = T0): TrendsWindowData {
  return { buckets: row(n, (i) => start + i * DAY) as number[], stepMs: DAY, series, now: start + n * DAY + 1000 };
}

/** Seven days. The first and last are edge buckets and are trimmed, so the span's days are 1..5. */
function week(k: number, over: Record<string, (number | null)[]> = {}): Record<string, (number | null)[]> {
  return {
    "g.ticks": row(7, () => 288),
    "g.anchors": row(7, () => 100 * k),
    "g.blocks": row(7, () => 40 * k),
    "g.fee": row(7, () => 5e8 * k),
    "g.kb": row(7, () => 2048 * k),
    "g.gapSum": row(7, () => 288 * 30 * k),
    "f.nodes": row(7, () => 167),
    "f.nodes.dag": row(7, () => 135),
    "m.usdc.snaps": row(7, () => 60 * k),
    "m.bio.snaps": row(7, () => 30 * k),
    "m.dor.snaps": row(7, () => 10 * k),
    "m.usdc.blocks": row(7, () => 20 * k),
    "m.usdc.fee": row(7, () => 1e8 * k),
    "m.usdc.kb": row(7, () => 1024 * k),
    "m.usdc.gapSum": row(7, () => 60 * k * 12),
    "f.nodes.usdc": row(7, () => 17),
    ...over,
  };
}

function input(patch: Partial<TrendFactsInput> = {}): TrendFactsInput {
  return {
    subject: "dag",
    zoom: "7d",
    span: { fromMs: T0, toMs: T0 + 7 * DAY },
    cur: win(7, week(2)),
    prev: win(7, week(1), T0 - 7 * DAY),
    daily: null,
    names: NAMES,
    blurbs: BLURBS,
    ...patch,
  };
}

const find = (r: NonNullable<ReturnType<typeof trendFacts>>, re: RegExp, kind?: string) =>
  r.facts.filter((f) => re.test(f.label) && (!kind || f.kind === kind));

describe("trendFacts on the hypergraph", () => {
  it("states the snapshots-anchored ratio as cur over prev, per day", () => {
    const r = trendFacts(input())!;
    const [ratio] = find(r, /Snapshots anchored/, "ratio");
    expect(ratio!.value).toBeCloseTo(2, 9);
    expect(ratio!.text).toBe("2.00");
    const [cur] = find(r, /^Snapshots anchored, per day, this span/);
    expect(cur!.value).toBe(200);
  });

  it("gives every ratio a label that names no network", () => {
    const r = trendFacts(input())!;
    const dagRatios = r.facts.filter((f) => f.kind === "ratio" && !/USDC\.dag|BioFi|Dor/.test(f.label));
    expect(dagRatios.length).toBeGreaterThan(3);
    for (const f of dagRatios) for (const n of Object.values(NAMES)) expect(f.label).not.toContain(n);
  });

  it("names the top three networks with shares that sum to at most one, and counts the active ones", () => {
    const r = trendFacts(input({ cur: win(7, week(2, { "m.zed.snaps": row(7, () => 4) })), names: { ...NAMES, zed: "Zed" }, blurbs: {} }))!;
    const shares = r.facts.filter((f) => f.kind === "share");
    expect(shares).toHaveLength(3);
    expect(shares.reduce((a, f) => a + f.value, 0)).toBeLessThanOrEqual(1 + 1e-9);
    expect(shares.map((f) => f.label)).toEqual([
      "USDC.dag share of snapshots anchored, this span",
      "BioFi share of snapshots anchored, this span",
      "Dor share of snapshots anchored, this span",
    ]);
    // The whole is never smaller than its networks added up (204 here, the total says 200).
    expect(shares[0]!.value).toBeCloseTo(120 / 204, 9);
    expect(find(r, /^Networks that anchored/)[0]!.value).toBe(4);
    const quiet = find(r, /^Quietest active network/)[0]!;
    expect(quiet.label).toContain("Zed");
    expect(quiet.value).toBe(4);
    expect(r.names).toEqual(expect.arrayContaining(["USDC.dag", "BioFi", "Dor", "Zed"]));
  });

  it("gives a top network its own ratio, named in the label", () => {
    const r = trendFacts(input())!;
    const f = r.facts.find((x) => x.kind === "ratio" && x.label === "USDC.dag snapshots anchored, ratio to previous span")!;
    expect(f.value).toBeCloseTo(2, 9);
  });

  it("reads nodes through gaugeChange: the DAG's own nodes, start and end", () => {
    const r = trendFacts(input({ cur: win(7, week(2)), prev: null }))!;
    // 7 samples is under the 12 a level needs, so no node line is stated at all.
    expect(find(r, /Nodes/)).toEqual([]);
    const long = win(14, { ...week(2), "g.ticks": row(14, () => 288), "f.nodes.dag": row(14, (i) => (i < 7 ? 140 : 120)) });
    const r2 = trendFacts(input({ cur: long, prev: null }))!;
    expect(find(r2, /^Nodes at the start/)[0]!.value).toBe(140);
    expect(find(r2, /^Nodes at the end/)[0]!.value).toBe(120);
    expect(find(r2, /^Nodes, ratio/, "ratio")[0]!.value).toBeCloseTo(120 / 140, 9);
  });

  it("is a gate-passing source: a sentence built from a ratio it emitted is accepted, a wrong one is not", () => {
    const r = trendFacts(input())!;
    // Snapshots anchored doubled: ratio 2.00, so "rose by 100%" is (r-1)*100.
    expect(checkNote("Snapshots anchored rose by 100% against the span before.", r.facts, r.names)).toEqual({ ok: true });
    expect(checkNote("Snapshots anchored rose by 70% against the span before.", r.facts, r.names).ok).toBe(false);
    // A network's own ratio is attributed by name.
    expect(checkNote("USDC.dag more than doubled its snapshots.", r.facts, r.names).ok).toBe(false);
    expect(checkNote("USDC.dag doubled its snapshots.", r.facts, r.names)).toEqual({ ok: true });
  });
});

describe("trendFacts on a network", () => {
  it("yields only that network's measures, each ratio label naming it", () => {
    const r = trendFacts(input({ subject: "usdc" }))!;
    expect(r.facts.some((f) => /Dor|BioFi/.test(f.label))).toBe(false);
    expect(r.facts.some((f) => f.kind === "share")).toBe(false);
    const ratios = r.facts.filter((f) => f.kind === "ratio");
    expect(ratios.length).toBeGreaterThan(3);
    for (const f of ratios) expect(f.label.startsWith("USDC.dag ")).toBe(true);
    const snaps = ratios.find((f) => /snapshots anchored/.test(f.label))!;
    expect(snaps.value).toBeCloseTo(2, 9);
    expect(r.names).toEqual(["USDC.dag"]);
  });

  it("states a measure whose previous side is not measured, but no previous value or ratio for it", () => {
    const r = trendFacts(input({ subject: "usdc", prev: win(7, { ...week(1), "m.usdc.blocks": row(7, () => null) }, T0 - 7 * DAY) }))!;
    expect(r.facts.filter((f) => /blocks/.test(f.label)).map((f) => f.label)).toEqual(["USDC.dag blocks, per day, this span"]);
    expect(r.facts.some((f) => /snapshots anchored, ratio/.test(f.label))).toBe(true);
  });

  it("derives cadence as a duration weighted by the snapshots it was measured over", () => {
    const r = trendFacts(input({ subject: "usdc" }))!;
    const [c] = find(r, /cadence, between snapshots, this span/i, "duration");
    expect(c!.value).toBeCloseTo(12, 9);
    expect(c!.text).toBe("12s");
  });
});

describe("trendFacts honesty", () => {
  it("returns null when the payload has no covered bucket", () => {
    const empty = win(7, week(2, { "g.ticks": row(7, () => null) }));
    expect(trendFacts(input({ cur: empty }))).toBeNull();
    expect(trendFacts(input({ cur: win(0, {}) }))).toBeNull();
  });

  it("states no ratio for 'all', which has no previous span", () => {
    const r = trendFacts(input({ zoom: "all", prev: null }))!;
    expect(r.facts.some((f) => f.kind === "ratio")).toBe(false);
    expect(find(r, /^Snapshots anchored, per day, this span/)).toHaveLength(1);
    expect(r.facts.some((f) => /previous span/.test(f.label))).toBe(false);
  });

  it("does not divide by a previous value of 0", () => {
    const r = trendFacts(input({ prev: win(7, week(1, { "g.blocks": row(7, () => 0) }), T0 - 7 * DAY) }))!;
    expect(r.facts.some((f) => f.kind === "ratio" && /^Blocks/.test(f.label))).toBe(false);
    expect(r.facts.some((f) => /^Blocks, per day, previous span/.test(f.label))).toBe(true);
  });

  it("does not turn an unmeasured network into a zero", () => {
    const r = trendFacts(input({ cur: win(7, week(2, { "m.dor.snaps": row(7, () => null) })) }))!;
    expect(r.facts.some((f) => f.label.startsWith("Dor"))).toBe(false);
    expect(find(r, /^Networks that anchored/)[0]!.value).toBe(2);
  });
});

/** 30 days of lead-in then a 7-day span, all covered; `over` patches the daily rows. */
function daily(over: Record<string, (number | null)[]> = {}): TrendsWindowData {
  const n = 37;
  return win(
    n,
    {
      "g.ticks": row(n, () => 288),
      "g.anchors": row(n, () => 100),
      "m.usdc.snaps": row(n, () => 60),
      "m.bio.snaps": row(n, () => 30),
      "m.dor.snaps": row(n, () => 10),
      ...over,
    },
    T0 - 30 * DAY,
  );
}

describe("trendFacts notable days", () => {
  it("a 7d zoom with a spiked day yields one date fact and a matching NotableDay", () => {
    const spike = row(37, (i) => (i === 33 ? 400 : 100));
    const r = trendFacts(input({ daily: daily({ "g.anchors": spike }) }))!;
    expect(r.days).toHaveLength(1);
    expect(r.days[0]).toMatchObject({ kind: "high", networkId: null, value: 400, level: 100, dayMs: T0 + 3 * DAY });
    const dates = r.facts.filter((f) => f.kind === "date");
    expect(dates).toHaveLength(1);
    expect(dates[0]!.value).toBe(T0 + 3 * DAY);
    expect(dates[0]!.text).toBe("Sep 4");
    const value = r.facts.find((f) => /Notable day 1 spike, snapshots anchored that day/.test(f.label))!;
    expect(value.value).toBe(400);
    expect(r.facts.find((f) => /Notable day 1 spike, usual level/.test(f.label))!.value).toBe(100);
  });

  it("a note about the spike passes the gate", () => {
    const spike = row(37, (i) => (i === 33 ? 400 : 100));
    const r = trendFacts(input({ daily: daily({ "g.anchors": spike }) }))!;
    expect(checkNote("Snapshots anchored peaked at 400 on Sep 4, against a usual 100.", r.facts, r.names)).toEqual({ ok: true });
  });

  it("reports nothing from the lead-in", () => {
    const spike = row(37, (i) => (i === 20 ? 400 : 100));
    expect(trendFacts(input({ daily: daily({ "g.anchors": spike }) }))!.days).toEqual([]);
  });

  it("a network starting inside the span is a first, and the hypergraph carries its blurb", () => {
    const bio = row(37, (i) => (i < 34 ? 0 : 30));
    const r = trendFacts(input({ daily: daily({ "m.bio.snaps": bio }) }))!;
    expect(r.days.map((d) => [d.kind, d.networkId])).toEqual([["first", "bio"]]);
    expect(r.blurbs).toEqual(["BioFi is: a lending app"]);
    expect(r.facts.some((f) => f.kind === "date" && f.label.includes("BioFi"))).toBe(true);
    expect(factsBlock(r.facts, r.blurbs).split("\n").at(-1)).toBe("BioFi is: a lending app");
  });

  it("only the 7d, 30d, 1y and all zooms get notable days", () => {
    const spike = row(37, (i) => (i === 33 ? 400 : 100));
    for (const zoom of ["1h", "24h", "range"] as const) {
      const r = trendFacts(input({ zoom, daily: daily({ "g.anchors": spike }) }))!;
      expect(r.days).toEqual([]);
      expect(r.facts.some((f) => f.kind === "date")).toBe(false);
    }
    expect(trendFacts(input({ zoom: "30d", daily: daily({ "g.anchors": spike }) }))!.days).toHaveLength(1);
  });

  it("never reports the day still filling", () => {
    const d = daily({ "g.anchors": row(37, (i) => (i === 36 ? 5 : 100)) });
    d.now = d.buckets[36]! + 1000;
    expect(trendFacts(input({ daily: d }))!.days).toEqual([]);
  });

  it("a network pause is a duration pair", () => {
    const gap = row(37, (i) => (i === 33 ? 7200 : 30));
    const r = trendFacts(input({ subject: "usdc", daily: daily({ "m.usdc.gapMax": gap }) }))!;
    expect(r.days.map((d) => d.kind)).toEqual(["pause"]);
    const v = r.facts.find((f) => /Notable day 1 pause, longest wait between snapshots/.test(f.label))!;
    expect(v.kind).toBe("duration");
    expect(v.text).toBe("2h");
  });
});
