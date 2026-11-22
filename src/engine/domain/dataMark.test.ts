import { describe, it, expect } from "vitest";
import { DATA_MARK, DATA_STACK, carriesData, dataMarkCount, dataStackBoxes } from "./dataMark";

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
  it("stands clear of its tile: 2–3 tile heights up (user, 2026-11-09: 'like 2x to 3x current distance')", () => {
    expect(DATA_MARK.lift).toBeGreaterThanOrEqual(2);
    expect(DATA_MARK.lift).toBeLessThanOrEqual(3);
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
