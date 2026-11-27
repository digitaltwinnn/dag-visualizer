import { describe, it, expect } from "vitest";
import { DATA_BANDS, DATA_MARK, DATA_STACK, carriesData, dataBoxBands, dataMarkCount, dataStackBoxes } from "./dataMark";

// THE DATA BLOCKS REGISTER'S TILE MARK (D6, 2026-11-07): a mark on each metagraph snapshot tile whose
// exact read says it carried data blocks: a column of boxes, one per data block.

describe("dataMarkCount", () => {
  it("marks a snapshot that carried data blocks, with its data updates", () => {
    expect(dataMarkCount({ dataBlocks: 2, dataTxCount: 41 })).toBe(41);
    // Data blocks whose updates read as none still carried data: a mark at the floor height.
    expect(dataMarkCount({ dataBlocks: 1, dataTxCount: 0 })).toBe(0);
  });

  it("marks nothing where the snapshot carried no data block, or where the read has not landed (rule 10)", () => {
    expect(dataMarkCount({ dataBlocks: 0, dataTxCount: 0 })).toBeNull();
    expect(dataMarkCount(null)).toBeNull();
    expect(dataMarkCount(undefined)).toBeNull();
    // An undecodable row states no count: unknown, never a guess.
    expect(dataMarkCount({})).toBeNull();
  });
});

describe("carriesData", () => {
  it("is the mark's own question: data blocks in the read, whatever their updates count", () => {
    expect(carriesData({ dataBlocks: 1, dataTxCount: 0 })).toBe(true);
    expect(carriesData({ dataBlocks: 3, dataTxCount: 12 })).toBe(true);
  });
  it("is false for a snapshot that carried none, and while the read has not landed (rule 10)", () => {
    expect(carriesData({ dataBlocks: 0, dataTxCount: 0 })).toBe(false);
    expect(carriesData({})).toBe(false);
    expect(carriesData(null)).toBe(false);
    expect(carriesData(undefined)).toBe(false);
  });
});

describe("DATA_MARK — a box is a block (user, 2026-11-23)", () => {
  it("stands inside its tile's footprint", () => {
    expect(DATA_MARK.foot).toBeGreaterThan(0.3);
    expect(DATA_MARK.foot).toBeLessThan(1);
  });
  it("stands well clear of its tile (user, 2026-11-23: 'they are too close')", () => {
    expect(DATA_MARK.lift).toBeGreaterThanOrEqual(5);
    expect(DATA_MARK.lift).toBeLessThanOrEqual(9);
  });
});

describe("dataStackBoxes — one box per data block (user, 2026-11-23)", () => {
  it("is the snapshot's own count of data blocks", () => {
    expect(dataStackBoxes({ dataBlocks: 1 })).toBe(1);
    expect(dataStackBoxes({ dataBlocks: 3 })).toBe(3);
  });
  it("stops at the labelled ceiling", () => {
    expect(dataStackBoxes({ dataBlocks: DATA_STACK.max + 40 })).toBe(DATA_STACK.max);
  });
  it("is empty where the snapshot carried none or its read has not landed (rule 10)", () => {
    expect(dataStackBoxes({ dataBlocks: 0 })).toBe(0);
    expect(dataStackBoxes({})).toBe(0);
    expect(dataStackBoxes(null)).toBe(0);
  });
  it("leaves air between the boxes", () => {
    expect(DATA_STACK.gap).toBeGreaterThan(0);
  });
});

describe("dataBoxBands — a box banded by who submitted its updates (2026-11-27)", () => {
  const sub = (id: string, updates: number) => ({ id, updates });
  it("is each submitter's share of the box, busiest first", () => {
    expect(dataBoxBands({ submitters: [sub("a", 93), sub("b", 7)] })).toEqual([
      { id: "a", share: 0.93 },
      { id: "b", share: 0.07 },
    ]);
  });
  it("draws the busiest max − 1 past the ceiling, the rest as one unnamed band", () => {
    const bands = dataBoxBands({ submitters: [sub("a", 40), sub("b", 30), sub("c", 15), sub("d", 10), sub("e", 5)] });
    expect(bands).toHaveLength(DATA_BANDS.max);
    expect(bands.map((b) => b.id)).toEqual(["a", "b", "c", null]);
    expect(bands[3].share).toBeCloseTo(0.15);
    expect(bands.reduce((n, b) => n + b.share, 0)).toBeCloseTo(1);
  });
  it("names every submitter while they fit under the ceiling", () => {
    const bands = dataBoxBands({ submitters: [sub("a", 1), sub("b", 1), sub("c", 1), sub("d", 1)] });
    expect(bands.map((b) => b.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("orders by updates whatever order it is handed, ties by id", () => {
    expect(dataBoxBands({ submitters: [sub("z", 1), sub("y", 3), sub("a", 1)] }).map((b) => b.id)).toEqual(["y", "a", "z"]);
  });
  it("is empty for a block with no submitters: it draws as one plain box (rule 10)", () => {
    expect(dataBoxBands({})).toEqual([]);
    expect(dataBoxBands({ submitters: [] })).toEqual([]);
    expect(dataBoxBands({ submitters: [sub("a", 0)] })).toEqual([]);
  });
});
