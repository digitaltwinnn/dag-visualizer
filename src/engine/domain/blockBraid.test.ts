import { describe, it, expect } from "vitest";
import { FAN_REACH, fanOffset, siblingRanks, tipStateOf, linkEndpoints, silentRun } from "./blockBraid";

describe("siblingRanks", () => {
  const b = (hash: string, height: number, ord: number) => ({ hash, height, ord });
  it("ranks the blocks of one height side by side, newest first, and starts every height at 0", () => {
    const r = siblingRanks([b("a", 10, 1), b("b", 10, 3), b("c", 11, 4), b("d", 10, 2)]);
    expect([r.get("b"), r.get("d"), r.get("a")]).toEqual([0, 1, 2]);
    expect(r.get("c")).toBe(0);
  });
  it("breaks a tie on one tick by hash, so the order never depends on read arrival", () => {
    expect(siblingRanks([b("y", 5, 9), b("x", 5, 9)]).get("x")).toBe(0);
    expect(siblingRanks([b("x", 5, 9), b("y", 5, 9)]).get("x")).toBe(0);
  });
  it("an OLDER sibling arriving late takes the next rank and moves no block already placed", () => {
    const before = siblingRanks([b("new", 7, 20), b("mid", 7, 15)]);
    const after = siblingRanks([b("new", 7, 20), b("mid", 7, 15), b("old", 7, 3)]);
    expect([after.get("new"), after.get("mid")]).toEqual([before.get("new"), before.get("mid")]);
    expect(after.get("old")).toBe(2);
  });
});
describe("fanOffset", () => {
  it("fans the siblings out from the centre, alternately to each side", () => {
    expect([0, 1, 2, 3, 4].map((k) => fanOffset(k))).toEqual([0, 1, -1, 2, -2]);
  });
  it("folds a rank past the fan's reach back inside it, so no block leaves the braid", () => {
    for (let k = 0; k < 40; k++) expect(Math.abs(fanOffset(k))).toBeLessThanOrEqual(FAN_REACH);
    expect(fanOffset(2 * FAN_REACH + 1)).toBe(0);
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
