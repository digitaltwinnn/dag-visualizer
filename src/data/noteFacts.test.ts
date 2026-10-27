import { describe, it, expect } from "vitest";
import { fact, factsBlock, gaugeChange, heldLevel, networksAnchored, observedLevel } from "@/src/data/noteFacts";
import { checkNote } from "@/src/data/noteHonesty";
import { formatDag } from "@/src/data/trendSeries";

describe("fact", () => {
  it("writes each kind in the app's notation", () => {
    expect(fact("x", 12159, "count").text).toBe("12,159");
    expect(fact("x", 0.583, "share").text).toBe("58%");
    expect(fact("x", 2.4817, "ratio").text).toBe("2.48");
    expect(fact("x", 79200, "duration").text).toBe("22h");
    expect(fact("x", Date.UTC(2026, 9, 19), "date").text).toBe("Oct 19");
    expect(fact("x", 1234.56, "amount").text).toBe("1,234.6");
  });

  it("keeps the label, kind and the unrounded value", () => {
    expect(fact("Blocks", 12159.4, "count")).toEqual({ label: "Blocks", value: 12159.4, kind: "count", text: "12,159" });
  });

  it("rounds a large average whole but never writes a small non-zero one as 0", () => {
    expect(fact("x", 1234.6, "count").text).toBe("1,235");
    expect(fact("x", 0.4, "count").text).toBe("0.4");
    expect(fact("x", 0, "count").text).toBe("0");
  });

  it("writes a value under 1 to two significant digits, never as 0 (counts and amounts alike)", () => {
    expect(fact("x", 0.04, "count").text).toBe("0.04");
    expect(fact("x", 0.034, "count").text).toBe("0.034");
    expect(fact("x", 0.0342, "amount").text).toBe("0.034");
    expect(fact("x", 0.04, "amount").text).toBe("0.04");
    expect(fact("x", 0.5, "amount").text).toBe("0.5");
  });

  it("takes an amount's notation from a formatter when handed one (a fee reads as the chart's)", () => {
    for (const v of [0.034, 0.43, 12.4, 4321]) expect(fact("Fees", v, "amount", formatDag).text).toBe(formatDag(v));
  });

  it("the gate does not accept a written zero for a quiet network's 0.03 a day", () => {
    const facts = [fact("X snapshots anchored, per day, this span", 0.03, "count")];
    expect(checkNote("X anchored 0 snapshots a day.", facts, ["X"]).ok).toBe(false);
    expect(checkNote("X anchored 0.03 snapshots a day.", facts, ["X"])).toEqual({ ok: true });
  });

  it("reads a date in UTC, whatever the zone", () => {
    expect(fact("x", Date.UTC(2026, 0, 1, 23, 59), "date").text).toBe("Jan 1");
  });
});

const flat = (n: number, v: number, patch: Record<number, number | null> = {}): (number | null)[] =>
  Array.from({ length: n }, (_, i) => (i in patch ? patch[i]! : v));

describe("observedLevel (R52)", () => {
  it("is the median when the count is odd, and on an even count the MORE RECENT of the two middle readings (R55)", () => {
    expect(observedLevel([8, 8, 8, 9, 9, 9])).toBe(9);
    expect(observedLevel([9, 8, 9, 8, 9, 8])).toBe(8);
    expect(observedLevel([17, 18])).toBe(18);
    expect(observedLevel([18, 17])).toBe(17);
    expect(observedLevel([5, 1, 3])).toBe(3);
    expect(observedLevel([4])).toBe(4);
  });

  it("reads a network that has just come up at its new level, and one that just went down at 0 (R55)", () => {
    expect(observedLevel([0, 0, 0, 5, 5, 5])).toBe(5);
    expect(observedLevel([5, 5, 5, 0, 0, 0])).toBe(0);
  });

  it("is always a sample the sampler made, never a mean of two", () => {
    for (const xs of [[8, 8, 8, 9, 9, 9], [0, 0, 0, 5, 5, 5], [17, 18], [1, 2, 3, 4]]) expect(xs).toContain(observedLevel(xs));
  });
});

describe("heldLevel", () => {
  it("holds a node count whole: six samples 8, 8, 8, 9, 9, 9 read 9 (the more recent middle), never 8.5", () => {
    expect(heldLevel([8, 8, 8, 9, 9, 9])).toBe(9);
    expect(heldLevel([0, 0, 0, 5, 5, 5])).toBe(5);
  });

  it("is the median of the last six measured samples: one bad final hour does not move it", () => {
    expect(heldLevel(flat(30, 177, { 29: 0 }))).toBe(177);
    expect(heldLevel(flat(30, 177, { 29: 90 }))).toBe(177);
    expect(heldLevel(flat(30, 177, { 28: null, 29: null }))).toBe(177);
  });

  it("follows a real change once it has held, and is null with nothing measured", () => {
    expect(heldLevel(flat(30, 177, { 24: 0, 25: 0, 26: 0, 27: 0, 28: 0, 29: 0 }))).toBe(0);
    expect(heldLevel([3, null, 5])).toBe(5); // an observed sample, never a 4 nobody measured (R52); the newer one (R55)
    expect(heldLevel([null, null])).toBeNull();
    expect(heldLevel([])).toBeNull();
  });

  it("is gaugeChange's own end level", () => {
    const pts = Array.from({ length: 30 }, (_, i) => (i < 15 ? 177 : 120));
    expect(heldLevel(pts)).toBe(gaugeChange(pts)!.to);
  });
});

describe("gaugeChange", () => {
  it("states whole levels at both ends: an even split reads its more recent observed sample (R52, R55)", () => {
    const pts = [17, 17, 17, 18, 18, 18, ...flat(10, 20), 21, 21, 21, 20, 20, 20];
    expect(gaugeChange(pts)).toMatchObject({ from: 18, to: 20 });
  });

  it("reads through an interior outage: no drop is stated", () => {
    const pts = flat(30, 177, { 10: 32, 11: 32, 12: 32, 13: 32, 14: 32 });
    expect(gaugeChange(pts)).toMatchObject({ from: 177, to: 177 });
  });

  it("states a step that holds", () => {
    const pts = Array.from({ length: 30 }, (_, i) => (i < 15 ? 177 : 120));
    expect(gaugeChange(pts)).toMatchObject({ from: 177, to: 120 });
  });

  it("does not state a drop that only the last two samples show", () => {
    // The end level is the median of the last six, which two low samples do not move.
    const pts = flat(30, 177, { 28: 40, 29: 40 });
    expect(gaugeChange(pts)).toMatchObject({ from: 177, to: 177 });
  });

  it("returns null when the end level does not hold over the final quarter", () => {
    // A steep slide: the span ended mid-move, so the last six (median 65) are not a level that
    // the final quarter (median 75) shares.
    const pts = Array.from({ length: 32 }, (_, i) => (i < 16 ? 200 : 200 - (i - 15) * 10));
    expect(gaugeChange(pts)).toBeNull();
  });

  it("returns null with fewer than 12 measured samples, nulls not counted", () => {
    expect(gaugeChange(flat(11, 177))).toBeNull();
    expect(gaugeChange(flat(20, 177, { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null }))).toBeNull();
    expect(gaugeChange(flat(12, 177))).toMatchObject({ from: 177, to: 177 });
  });

  it("reports where the first measured sample sits", () => {
    expect(gaugeChange(flat(20, 50))!.firstIndex).toBe(0);
    expect(gaugeChange(flat(30, 50, Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, null]))))!.firstIndex).toBe(10);
  });

  it("leaves null samples out rather than reading them as 0", () => {
    const pts = [null, ...flat(20, 50), null];
    expect(gaugeChange(pts)).toMatchObject({ from: 50, to: 50 });
  });
});

describe("factsBlock", () => {
  it("renders one label: text line per fact, then the blurb lines verbatim", () => {
    const facts = [fact("Global snapshots", 12159, "count"), fact("Share", 0.5, "share")];
    expect(factsBlock(facts)).toBe("Global snapshots: 12,159\nShare: 50%");
    expect(factsBlock(facts, ["BioFi is: a lending app"])).toBe("Global snapshots: 12,159\nShare: 50%\nBioFi is: a lending app");
    expect(factsBlock([])).toBe("");
  });
});

describe("networksAnchored", () => {
  const DAY = 86_400_000;
  it("is the plain count when the unlisted channel is silent or unmeasured", () => {
    expect(networksAnchored(3, {}, DAY)).toEqual({ count: 3, atLeast: false });
    expect(networksAnchored(3, { "m.unlisted.snaps": [null, 0, 0, null] }, DAY)).toEqual({ count: 3, atLeast: false });
  });

  it("is one more, as a floor, when unlisted chains anchored inside the trimmed span", () => {
    expect(networksAnchored(3, { "m.unlisted.snaps": [0, 0, 5, 0] }, DAY)).toEqual({ count: 4, atLeast: true });
  });

  it("does not count activity in a partial edge bucket", () => {
    expect(networksAnchored(3, { "m.unlisted.snaps": [9, 0, 0, 9] }, DAY)).toEqual({ count: 3, atLeast: false });
  });
});
