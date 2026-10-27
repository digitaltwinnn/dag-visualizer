import { describe, it, expect } from "vitest";
import { NOTABLE_CAPS, notableDays } from "@/src/data/notableDays";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1);

/** `n` consecutive UTC-midnight days, every one covered unless `uncovered` says otherwise. */
function span(n: number, uncovered: readonly number[] = []) {
  return {
    days: Array.from({ length: n }, (_, i) => T0 + i * DAY),
    covered: Array.from({ length: n }, (_, i): number | null => (uncovered.includes(i) ? null : 288)),
  };
}
const flat = (n: number, v: number, patch: Record<number, number | null> = {}): (number | null)[] =>
  Array.from({ length: n }, (_, i) => (i in patch ? patch[i]! : v));

describe("NOTABLE_CAPS", () => {
  it("states how many days each pill keeps", () => {
    expect(NOTABLE_CAPS).toEqual({ "7d": 3, "30d": 5, "1y": 8, all: 8 });
  });
});

describe("notableDays: high and low", () => {
  it("a 30-day flat 100 with day 20 at 250 yields exactly one high on day 20", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100, { 20: 250 }) }, subject: "dag", ids: [], cap: 5 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dayMs: days[20], kind: "high", networkId: null, value: 250, level: 100 });
    expect(out[0]!.score).toBeCloseTo(Math.log(2.5), 6);
  });

  it("a dip to 0.4x of the median or below is a low", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100, { 18: 30 }) }, subject: "dag", ids: [], cap: 5 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dayMs: days[18], kind: "low", value: 30, level: 100 });
  });

  it("an uncovered day reading 0 is an outage, not a low", () => {
    const { days, covered } = span(30, [20]);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100, { 20: 0 }) }, subject: "dag", ids: [], cap: 5 });
    expect(out).toEqual([]);
  });

  it("uncovered days do not count toward the median window", () => {
    // 14 covered days at 100 straddle an outage of zeros; the day after reads 100 — not a high.
    const { days, covered } = span(20, [5, 6, 7, 8]);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(20, 100, { 5: 0, 6: 0, 7: 0, 8: 0 }) }, subject: "dag", ids: [], cap: 5 });
    expect(out).toEqual([]);
  });

  it("needs at least 7 covered days before it", () => {
    const { days, covered } = span(8);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(8, 100, { 6: 300 }) }, subject: "dag", ids: [], cap: 5 });
    expect(out).toEqual([]);
    const enough = notableDays({ days, covered, series: { "g.anchors": flat(8, 100, { 7: 300 }) }, subject: "dag", ids: [], cap: 5 });
    expect(enough).toHaveLength(1);
  });

  it("a high value under 10 is noise however large the ratio", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 3, { 20: 9 }) }, subject: "dag", ids: [], cap: 5 });
    expect(out).toEqual([]);
  });

  it("a covered day with the field absent reads as a measured 0 (the read route's rule)", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100, { 20: null }) }, subject: "dag", ids: [], cap: 5 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dayMs: days[20], kind: "low", value: 0, level: 100 });
    expect(Number.isFinite(out[0]!.score)).toBe(true);
  });

  it("12 candidate highs with cap 5 yield the 5 best, sorted by score", () => {
    const n = 100;
    const { days, covered } = span(n);
    const patch: Record<number, number> = {};
    for (let k = 0; k < 12; k++) patch[20 + k * 6] = 210 + k * 10; // isolated, so each sees a median of 100
    const out = notableDays({ days, covered, series: { "g.anchors": flat(n, 100, patch) }, subject: "dag", ids: [], cap: 5 });
    expect(out).toHaveLength(5);
    expect(out.map((d) => d.kind)).toEqual(Array(5).fill("high"));
    const scores = out.map((d) => d.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(out.map((d) => d.value)).toEqual([320, 310, 300, 290, 280]);
  });

  it("a network subject reads its own snaps, not the total", () => {
    const { days, covered } = span(30);
    const series = { "g.anchors": flat(30, 100), "m.a.snaps": flat(30, 50, { 15: 200 }) };
    const out = notableDays({ days, covered, series, subject: "a", ids: ["a"], cap: 5 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dayMs: days[15], kind: "high", networkId: "a", value: 200, level: 50 });
  });
});

describe("notableDays: first and last", () => {
  const active = (from: number, to: number, n = 30) =>
    Array.from({ length: n }, (_, i) => (i >= from && i <= to ? 40 : 0));

  it("a network at 0 for days 0-9, then active, has its first on day 10", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100), "m.a.snaps": active(10, 29) }, subject: "dag", ids: ["a"], cap: 5 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dayMs: days[10], kind: "first", networkId: "a", value: 40, level: 0, score: Infinity });
  });

  it("the same network active from day 0 has no first", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100), "m.a.snaps": active(0, 29) }, subject: "dag", ids: ["a"], cap: 5 });
    expect(out).toEqual([]);
  });

  it("fewer than 3 quiet covered days before the first is not a beginning", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100), "m.a.snaps": active(2, 29) }, subject: "dag", ids: ["a"], cap: 5 });
    expect(out).toEqual([]);
  });

  it("uncovered days before the first do not count as quiet", () => {
    const { days, covered } = span(30, [0, 1, 2, 3, 4]);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100), "m.a.snaps": active(6, 29) }, subject: "dag", ids: ["a"], cap: 5 });
    expect(out).toEqual([]);
  });

  it("activity ending on day 25 of 30 has its last on day 25", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100), "m.a.snaps": active(0, 25) }, subject: "dag", ids: ["a"], cap: 5 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dayMs: days[25], kind: "last", networkId: "a", value: 40, level: 0, score: Infinity });
  });

  it("activity ending on day 28 of 30 (too few quiet days) yields nothing", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100), "m.a.snaps": active(0, 27) }, subject: "dag", ids: ["a"], cap: 5 });
    expect(out).toEqual([]);
  });

  it("a network with no activity at all has neither", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100), "m.a.snaps": active(0, -1) }, subject: "dag", ids: ["a"], cap: 5 });
    expect(out).toEqual([]);
  });

  it("a network that has no snaps row in the payload yields nothing", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100) }, subject: "dag", ids: ["ghost"], cap: 5 });
    expect(out).toEqual([]);
  });

  it("first and last outrank highs when the cap bites", () => {
    const { days, covered } = span(30);
    const series = { "g.anchors": flat(30, 100, { 20: 900 }), "m.a.snaps": active(10, 29), "m.b.snaps": active(0, 20) };
    const out = notableDays({ days, covered, series, subject: "dag", ids: ["a", "b"], cap: 2 });
    // both score +Infinity, so the tie keeps the earlier day first: a begins on day 10, b ends on day 20
    expect(out.map((d) => [d.kind, d.networkId])).toEqual([["first", "a"], ["last", "b"]]);
  });
});

describe("notableDays: whose days", () => {
  it("a network subject carries its own first/last/high/low/pause, and the DAG's total is left out", () => {
    const { days, covered } = span(40);
    const snaps: number[] = Array.from({ length: 40 }, (_, i) => (i < 3 ? 0 : 50));
    snaps[25] = 400;
    const series = { "g.anchors": flat(40, 100, { 30: 900 }), "m.a.snaps": snaps };
    const out = notableDays({ days, covered, series, subject: "a", ids: ["a", "b"], cap: 9 });
    expect(out.map((d) => d.kind).sort()).toEqual(["first", "high"]);
    expect(out.every((d) => d.networkId === "a")).toBe(true);
  });

  it("the DAG subject carries the total's high/low with a null network, not any network's high", () => {
    const { days, covered } = span(30);
    const series = { "g.anchors": flat(30, 100, { 20: 250 }), "m.a.snaps": flat(30, 50, { 15: 400 }) };
    const out = notableDays({ days, covered, series, subject: "dag", ids: ["a"], cap: 9 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "high", networkId: null, dayMs: days[20] });
  });
});

describe("notableDays: pause", () => {
  it("a day whose widest gap is 6x the network's median and over an hour is a pause", () => {
    const { days, covered } = span(30);
    const series = { "m.a.snaps": flat(30, 40), "m.a.gapMax": flat(30, 900, { 12: 7200 }) };
    const out = notableDays({ days, covered, series, subject: "a", ids: ["a"], cap: 5 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dayMs: days[12], kind: "pause", networkId: "a", value: 7200, level: 900 });
  });

  it("6x the median but under an hour is not a pause", () => {
    const { days, covered } = span(30);
    const series = { "m.a.snaps": flat(30, 40), "m.a.gapMax": flat(30, 300, { 12: 3000 }) };
    expect(notableDays({ days, covered, series, subject: "a", ids: ["a"], cap: 5 })).toEqual([]);
  });

  it("over an hour but under 6x the median is not a pause", () => {
    const { days, covered } = span(30);
    const series = { "m.a.snaps": flat(30, 40), "m.a.gapMax": flat(30, 2000, { 12: 5000 }) };
    expect(notableDays({ days, covered, series, subject: "a", ids: ["a"], cap: 5 })).toEqual([]);
  });

  it("an uncovered day never pauses, and zero (no snapshots, no gap) does not drag the median to 0", () => {
    const { days, covered } = span(30, [12]);
    const gap = flat(30, 0, { 12: 99999, 3: 600, 4: 600, 5: 600 });
    const series = { "m.a.snaps": flat(30, 40), "m.a.gapMax": gap };
    expect(notableDays({ days, covered, series, subject: "a", ids: ["a"], cap: 5 })).toEqual([]);
  });

  it("the DAG subject does not list per-network pauses", () => {
    const { days, covered } = span(30);
    const series = { "g.anchors": flat(30, 100), "m.a.snaps": flat(30, 40), "m.a.gapMax": flat(30, 900, { 12: 7200 }) };
    expect(notableDays({ days, covered, series, subject: "dag", ids: ["a"], cap: 5 })).toEqual([]);
  });
});

describe("notableDays: determinism", () => {
  it("the same input twice yields deep-equal output", () => {
    const { days, covered } = span(60);
    const series = {
      "g.anchors": flat(60, 100, { 20: 250, 40: 20 }),
      "m.a.snaps": Array.from({ length: 60 }, (_, i) => (i >= 10 && i <= 45 ? 30 : 0)),
      "m.a.gapMax": flat(60, 800, { 30: 9000 }),
    };
    const input = { days, covered, series, subject: "dag", ids: ["a"], cap: 8 };
    expect(notableDays(input)).toEqual(notableDays(input));
  });

  it("does not mutate its input", () => {
    const { days, covered } = span(30);
    const anchors = flat(30, 100, { 20: 250 });
    const copy = anchors.slice();
    notableDays({ days, covered, series: { "g.anchors": anchors }, subject: "dag", ids: [], cap: 5 });
    expect(anchors).toEqual(copy);
  });
});
