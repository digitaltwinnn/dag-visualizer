import { describe, it, expect } from "vitest";
import { PRIOR_DAYS, PRIOR_MIN_DAYS, WEEK_DAYS, WEEK_MIN_DAYS, activityFacts, lastWeekMean, priorWeeksMean, weekStart } from "@/src/data/noteFactsActivity";
import { pairsOf } from "@/src/data/testkit/notePairs";

const row = (n: number, f: (i: number) => number | null): (number | null)[] => Array.from({ length: n }, (_, i) => f(i));
const L = "USDC.dag global snapshots it was part of per day";

describe("the common activity facts: last week against the weeks before", () => {
  it("reads the last week from the series' tail and the weeks before from the three weeks ahead of it", () => {
    expect(WEEK_DAYS).toBe(7);
    expect(PRIOR_DAYS).toBe(21);
    expect(weekStart(60)).toBe(53);
    expect(weekStart(5)).toBe(0);
    const pts = row(60, (i) => (i >= 53 ? 60 : i >= 32 ? 40 : 1000));
    expect(lastWeekMean(pts)).toBe(60);
    expect(priorWeeksMean(pts)).toBe(40); // days 32..52, never the 1000s before them
  });

  it("states the pair and their ratio when they differ", () => {
    const r = activityFacts(L, row(60, (i) => (i >= 53 ? 60 : 40)));
    expect(r.map((f) => [f.label, f.value])).toEqual([
      [`${L}, last week`, 60],
      [`${L}, the weeks before`, 40],
      [`${L}, ratio last week to the weeks before`, 1.5],
    ]);
    expect(pairsOf(r).get(L)).toEqual([`${L}, the weeks before`, 40, `${L}, last week`, 60]);
  });

  it("states no ratio when the two are equal, and none when either is 0", () => {
    expect(activityFacts(L, row(60, () => 50)).map((f) => f.kind)).toEqual(["count", "count"]);
    expect(activityFacts(L, row(60, (i) => (i >= 53 ? 5 : 0))).filter((f) => f.kind === "ratio")).toEqual([]);
  });

  it("needs four measured days for the last week, else nothing at all", () => {
    expect(WEEK_MIN_DAYS).toBe(4);
    expect(activityFacts(L, row(60, (i) => (i >= 57 ? 60 : 40)))).toHaveLength(3);
    expect(activityFacts(L, row(60, (i) => (i >= 58 ? 60 : i >= 53 ? null : 40)))).toEqual([]);
  });

  it("needs seven measured days for the weeks before, else the last week stands alone and unpaired", () => {
    expect(PRIOR_MIN_DAYS).toBe(7);
    const r = activityFacts(L, row(60, (i) => (i >= 53 ? 60 : i >= 47 ? 40 : null)));
    expect(r.map((f) => f.label)).toEqual([`${L}, last week`]);
    expect(r[0]!.pair).toBeUndefined();
  });
});
