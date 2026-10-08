import { describe, expect, it } from "vitest";

import { bucketColumns, bucketPage, bucketScope, shortKey, tierWord } from "./trendBuckets";

const ID = "DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM";
const KEYS = [
  "g.kb", "g.ticks", "g.anchors", "g.fee", "g.zzz", "u.cov", "f.nodes", "f.layer.dl1", "f.layer.l0", "f.cc.DE",
  `m.${ID}.fee`, `m.${ID}.snaps`, `m.${ID}.kb`, `f.nodes.${ID}`, `f.layer.${ID}.cl1`, `f.layer.${ID}.l0`, `f.type.${ID}.l0+cl1`,
  "m.other.snaps", "f.nodes.other",
];

describe("bucketScope — the plane in front, else the filter", () => {
  it("reads like the card rule", () => {
    expect(bucketScope("all", null)).toBe("all");
    expect(bucketScope("all", "dor")).toBe("dor");
    expect(bucketScope("ded", null)).toBe("ded");
  });
});

describe("bucketColumns — the fields a scope owns, in the vocabulary's order", () => {
  it("the global row: counters, fleet gauges, coverage; never per-country or per-network fields", () => {
    expect(bucketColumns(KEYS, "all")).toEqual(["g.ticks", "g.anchors", "g.fee", "g.kb", "f.nodes", "f.layer.l0", "f.layer.dl1", "u.cov", "g.zzz"]);
    expect(bucketColumns(KEYS, "dag")).toEqual(bucketColumns(KEYS, "all"));
  });
  it("a network: its counters, node count, layer gauges and node types — nobody else's", () => {
    expect(bucketColumns(KEYS, ID)).toEqual([`m.${ID}.snaps`, `m.${ID}.fee`, `m.${ID}.kb`, `f.nodes.${ID}`, `f.layer.${ID}.l0`, `f.layer.${ID}.cl1`, `f.type.${ID}.l0+cl1`]);
  });
  it("is empty for a scope with nothing stored, and drops duplicates", () => {
    expect(bucketColumns(KEYS, "nobody")).toEqual([]);
    expect(bucketColumns(["g.ticks", "g.ticks"], "all")).toEqual(["g.ticks"]);
  });
});

describe("shortKey — the scope's address said once, in the head", () => {
  it("takes the address out of a network's field names and leaves global ones alone", () => {
    expect(shortKey(`m.${ID}.fee`, ID)).toBe("m.fee");
    expect(shortKey(`f.nodes.${ID}`, ID)).toBe("f.nodes");
    expect(shortKey(`f.type.${ID}.l0+cl1`, ID)).toBe("f.type.l0+cl1");
    expect(shortKey("g.ticks", "all")).toBe("g.ticks");
  });
});

describe("tierWord", () => {
  it("names the three tiers the sampler writes, and says minutes for anything else", () => {
    expect(tierWord(300_000)).toBe("5m");
    expect(tierWord(3_600_000)).toBe("1h");
    expect(tierWord(86_400_000)).toBe("1d");
    expect(tierWord(900_000)).toBe("15m");
  });
});

describe("bucketPage — newest first, 1-based ranges, no crash past the end", () => {
  it("pages from the newest bucket back", () => {
    expect(bucketPage(7, 1, 3)).toEqual({ idx: [6, 5, 4], from: 1, to: 3 });
    expect(bucketPage(7, 3, 3)).toEqual({ idx: [0], from: 7, to: 7 });
    expect(bucketPage(7, 4, 3)).toEqual({ idx: [], from: 0, to: 0 });
    expect(bucketPage(0, 1, 25)).toEqual({ idx: [], from: 0, to: 0 });
  });
});
