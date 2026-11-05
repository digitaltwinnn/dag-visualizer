import { describe, it, expect } from "vitest";
import { BRAID_LANES, laneOf, laneZ, tipStateOf, linkEndpoints, silentRun } from "./blockBraid";

describe("laneOf", () => {
  it("cycles heights across the lanes from the window's lowest height", () => {
    expect(laneOf(61633, 61633)).toBe(0);
    expect(laneOf(61637, 61633)).toBe(4);
    expect(laneOf(61638, 61633)).toBe(0);
    expect(BRAID_LANES).toBe(5);
  });
});
describe("laneZ", () => {
  it("centres the lanes on the plane and spreads them across its width", () => {
    expect(laneZ(2, 5, 10)).toBe(0);
    expect(laneZ(0, 5, 10)).toBe(-4);
    expect(laneZ(4, 5, 10)).toBe(4);
  });
});
describe("tipStateOf", () => {
  const tips = { active: [{ hash: "a", height: 1, usage: 1, introducedAt: 10 }], deprecated: [{ hash: "b", height: 1, deprecatedAt: 12 }] };
  it("is open for an active tip, retired for a deprecated one or one in neither list", () => {
    expect(tipStateOf("a", tips)).toBe("open");
    expect(tipStateOf("b", tips)).toBe("retired");
    expect(tipStateOf("c", tips)).toBe("retired");
  });
  it("is null with no tips read — never inferred", () => { expect(tipStateOf("a", null)).toBeNull(); });
});
describe("linkEndpoints", () => {
  const b = (hash: string, parents: string[]) => ({ hash, height: 1, parents: parents.map((p) => ({ hash: p, height: 0 })), txCount: 1, amount: 1, fee: 0, signers: 3 });
  const at = (h: string) => (h === "p1" ? [0, 0, 0] as const : h === "c" ? [2, 0, 1] as const : null);
  it("emits one segment per parent the window holds, child first", () => {
    expect(Array.from(linkEndpoints([b("c", ["p1", "p2"])], at))).toEqual([2, 0, 1, 0, 0, 0]);
  });
  it("emits nothing for a block whose parents are both outside the window", () => {
    expect(linkEndpoints([b("c", ["x", "y"])], at).length).toBe(0);
  });
});
describe("silentRun", () => {
  it("states the snapshots and time between two block ticks, and nothing for adjacent ticks", () => {
    expect(silentRun(100, 859, 0, 7_920_000)).toEqual({ snapshots: 758, ms: 7_920_000 });
    expect(silentRun(100, 101, 0, 10_000)).toBeNull();
  });
});
