import { describe, expect, it } from "vitest";
import { FIT_MAX, FIT_MIN, pageKeepingRow, rowsThatFit } from "./fitRows";

describe("rowsThatFit — the page size that fills the rail", () => {
  it("adds the whole pitches the free space holds, and drops the ones it overflows by", () => {
    expect(rowsThatFit(15, 3 * 29 + 10, 29, 15)).toBe(18);
    expect(rowsThatFit(15, -2 * 29 - 1, 29, 15)).toBe(12);
  });
  it("is a fixed point: once applied, less than one pitch is left and the answer holds", () => {
    const n = rowsThatFit(15, 100, 29, 15);
    expect(rowsThatFit(n, 100 - (n - 15) * 29, 29, 15)).toBe(n);
  });
  it("stays inside its bounds", () => {
    expect(rowsThatFit(15, -10_000, 29, 15)).toBe(FIT_MIN);
    expect(rowsThatFit(15, 10_000, 29, 15)).toBe(FIT_MAX);
  });
  it("keeps the fallback until something has been measured", () => {
    expect(rowsThatFit(0, 500, 29, 15)).toBe(15);
    expect(rowsThatFit(15, 500, 0, 15)).toBe(15);
  });
});

describe("pageKeepingRow — the reader's place survives a resize", () => {
  it("lands on the page holding the row that was first on screen", () => {
    expect(pageKeepingRow(3, 15, 20)).toBe(2); // row 31 → page 2 of 20s
    expect(pageKeepingRow(2, 20, 15)).toBe(2); // row 21 → page 2 of 15s
    expect(pageKeepingRow(1, 15, 25)).toBe(1);
  });
  it("tolerates degenerate inputs", () => {
    expect(pageKeepingRow(0, 0, 0)).toBe(1);
  });
});
