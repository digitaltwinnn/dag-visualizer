import { describe, expect, it } from "vitest";

import { bucketColumns, bucketPage, chainGroups, shortAddr, shortKey, tierWord } from "./trendBuckets";

const ID = "DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM";
const UNL_A = "DAG4QSG19fPchE5xVpEDA6Y1fE2F7XcSFXJvzvHo";
const UNL_B = "DAG55nwjLR1JhY4a2Wri6Cni2GWPL7Vupu5znnJi";
const KEYS = [
  "g.kb", "g.fee", "g.ticks", "g.anchors", "g.feeFloor", "g.kbFloor", "g.zzz", "u.cov", "f.nodes", "f.layer.dl1", "f.layer.l0", "f.cc.DE",
  `m.${ID}.fee`, `m.${ID}.snaps`, `m.${ID}.kb`, `f.nodes.${ID}`, `f.layer.${ID}.cl1`, `f.layer.${ID}.l0`, `f.type.${ID}.l0+cl1`,
  "m.other.snaps", "f.nodes.other",
  `m.${UNL_B}.snaps`, `m.${UNL_A}.fee`, `m.${UNL_A}.snaps`, "m.unlisted.snaps", "m.unlisted.fee",
];
const UNL = { id: "unlisted", listed: (a: string) => a === ID || a === "other" };

describe("bucketColumns — the STORED fields a scope owns, in the vocabulary's order", () => {
  it("the global row: counters, floors, fleet gauges, coverage; never the fold's derived totals, per-country or per-network fields", () => {
    expect(bucketColumns(KEYS, "all")).toEqual(["g.ticks", "g.anchors", "g.feeFloor", "g.kbFloor", "f.nodes", "f.layer.l0", "f.layer.dl1", "u.cov", "g.zzz"]);
    expect(bucketColumns(KEYS, "dag")).toEqual(bucketColumns(KEYS, "all"));
  });
  it("a network: its counters, node count, layer gauges and node types — nobody else's", () => {
    expect(bucketColumns(KEYS, ID)).toEqual([`m.${ID}.snaps`, `m.${ID}.fee`, `m.${ID}.kb`, `f.nodes.${ID}`, `f.layer.${ID}.l0`, `f.layer.${ID}.cl1`, `f.type.${ID}.l0+cl1`]);
  });
  it("the unlisted scope: every unlisted chain's own fields, chain by chain — never the folded sum", () => {
    expect(bucketColumns(KEYS, "unlisted", UNL)).toEqual([`m.${UNL_A}.snaps`, `m.${UNL_A}.fee`, `m.${UNL_B}.snaps`]);
    // Without the catalog's word on who is listed, the unlisted scope is just a network with no fields.
    expect(bucketColumns(KEYS, "unlisted")).toEqual(["m.unlisted.snaps", "m.unlisted.fee"]);
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
  it("keeps a shortened address under the unlisted scope, where every column is another chain's", () => {
    expect(shortKey(`m.${UNL_A}.snaps`, "unlisted", "unlisted")).toBe("m.DAG4QS…vzvHo.snaps");
  });
});

describe("chainGroups / shortAddr — the unlisted scope, one group per chain", () => {
  it("groups a scope's columns by address, keeping the tails' order", () => {
    const cols = bucketColumns(KEYS, "unlisted", UNL);
    expect(chainGroups(cols)).toEqual([
      { addr: UNL_A, tails: ["snaps", "fee"], keys: [`m.${UNL_A}.snaps`, `m.${UNL_A}.fee`] },
      { addr: UNL_B, tails: ["snaps"], keys: [`m.${UNL_B}.snaps`] },
    ]);
    expect(chainGroups(["g.ticks"])).toEqual([]);
  });
  it("shortens an address to its ends and leaves a short id alone", () => {
    expect(shortAddr(UNL_A)).toBe("DAG4QS…vzvHo");
    expect(shortAddr("dor")).toBe("dor");
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
