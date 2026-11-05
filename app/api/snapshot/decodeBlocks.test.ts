import { describe, it, expect } from "vitest";
import fixture from "./__fixtures__/global-7241523.json";
import { decodeBlocks } from "./decodeBlocks";

describe("decodeBlocks", () => {
  it("reads each block's two parents by height and hash, its transfers and signatures", () => {
    const { blocks, tips } = decodeBlocks(fixture);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].parents).toEqual([
      { height: 61635, hash: expect.stringMatching(/^8352a78d04/) },
      { height: 61635, hash: expect.stringMatching(/^edc6373927/) },
    ]);
    expect(blocks[0].height).toBe(61636);
    expect(blocks[0].txCount).toBe(1);
    expect(blocks[0].amount).toBeCloseTo(8450.12, 2);
    expect(blocks[0].signers).toBe(3);
    expect(blocks[0].hash).toBe("");
    expect(tips?.active.map((t) => t.introducedAt)).toContain(7241162);
    expect(tips?.deprecated.length).toBe(13);
  });
  it("answers no blocks and null tips for a value that carries neither", () => {
    expect(decodeBlocks({ ordinal: 1 })).toEqual({ blocks: [], tips: null });
  });
});
