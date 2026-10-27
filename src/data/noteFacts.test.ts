import { describe, it, expect } from "vitest";
import { fact, factsBlock, gaugeChange } from "@/src/data/noteFacts";

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

  it("reads a date in UTC, whatever the zone", () => {
    expect(fact("x", Date.UTC(2026, 0, 1, 23, 59), "date").text).toBe("Jan 1");
  });
});

const flat = (n: number, v: number, patch: Record<number, number | null> = {}): (number | null)[] =>
  Array.from({ length: n }, (_, i) => (i in patch ? patch[i]! : v));

describe("gaugeChange", () => {
  it("reads through an interior outage: no drop is stated", () => {
    const pts = flat(30, 177, { 10: 32, 11: 32, 12: 32, 13: 32, 14: 32 });
    expect(gaugeChange(pts)).toEqual({ from: 177, to: 177 });
  });

  it("states a step that holds", () => {
    const pts = Array.from({ length: 30 }, (_, i) => (i < 15 ? 177 : 120));
    expect(gaugeChange(pts)).toEqual({ from: 177, to: 120 });
  });

  it("does not state a drop that only the last two samples show", () => {
    // The end level is the median of the last six, which two low samples do not move.
    const pts = flat(30, 177, { 28: 40, 29: 40 });
    expect(gaugeChange(pts)).toEqual({ from: 177, to: 177 });
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
    expect(gaugeChange(flat(12, 177))).toEqual({ from: 177, to: 177 });
  });

  it("leaves null samples out rather than reading them as 0", () => {
    const pts = [null, ...flat(20, 50), null];
    expect(gaugeChange(pts)).toEqual({ from: 50, to: 50 });
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
