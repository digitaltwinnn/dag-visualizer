import { describe, it, expect } from "vitest";
import { ENTRY_FALL, ENTRY_STAG, entryStep, entryTotal } from "./entryBeat";

describe("entryBeat — the arrival drop's shape, shared by the chamber and the base rings", () => {
  it("a row is held high and dark before its start, lands at its fall's end", () => {
    expect(entryStep(0, 0.2)).toEqual({ p: 0, drop: 1, fade: 0 });
    expect(entryStep(0.2 + ENTRY_FALL, 0.2)).toEqual({ p: 1, drop: 0, fade: 1 });
  });
  it("the drop is gravity-eased and the presence arrives early in the fall", () => {
    const half = entryStep(ENTRY_FALL / 2, 0);
    expect(half.p).toBeCloseTo(0.5, 9);
    expect(half.drop).toBeCloseTo(0.75, 9); // 1 − p²: still three quarters up at half time
    expect(half.fade).toBeCloseTo(0.8, 9); // p × 1.6
    expect(entryStep(ENTRY_FALL * 0.7, 0).fade).toBe(1);
  });
  it("the whole beat is one fall plus the stagger of every row after the first", () => {
    expect(entryTotal(1)).toBe(ENTRY_FALL);
    expect(entryTotal(21)).toBeCloseTo(ENTRY_FALL + ENTRY_STAG * 20, 9);
    expect(entryTotal(3, 0.12)).toBeCloseTo(ENTRY_FALL + 0.24, 9); // an instrument's own stagger (the rings)
  });
});
