import { describe, expect, it } from "vitest";
import { clampLean, dragTurn, DRAG_SLOP_PX, GLOBE_SURFACE_R, isDrag, LEAN_MAX, RATE_FLOOR } from "./globeDrag";

const REST = GLOBE_SURFACE_R + 30; // a resting pose 30 above the plateau

describe("dragTurn — a drag turns the globe at the orbit's resting rate, slower nearer the surface", () => {
  it("at the resting distance a full viewport height is one full turn, like the orbit it replaces", () => {
    const t = dragTurn(900, 0, 900, REST, REST);
    expect(t.yaw).toBeCloseTo(2 * Math.PI, 9);
    expect(t.lean).toBe(0);
  });
  it("signs: right carries the front to the right (+yaw), down carries it down (+lean)", () => {
    const t = dragTurn(10, 20, 900, REST, REST);
    expect(t.yaw).toBeGreaterThan(0);
    expect(t.lean).toBeGreaterThan(0);
    expect(t.lean / t.yaw).toBeCloseTo(2, 9);
  });
  it("halfway down to the plateau the rate halves; beyond the resting distance it never grows", () => {
    const half = dragTurn(100, 0, 900, GLOBE_SURFACE_R + 15, REST);
    const rest = dragTurn(100, 0, 900, REST, REST);
    const far = dragTurn(100, 0, 900, REST * 2, REST);
    expect(half.yaw).toBeCloseTo(rest.yaw / 2, 9);
    expect(far.yaw).toBeCloseTo(rest.yaw, 9);
  });
  it("at the surface the rate floors rather than freezing", () => {
    const t = dragTurn(100, 0, 900, GLOBE_SURFACE_R, REST);
    expect(t.yaw).toBeCloseTo(((2 * Math.PI) / 900) * 100 * RATE_FLOOR, 9);
  });
  it("no travel, no turn", () => {
    expect(dragTurn(0, 0, 900, REST, REST)).toEqual({ yaw: 0, lean: 0 });
  });
});

describe("clampLean / isDrag", () => {
  it("the lean stops at the poles", () => {
    expect(clampLean(3)).toBe(LEAN_MAX);
    expect(clampLean(-3)).toBe(-LEAN_MAX);
    expect(clampLean(0.3)).toBe(0.3);
  });
  it("a press is a drag once it travels past the slop", () => {
    expect(isDrag(DRAG_SLOP_PX, 0)).toBe(false);
    expect(isDrag(DRAG_SLOP_PX + 1, 0)).toBe(true);
    expect(isDrag(3, 3)).toBe(true);
  });
});
