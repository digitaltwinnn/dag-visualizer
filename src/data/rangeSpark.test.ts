import { describe, it, expect } from "vitest";
import { FRAME_CONTEXT, JOIN_BELOW, captionMarks, litIndices, rangeFrame, rangeGeometry } from "./rangeSpark";

const H = 3_600_000;
const D = 24 * H;
const NOW = Date.UTC(2026, 10, 9, 12);

describe("rangeFrame — the shortest pill that holds the range with context", () => {
  it("is the 90-day window for 22 days ending 6 days ago", () => {
    expect(rangeFrame({ fromMs: NOW - 28 * D, toMs: NOW - 6 * D }, NOW)).toBe("90d");
  });
  it("is the 24-hour window for four hours ending two hours ago", () => {
    expect(rangeFrame({ fromMs: NOW - 6 * H, toMs: NOW - 2 * H }, NOW)).toBe("24h");
  });
  it(`asks ${FRAME_CONTEXT}× the range's length, not just its reach back`, () => {
    // 30 days ending now reaches back exactly 30 days, but 3 × 30 is 90.
    expect(rangeFrame({ fromMs: NOW - 30 * D, toMs: NOW }, NOW)).toBe("90d");
  });
  it("reaches back to an old range however short it is", () => {
    expect(rangeFrame({ fromMs: NOW - 200 * D, toMs: NOW - 200 * D + 4 * H }, NOW)).toBe("1y");
  });
  it("is everything measured past a year", () => {
    expect(rangeFrame({ fromMs: NOW - 400 * D, toMs: NOW - 390 * D }, NOW)).toBe("all");
  });
});

describe("litIndices — the buckets the range touches", () => {
  const days = [0, 1, 2, 3, 4, 5].map((i) => NOW - (6 - i) * D);
  it("takes every bucket inside the range", () => {
    expect(litIndices(days, D, { fromMs: days[2]!, toMs: days[4]! + D })).toEqual([2, 4]);
  });
  it("takes the one bucket that holds a range finer than it", () => {
    expect(litIndices(days, D, { fromMs: days[3]! + 2 * H, toMs: days[3]! + 6 * H })).toEqual([3, 3]);
  });
  it("is null when the frame does not reach the range", () => {
    expect(litIndices(days, D, { fromMs: days[0]! - 3 * D, toMs: days[0]! - D })).toBeNull();
  });
});

describe("rangeGeometry — two parts of one line, on one scale", () => {
  it("stretches both parts against the whole frame, the range keeping its own peak", () => {
    const g = rangeGeometry([0, 10, 4, 6, 2], [2, 3], 40, 10)!;
    expect(g.lit.path).toBe("M20,6L30,4"); // 4 and 6 on the frame's 0..10 scale, not stretched to fill
    expect(g.lit.peak).toEqual({ x: 30, y: 4 });
    expect(g.context.path).toBe("M0,10L10,0L20,6L30,4L40,8"); // meets the range at both its ends
    expect(rangeGeometry([0, 10, 4, 6, 2], [1, 3], 40, 10)!.context.path).toBe("M0,10L10,0M30,4L40,8"); // and leaves its inside to it
    expect(g.context.peak).toBeNull();
  });
  it("keeps a lone in-range point as a dot", () => {
    expect(rangeGeometry([1, 2, 3], [1, 1], 20, 10)!.lit.dots).toEqual([{ x: 10, y: 5 }]);
  });
  it("draws nothing when the frame measured nothing", () => {
    expect(rangeGeometry([null, null, null], [0, 2], 20, 10)).toBeNull();
  });
});

describe("captionMarks — the dates under the range's ends", () => {
  it("puts the start and end under the range's two ends when there is room", () => {
    expect(captionMarks(11, [2, 9])).toEqual({ kind: "ends", at: [0.2, 0.9] });
  });
  it(`joins the two under the middle of a range narrower than ${JOIN_BELOW * 100}% of the line`, () => {
    expect(captionMarks(11, [6, 8])).toEqual({ kind: "joined", at: 0.7 });
  });
  it("reads a whole-frame range end to end", () => {
    expect(captionMarks(5, [0, 4])).toEqual({ kind: "ends", at: [0, 1] });
  });
});
