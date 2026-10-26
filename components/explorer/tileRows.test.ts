import { describe, expect, it } from "vitest";
import { tileCells, tileRows } from "./tileRows";

describe("tileRows — the measure control's row plan", () => {
  it("places every tile exactly once", () => {
    for (let n = 0; n <= 9; n++) expect(tileRows(n).reduce((a, b) => a + b, 0)).toBe(n);
  });
  it("four sit two by two, and seven split 2 · 3 · 2 — never a lone tile on a row", () => {
    expect(tileRows(4)).toEqual([2, 2]);
    expect(tileRows(7)).toEqual([2, 3, 2]);
  });
  it("everything else fills rows of three", () => {
    expect(tileRows(2)).toEqual([2]);
    expect(tileRows(3)).toEqual([3]);
    expect(tileRows(6)).toEqual([3, 3]);
  });
  it("every row's span divides the six-column grid", () => {
    for (let n = 1; n <= 9; n++) for (const r of tileRows(n)) expect(6 % r).toBe(0);
  });
});

describe("tileCells — each cell's place, for the corner and divider rules", () => {
  it("marks each row's ends and the row count", () => {
    const c = tileCells(7);
    expect(c.map((x) => x.row)).toEqual([0, 0, 1, 1, 1, 2, 2]);
    expect(c.map((x) => x.first)).toEqual([true, false, true, false, false, true, false]);
    expect(c.map((x) => x.last)).toEqual([false, true, false, false, true, false, true]);
    expect(c.every((x) => x.rows === 3)).toBe(true);
  });
});
