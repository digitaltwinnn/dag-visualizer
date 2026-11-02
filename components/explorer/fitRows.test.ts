import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIT_MAX, FIT_MIN, pageKeepingRow, rowsThatFit, pageHolding, pageOnResize } from "./fitRows";

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

describe("pageHolding", () => {
  it("is the 1-based page holding a 0-based row", () => {
    expect(pageHolding(0, 15)).toBe(1);
    expect(pageHolding(14, 15)).toBe(1);
    expect(pageHolding(15, 15)).toBe(2);
  });
  it("a row that is not in the list holds no page", () => {
    expect(pageHolding(-1, 15)).toBeNull();
  });
});

describe("pageOnResize — a page-size change keeps the reader's place", () => {
  it("keeps the PINNED row on screen when there is one", () => {
    // Pinned at row 24 on page 2 of 14; the fit re-measures 14 → 30 → 14 while the card eases.
    const mid = pageOnResize(2, 14, 30, 24);
    expect(mid).toBe(1);
    expect(pageOnResize(mid, 30, 14, 24)).toBe(2);
  });
  it("without a pin, keeps the row that was first on screen", () => {
    expect(pageOnResize(3, 10, 20, -1)).toBe(pageKeepingRow(3, 10, 20));
  });
});

// THE BOX EASES, THE CONTENT DOES NOT (user, 2026-11-02: "the explorer section bottom keeps jumping up/
// down a bit the height of a row"; measured at 1536x864, 14, 11, 12, 13, 14 rows every 0.7 seconds).
// `HeightEase` holds the card's box at its old height while the rows are already laid out, so a fit
// read off the box saw room that was not there, added a row, overflowed when the ease landed, and
// went round again.
describe("what the fit measures", () => {
  const hook = readFileSync("components/explorer/useFitRows.ts", "utf8");
  it("reads the card's content, never its eased box", () => {
    expect(hook).not.toMatch(/card\.getBoundingClientRect\(\)\.bottom/);
    expect(hook).toMatch(/card\.lastElementChild/);
  });
  it("converges from either side while the box stands anywhere", () => {
    const pitch = 31.7;
    const top = 100;
    const host = top + 12 * pitch + 3.4;
    const bottom = (rows: number) => top + rows * pitch;
    for (const start of [9, 11, 14, 18]) {
      let n = start;
      for (let i = 0; i < 4; i++) n = rowsThatFit(n, host - bottom(n), pitch, 10);
      expect(n).toBe(12);
    }
  });
});
