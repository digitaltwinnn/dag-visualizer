import { describe, expect, it } from "vitest";
import { SHEET_SHIFT_K, sheetShiftPx } from "./sheetShift";

// The phone sheet's projection shift — the module header carries the design; this pins the
// arithmetic the Engine hands to `camera.setViewOffset`.
describe("sheetShiftPx — half the bottom cover, up", () => {
  it("is 0 with no cover, and never negative", () => {
    expect(sheetShiftPx(0, 844)).toBe(0);
    expect(sheetShiftPx(-40, 844)).toBe(0);
  });
  it("moves the centre up by half the cover — the free band's own centre", () => {
    expect(sheetShiftPx(515, 844)).toBe(257.5);
    expect(sheetShiftPx(300, 844)).toBe(150);
  });
  it("clamps the cover to the viewport, so a rubber-banded drag cannot fling the scene away", () => {
    expect(sheetShiftPx(2000, 844)).toBe(422);
    expect(sheetShiftPx(100, 0)).toBe(0);
  });
  it("eases on a rate the sheet's ~550ms grow can keep up with", () => {
    // 1 − e^(−k·0.55) ≈ 0.98: the shift lands with the glass, not ahead of it.
    expect(1 - Math.exp(-SHEET_SHIFT_K * 0.55)).toBeGreaterThan(0.95);
    expect(SHEET_SHIFT_K).toBeLessThan(12);
  });
});
