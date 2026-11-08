import { describe, it, expect } from "vitest";
import { DATA_MARK, carriesData, dataMarkCount } from "./dataMark";

// THE DATA BLOCKS REGISTER'S TILE MARK (D6, 2026-11-07): a mark on each metagraph snapshot tile whose
// exact read says it carried data blocks, its height the count of data updates.

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

describe("DATA_MARK — the tile's own size (user, 2026-11-08)", () => {
  it("is a second tile on the first: the same footprint and height", () => {
    expect(DATA_MARK.foot).toBe(1);
    expect(DATA_MARK.height).toBe(1);
  });
});
