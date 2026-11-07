import { describe, it, expect } from "vitest";
import { layeredZ, referenceSegments, tipStateOf, silentRun } from "./blockBraid";

describe("layeredZ — a layered DAG drawing on the chamber's time axis", () => {
  const b = (hash: string, height: number, ord: number, parents: string[] = []) => ({ hash, height, ord, parents });
  it("lays a straight chain on the centre line", () => {
    const z = layeredZ([b("a", 1, 10), b("b", 2, 11, ["a"]), b("c", 3, 12, ["b"])], 1);
    expect([z.get("a"), z.get("b"), z.get("c")]).toEqual([0, 0, 0]);
  });
  it("splits two siblings symmetrically around their parent, one spacing to each side", () => {
    const z = layeredZ([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"])], 1.5);
    expect([z.get("s1"), z.get("s2")]).toEqual([-1.5, 1.5]);
  });
  it("brings a child of both siblings back to the centre line (the diamond closes)", () => {
    const z = layeredZ([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s1", "s2"])], 1);
    expect(z.get("c")).toBe(0);
  });
  it("takes the barycenter of the parents it can place, and the centre line with none", () => {
    const z = layeredZ([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s2", "gone"]), b("o", 5, 14, ["away"])], 1);
    expect(z.get("c")).toBe(1);
    expect(z.get("o")).toBe(0);
  });
  it("keeps every block it placed before where it stands, so a newer block moves no older one", () => {
    const base = [b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s1"])];
    const before = layeredZ(base, 1);
    const after = layeredZ([...base, b("n", 4, 20, ["c"])], 1, before);
    for (const h of ["a", "s1", "s2", "c"]) expect(after.get(h)).toBe(before.get(h));
    expect(after.get("n")).toBe(before.get("c"));
  });
  it("moves no block when the window's OLDEST block leaves it", () => {
    const before = layeredZ([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s2"])], 1);
    const after = layeredZ([b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"]), b("c", 3, 13, ["s2"])], 1, before);
    for (const h of ["s1", "s2", "c"]) expect(after.get(h)).toBe(before.get(h));
  });
  it("seats a sibling that arrives later in the nearest free place around the barycenter", () => {
    const before = layeredZ([b("a", 1, 10), b("s1", 2, 11, ["a"])], 1);
    expect(before.get("s1")).toBe(0);
    const after = layeredZ([b("a", 1, 10), b("s1", 2, 11, ["a"]), b("s2", 2, 12, ["a"])], 1, before);
    expect([after.get("s1"), after.get("s2")]).toEqual([0, 1]);
  });
  it("waits to place a block while a parent's read is still pending", () => {
    const z = layeredZ([b("c", 3, 13, ["p"])], 1, new Map(), new Set(["p"]));
    expect(z.has("c")).toBe(false);
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
describe("referenceSegments — every reference a read states", () => {
  const b = (hash: string, parents: string[]) => ({ hash, height: 1, parents: parents.map((p) => ({ hash: p, height: 0 })), txCount: 1, amount: 1, fee: 0, signers: 3, transfers: [] });
  const at = (h: string) => (h === "p1" ? [0, 0, 0] as const : h === "c" ? [2, 0, 1] as const : null);
  it("runs a segment to every parent placed, child first, naming both ends", () => {
    const r = referenceSegments([b("c", ["p1"])], at, -6);
    expect(Array.from(r.pos)).toEqual([2, 0, 1, 0, 0, 0]);
    expect(r.ends).toEqual(["c", "p1"]);
  });
  it("runs a STUB toward a parent outside the window: the older side, at the block's own z, its far end unnamed", () => {
    const r = referenceSegments([b("c", ["p1", "gone"])], at, -6);
    expect(Array.from(r.pos.slice(6))).toEqual([2, 0, 1, -6, 0, 1]);
    expect(r.ends.slice(2)).toEqual(["c", null]);
  });
  it("draws nothing for a block not placed", () => {
    expect(referenceSegments([b("x", ["p1"])], at, -6).pos.length).toBe(0);
  });
});
describe("silentRun", () => {
  it("states the snapshots and time between two block ticks, and nothing for adjacent ticks", () => {
    expect(silentRun(100, 859, 0, 7_920_000)).toEqual({ snapshots: 758, ms: 7_920_000 });
    expect(silentRun(100, 101, 0, 10_000)).toBeNull();
  });
});
