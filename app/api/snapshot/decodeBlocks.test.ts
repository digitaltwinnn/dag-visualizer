import { describe, it, expect } from "vitest";
import fixture from "./__fixtures__/global-7241523.json";
import { decodeBlocks, pairHashes, recordBlockHashes } from "./decodeBlocks";

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

describe("hash pairing", () => {
  const { blocks } = decodeBlocks({
    blocks: [0, 1].map((i) => ({ block: { value: { parent: [{ height: i, hash: `p${i}` }], transactions: [] }, proofs: [] } })),
  });
  it("names each block by index when the explorer lists them all", () => {
    const r = pairHashes(blocks, ["aa", "bb"]);
    expect(r.blocks.map((b) => b.hash)).toEqual(["aa", "bb"]);
    expect(r.complete).toBe(true);
  });
  it("leaves the tail unnamed and reports incomplete when the explorer lists fewer", () => {
    const r = pairHashes(blocks, ["aa"]);
    expect(r.blocks.map((b) => b.hash)).toEqual(["aa", ""]);
    expect(r.complete).toBe(false);
  });
  it("decodes a block with one parent", () => {
    expect(blocks[1].parents).toEqual([{ height: 1, hash: "p1" }]);
    expect(blocks[1].height).toBe(2);
  });
  it("throws for an absent record so a miss is never cached", () => {
    expect(() => recordBlockHashes(undefined)).toThrow();
    expect(recordBlockHashes({ blocks: ["aa", 3] })).toEqual(["aa"]);
  });
});
