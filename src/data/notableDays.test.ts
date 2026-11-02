import { describe, it, expect } from "vitest";
import type { NotableKind } from "@/src/data/noteTypes";
import { NOTABLE_CAPS, NOTABLE_FLOOR, isPause, notableDays, rangeExtremes, withDayChange } from "@/src/data/notableDays";

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
    expect(NOTABLE_CAPS).toEqual({ "7d": 3, "30d": 5, "90d": 6, "1y": 10, all: 10 });
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

// THE WHOLE NETWORK'S SECOND MEASURE (user, 2026-11-01): the total anchored barely moves, so a year
// found one day, while the network stalled for hours twice and tripled its global snapshots.
describe("notableDays: the whole network's global snapshots", () => {
  const ticks = (patch: Record<number, number>) => flat(30, 5000, patch);
  const run = (series: Record<string, (number | null)[]>, subject = "dag") => {
    const { days } = span(30);
    return { days, out: notableDays({ days, covered: series["g.ticks"]!, series, subject, ids: [], cap: 5 }) };
  };

  it("a spike or dip in them is a notable day that says whose measure it is", () => {
    const { days, out } = run({ "g.ticks": ticks({ 20: 1000 }), "g.anchors": flat(30, 40000) });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dayMs: days[20], kind: "low", networkId: null, measure: "globals", value: 1000, level: 5000 });
  });

  it("a day of the total anchored carries no such word", () => {
    const { out } = run({ "g.ticks": ticks({}), "g.anchors": flat(30, 40000, { 20: 1000 }) });
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty("measure");
  });

  it("is one day when both measures moved on it, the total's", () => {
    const { days, out } = run({ "g.ticks": ticks({ 20: 1000 }), "g.anchors": flat(30, 40000, { 20: 1000 }) });
    expect(out.filter((d) => d.dayMs === days[20])).toHaveLength(1);
    expect(out[0]).not.toHaveProperty("measure");
  });

  it("is the whole network's alone: a network reads its own snapshots", () => {
    const { out } = run({ "g.ticks": ticks({ 20: 1000 }), "m.usdc.snaps": flat(30, 100) }, "usdc");
    expect(out.filter((d) => d.kind === "high" || d.kind === "low")).toEqual([]);
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

describe("notableDays: a series' own level", () => {
  const steady = (n: number, from: number, to: number) => Array.from({ length: n }, (_, i): number => (i >= from && i <= to ? 50 : 0));

  it("a network waking mid-window with steady activity yields its first and no high", () => {
    for (const [n, wake] of [[30, 10], [60, 30]] as const) {
      const { days, covered } = span(n);
      const out = notableDays({ days, covered, series: { "m.a.snaps": steady(n, wake, n - 1) }, subject: "a", ids: ["a"], cap: 9 });
      expect(out.map((d) => [d.kind, d.dayMs])).toEqual([["first", days[wake]]]);
    }
  });

  it("a network that stops yields its last and no lows after it", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "m.a.snaps": steady(30, 0, 19) }, subject: "a", ids: ["a"], cap: 9 });
    expect(out.map((d) => [d.kind, d.dayMs])).toEqual([["last", days[19]]]);
  });

  it("a dip while the network is still running is still a low", () => {
    const { days, covered } = span(30);
    const snaps = steady(30, 0, 29);
    snaps[20] = 5;
    const out = notableDays({ days, covered, series: { "m.a.snaps": snaps }, subject: "a", ids: ["a"], cap: 9 });
    expect(out.map((d) => d.kind)).toEqual(["low"]);
  });
});

// ONE DAY, ONE EVENT (live 2026-10-30: the unlisted set's Aug 15 was listed twice, its last day and
// a dip): a network's last day is usually thin, and that thinness is the ending, not a second story.
describe("notableDays: a first or last day swallows its own high or low", () => {
  it("a last day that also reads as a dip is the last day alone", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, subject: "a", ids: ["a"], cap: 5, series: { "m.a.snaps": flat(30, 100, { 20: 10, 21: 0, 22: 0, 23: 0, 24: 0, 25: 0, 26: 0, 27: 0, 28: 0, 29: 0 }) } });
    expect(out.map((d) => [d.kind, d.dayMs])).toEqual([["last", days[20]]]);
  });
  it("another network's event on that day stands", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, subject: "dag", ids: ["a"], cap: 5, series: { "g.anchors": flat(30, 100, { 20: 10 }), "m.a.snaps": flat(30, 100, { 21: 0, 22: 0, 23: 0, 24: 0, 25: 0, 26: 0, 27: 0, 28: 0, 29: 0 }) } });
    expect(out.map((d) => [d.kind, d.networkId])).toEqual([["last", "a"], ["low", null]]);
  });
});

describe("notableDays: lead-in (from)", () => {
  it("a spike on day 34 against a flat lead-in is a high that a 7-day window alone could never see", () => {
    const { days, covered } = span(37);
    const series = { "g.anchors": flat(37, 100, { 34: 250 }) };
    const out = notableDays({ days, covered, series, subject: "dag", ids: [], cap: 5, from: 30 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dayMs: days[34], kind: "high", value: 250, level: 100 });
    const alone = notableDays({ days: days.slice(30), covered: covered.slice(30), series: { "g.anchors": flat(7, 100, { 4: 250 }) }, subject: "dag", ids: [], cap: 5 });
    expect(alone).toEqual([]);
  });

  it("a network active in the lead-in, quiet at the window's start and then active again resumed: no first", () => {
    const { days, covered } = span(40);
    const snaps = Array.from({ length: 40 }, (_, i) => (i < 10 || i >= 34 ? 40 : 0)); // quiet 10..33
    const out = notableDays({ days, covered, series: { "g.anchors": flat(40, 100), "m.a.snaps": snaps }, subject: "dag", ids: ["a"], cap: 5, from: 30 });
    expect(out).toEqual([]);
  });

  it("a network whose first activity is inside the reportable window still begins there", () => {
    const { days, covered } = span(40);
    const snaps = Array.from({ length: 40 }, (_, i) => (i >= 35 ? 40 : 0));
    const out = notableDays({ days, covered, series: { "g.anchors": flat(40, 100), "m.a.snaps": snaps }, subject: "dag", ids: ["a"], cap: 5, from: 30 });
    expect(out.map((d) => [d.kind, d.dayMs])).toEqual([["first", days[35]]]);
  });

  it("a last in the lead-in is not reported", () => {
    const { days, covered } = span(40);
    const snaps = Array.from({ length: 40 }, (_, i) => (i <= 20 ? 40 : 0));
    const out = notableDays({ days, covered, series: { "g.anchors": flat(40, 100), "m.a.snaps": snaps }, subject: "dag", ids: ["a"], cap: 5, from: 30 });
    expect(out).toEqual([]);
  });

  it("nothing is ever reported for a day before from, and the lead-in still feeds the pause median", () => {
    const { days, covered } = span(60);
    const series = {
      "g.anchors": flat(60, 100, { 12: 400, 20: 5, 45: 300 }),
      "m.a.snaps": Array.from({ length: 60 }, (_, i) => (i >= 10 && i <= 40 ? 30 : 0)),
      "m.a.gapMax": flat(60, 800, { 15: 9000, 50: 9000 }),
    };
    for (const subject of ["dag", "a"]) {
      const out = notableDays({ days, covered, series, subject, ids: ["a"], cap: 99, from: 30 });
      expect(out.length).toBeGreaterThan(0);
      expect(out.every((d) => d.dayMs >= days[30]!)).toBe(true);
    }
    const pause = notableDays({ days, covered, series, subject: "a", ids: ["a"], cap: 99, from: 30 }).filter((d) => d.kind === "pause");
    expect(pause.map((d) => d.dayMs)).toEqual([days[50]]);
  });
});

describe("notableDays: whose days", () => {
  it("a network subject carries its own first/last/high/low/pause, and the DAG's total is left out", () => {
    const { days, covered } = span(40);
    const snaps: number[] = Array.from({ length: 40 }, (_, i) => (i < 5 ? 0 : 50));
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

describe("notableDays: a pause then a resume (series break)", () => {
  // 50 a day, 0 on days 15–26, 50 again from day 27: the reviewer's probe.
  const N = 40;
  const pauseResume = () => Array.from({ length: N }, (_, i): number => (i >= 15 && i <= 26 ? 0 : 50));

  it("the stop is ONE low (its first day), not a run of eight", () => {
    const { days, covered } = span(N);
    const out = notableDays({ days, covered, series: { "m.a.snaps": pauseResume() }, subject: "a", ids: ["a"], cap: 9 });
    const lows = out.filter((d) => d.kind === "low");
    expect(lows.map((d) => d.dayMs)).toEqual([days[15]]);
  });

  it("after the resume the level is read from the resumed days only: no false high", () => {
    const { days, covered } = span(N);
    const out = notableDays({ days, covered, series: { "m.a.snaps": pauseResume() }, subject: "a", ids: ["a"], cap: 9 });
    expect(out.filter((d) => d.kind === "high")).toEqual([]);
  });

  it("the resumed level needs its own 7 covered days: a spike on the 7th day after is not judged, the 8th is", () => {
    const { days, covered } = span(N);
    const early = pauseResume();
    early[33] = 200; // 27..32 is six days of history
    expect(notableDays({ days, covered, series: { "m.a.snaps": early }, subject: "a", ids: ["a"], cap: 9 }).filter((d) => d.kind === "high")).toEqual([]);
    const late = pauseResume();
    late[34] = 200; // 27..33 is seven
    const highs = notableDays({ days, covered, series: { "m.a.snaps": late }, subject: "a", ids: ["a"], cap: 9 }).filter((d) => d.kind === "high");
    expect(highs).toEqual([expect.objectContaining({ dayMs: days[34], value: 200, level: 50 })]);
  });

  it("with the 30D cap of 5, one pause fills one slot, not all five", () => {
    const { days, covered } = span(N);
    const out = notableDays({ days, covered, series: { "m.a.snaps": pauseResume() }, subject: "a", ids: ["a"], cap: 5 });
    expect(out.length).toBeLessThanOrEqual(1);
  });

  it("a zero run shorter than the quiet days is no break: each low still dedups to its strongest", () => {
    const { days, covered } = span(30);
    const snaps = flat(30, 100, { 20: 10, 21: 5 }) as number[];
    const out = notableDays({ days, covered, series: { "m.a.snaps": snaps }, subject: "a", ids: ["a"], cap: 9 });
    expect(out.map((d) => [d.kind, d.dayMs, d.value])).toEqual([["low", days[21], 5]]);
  });
});

describe("notableDays: consecutive days of one kind are one event", () => {
  it("a three-day spike keeps its strongest day", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100, { 20: 250, 21: 400, 22: 300 }) }, subject: "dag", ids: [], cap: 5 });
    expect(out.map((d) => [d.kind, d.dayMs, d.value])).toEqual([["high", days[21], 400]]);
  });

  it("an uncovered day inside the run does not split it", () => {
    const { days, covered } = span(30, [21]);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100, { 20: 250, 22: 300 }) }, subject: "dag", ids: [], cap: 5 });
    expect(out.map((d) => [d.kind, d.dayMs])).toEqual([["high", days[22]]]);
  });

  it("an ordinary day between two spikes keeps both", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100, { 20: 250, 22: 300 }) }, subject: "dag", ids: [], cap: 5 });
    expect(out.map((d) => d.dayMs).sort()).toEqual([days[20], days[22]]);
  });

  it("consecutive pause days keep the widest", () => {
    const { days, covered } = span(30);
    const series = { "m.a.snaps": flat(30, 40), "m.a.gapMax": flat(30, 900, { 12: 7200, 13: 9000 }) };
    const out = notableDays({ days, covered, series, subject: "a", ids: ["a"], cap: 5 });
    expect(out.map((d) => [d.kind, d.dayMs, d.value])).toEqual([["pause", days[13], 9000]]);
  });
});

// THE FLOOR (user, 2026-10-30: "So far I've not seen more than 1 notable day, can we have at least
// 3? If nothing really notable changed, call out the highs/lows of the network during that range").
// A range short of `floor` days is filled with the range's own EXTREMES, named as such, never as a
// spike or a dip: the busiest and quietest day, then the longest wait (a network) or the day the
// most networks anchored (the hypergraph). Fills never displace a real pick and never repeat a day.
describe("rangeExtremes", () => {
  it("is the range's busiest and quietest day, whatever events it holds", () => {
    const { days, covered } = span(30);
    const out = rangeExtremes({ days, covered, subject: "a", ids: ["a"], cap: 0, series: { "m.a.snaps": flat(30, 100, { 10: 130, 20: 80 }) } });
    expect(out.map((d) => [d.kind, d.dayMs, d.value, d.level])).toEqual([["peak", days[10], 130, 100], ["trough", days[20], 80, 100]]);
  });
});

describe("notableDays: the floor", () => {
  it("is three", () => {
    expect(NOTABLE_FLOOR).toBe(3);
  });

  it("a network with nothing notable gets its busiest, quietest and longest-wait day, in that order", () => {
    const { days, covered } = span(30);
    const out = notableDays({
      days, covered, subject: "a", ids: ["a"], cap: 5, floor: 3,
      series: { "m.a.snaps": flat(30, 100, { 10: 130, 20: 80 }), "m.a.gapMax": flat(30, 600, { 15: 900 }) },
    });
    expect(out.map((d) => [d.kind, d.dayMs, d.value, d.level, d.networkId, d.score])).toEqual([
      ["peak", days[10], 130, 100, "a", 0],
      ["trough", days[20], 80, 100, "a", 0],
      ["longest", days[15], 900, 600, "a", 0],
    ]);
  });

  it("the hypergraph gets the total's busiest and quietest day and the day the most networks anchored", () => {
    const { days, covered } = span(30);
    const out = notableDays({
      days, covered, subject: "dag", ids: ["a", "b"], cap: 5, floor: 3,
      series: { "g.anchors": flat(30, 100, { 5: 120, 7: 90 }), "m.a.snaps": flat(30, 10), "m.b.snaps": flat(30, 0, { 0: 10, 12: 10, 29: 10 }) },
    });
    expect(out.map((d) => [d.kind, d.dayMs, d.value, d.level, d.networkId])).toEqual([
      ["peak", days[5], 120, 100, null],
      ["trough", days[7], 90, 100, null],
      ["broadest", days[0], 2, 1, null],
    ]);
  });

  it("a day that reads the usual level is no extreme, however the rest of the range moved", () => {
    const { days, covered } = span(30);
    // Live 2026-10-31: "5 networks anchoring, usually 5": one network missed a day, so the readings
    // differed, and every other day was the "broadest".
    const out = rangeExtremes({
      days, covered, subject: "dag", ids: ["a", "b"], cap: 0,
      series: { "g.anchors": flat(30, 100, { 5: 120 }), "m.a.snaps": flat(30, 10), "m.b.snaps": flat(30, 10, { 12: 0 }) },
    });
    expect(out.map((d) => d.kind)).toEqual(["peak"]);
  });

  it("judges the usual level as the caption will read it: rounded", () => {
    const { days, covered } = span(4);
    // Two days of each: the median is 1.5, which a caption states as 2, so 2 is not above usual.
    const out = rangeExtremes({
      days, covered, subject: "dag", ids: ["a", "b"], cap: 0,
      series: { "g.anchors": flat(4, 100), "m.a.snaps": flat(4, 10), "m.b.snaps": flat(4, 0, { 2: 10, 3: 10 }) },
    });
    expect(out).toEqual([]);
  });

  it("fills only up to the floor, never past the cap, and never repeats a picked day", () => {
    const { days, covered } = span(30);
    const series = { "g.anchors": flat(30, 100, { 20: 250 }) };
    const out = notableDays({ days, covered, series, subject: "dag", ids: [], cap: 5, floor: 3 });
    // The high IS the busiest day, so the peak is skipped; every other day reads the usual 100.
    expect(out.map((d) => [d.kind, d.dayMs])).toEqual([["high", days[20]]]);
    expect(notableDays({ days, covered, series, subject: "dag", ids: [], cap: 1, floor: 3 }).map((d) => d.kind)).toEqual(["high"]);
    expect(notableDays({ days, covered, series, subject: "dag", ids: [], cap: 5 }).map((d) => d.kind)).toEqual(["high"]); // no floor asked
  });

  it("a range whose days all read the same has no busiest or quietest day", () => {
    const { days, covered } = span(30);
    expect(notableDays({ days, covered, series: { "g.anchors": flat(30, 100) }, subject: "dag", ids: [], cap: 5, floor: 3 })).toEqual([]);
  });

  it("an uncovered day is never an extreme, and the lead-in is never reported", () => {
    const { days, covered } = span(30, [3]);
    const out = notableDays({ days, covered, series: { "g.anchors": flat(30, 100, { 3: 500, 1: 140 }) }, subject: "dag", ids: [], cap: 5, floor: 3, from: 2 });
    expect(out.map((d) => [d.kind, d.dayMs])).toEqual([]); // days 2..29 all read 100: day 3 is unmeasured, day 1 is lead-in
  });

  it("a network's extremes are read inside its own activity: the quiet tail after its last day is no trough", () => {
    const { days, covered } = span(30);
    const out = notableDays({ days, covered, subject: "a", ids: ["a"], cap: 5, floor: 3, series: { "m.a.snaps": flat(30, 100, { 10: 130, 25: 0, 26: 0, 27: 0, 28: 0, 29: 0 }) } });
    expect(out.map((d) => [d.kind, d.dayMs])).toEqual([["last", days[24]], ["peak", days[10]]]);
  });
});

// HOW FAR OFF USUAL (user, 2026-10-31: "can you mention the increase / decrease in percentage also?").
// Code adds it to the caption, so the figure is measured and the model cannot get it wrong.
describe("withDayChange", () => {
  const day = (kind: NotableKind, value: number, level: number) => ({ kind, value, level });
  it("adds how far a day stood above or below usual", () => {
    expect(withDayChange("53,959 snapshots anchored, usually 49,669", day("peak", 53959, 49669))).toBe("53,959 snapshots anchored, usually 49,669, up 9%");
    expect(withDayChange("43,888 snapshots anchored, usually 49,669", day("low", 43888, 49669))).toBe("43,888 snapshots anchored, usually 49,669, down 12%");
  });
  it("takes a caption's closing full stop", () => {
    expect(withDayChange("400 snapshots, usually 100.", day("high", 400, 100))).toBe("400 snapshots, usually 100, up 300%");
  });
  it("only counts have a percentage", () => {
    for (const kind of ["first", "last", "pause", "longest", "broadest"] as const) expect(withDayChange("x", day(kind, 9, 3))).toBe("x");
  });
  it("says nothing when it rounds to no change, or there is no usual", () => {
    expect(withDayChange("x", day("peak", 1002, 1000))).toBe("x");
    expect(withDayChange("x", day("peak", 5, 0))).toBe("x");
  });
  it("never doubles a percentage the caption already states", () => {
    expect(withDayChange("up 9% on usual", day("peak", 109, 100))).toBe("up 9% on usual");
  });
});

// EVERY MEASURE GETS ITS OWN ANOMALIES (user, 2026-11-02: "check also cadence, size, fees, etc"). A
// day's cadence is its snapshot count inverted, so a spike or dip there is already the count's; a gap
// is the pause, and the rest are their own rows.
describe("the measures beyond the snapshot count", () => {
  const D = 86_400_000;
  const days = Array.from({ length: 30 }, (_, i) => 1_700_000_000_000 - (1_700_000_000_000 % D) + i * D);
  const covered = days.map(() => 100);
  const base = (over: Record<string, (number | null)[]>) => ({ days, covered, ids: ["dor"], cap: 5, from: 0, series: over });
  const flat = (v: number) => days.map(() => v);
  const at = (v: number, i: number, odd: number) => days.map((_, k) => (k === i ? odd : v));

  it("the whole network pauses too", () => {
    const r = notableDays({ ...base({ "g.anchors": flat(50), "g.ticks": flat(50), "g.gapMax": at(60, 20, 8000) }), subject: "dag" });
    expect(r).toMatchObject([{ dayMs: days[20], kind: "pause", networkId: null, value: 8000, level: 60 }]);
  });

  it("leaves blocks to the charts: a normal day swings them twofold, which filled every slot live", () => {
    expect(notableDays({ ...base({ "m.dor.snaps": flat(50), "m.dor.blocks": at(100, 20, 500) }), subject: "dor" })).toEqual([]);
  });

  it("reads a network's fees and data", () => {
    const row = (key: string, normal: number, odd: number) => ({ "m.dor.snaps": flat(50), [key]: at(normal, 20, odd) });
    expect(notableDays({ ...base(row("m.dor.fee", 5e8, 40e8)), subject: "dor" })).toMatchObject([{ dayMs: days[20], kind: "high", measure: "fees" }]);
    expect(notableDays({ ...base(row("m.dor.kb", 20_000, 2_000)), subject: "dor" })).toMatchObject([{ dayMs: days[20], kind: "low", measure: "kb" }]);
  });

  it("reads the whole network's from its stored floors", () => {
    const r = notableDays({ ...base({ "g.anchors": flat(50), "g.ticks": flat(50), "g.feeFloor": at(5e8, 20, 40e8) }), subject: "dag" });
    expect(r).toMatchObject([{ kind: "high", measure: "fees", networkId: null }]);
  });

  it("calls nothing notable under a measure's own floor", () => {
    expect(notableDays({ ...base({ "m.dor.snaps": flat(50), "m.dor.fee": at(1e6, 20, 40e6) }), subject: "dor" })).toEqual([]);
    expect(notableDays({ ...base({ "m.dor.snaps": flat(50), "m.dor.kb": at(100, 20, 10) }), subject: "dor" })).toEqual([]);
  });

  it("tells one day once, the snapshot count first", () => {
    const r = notableDays({ ...base({ "m.dor.snaps": at(50, 20, 200), "m.dor.fee": at(5e8, 20, 40e8), "m.dor.kb": at(20_000, 20, 90_000) }), subject: "dor" });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "high", value: 200 });
    expect(r[0]!.measure).toBeUndefined();
  });
});

describe("isPause", () => {
  it("needs both an hour and six times the usual widest gap", () => {
    expect(isPause(3600, 600)).toBe(true);
    expect(isPause(3599, 60)).toBe(false);
    expect(isPause(3600, 601)).toBe(false);
  });
});
