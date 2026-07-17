// src/engine/domain/gatherLayout.test.ts
import { describe, it, expect } from "vitest";
import { gatherSlots, GATHER_GUTTER } from "./gatherLayout";

describe("gatherSlots", () => {
  it("gives every node exactly one slot, rank-ordered row-major", () => {
    const m = gatherSlots([{ id: "dag", count: 5 }]);
    const s = m.get("dag")!;
    expect(s).toHaveLength(5);
    s.forEach((slot, i) => {
      expect(slot.rank).toBe(i);
      expect(slot.count).toBe(5);
    });
    // 5 nodes → cols = ceil(√5) = 3: ranks 0..2 on row 0, 3..4 on row 1
    expect(s[0].v).toBe(s[2].v);
    expect(s[3].v).toBeLessThan(s[0].v); // rows grow DOWNWARD (negative v)
  });

  it("grids are near-square: cols = ceil(sqrt(n))", () => {
    const s = gatherSlots([{ id: "dor", count: 21 }]).get("dor")!;
    const cols = new Set(s.map((x) => x.u)).size;
    expect(cols).toBe(5); // ceil(√21)
  });

  it("a big network's square is visibly wider than a small one's (DAG rule)", () => {
    const m = gatherSlots([
      { id: "dag", count: 164 },
      { id: "paca", count: 3 },
    ]);
    const width = (slots: { u: number }[]) =>
      Math.max(...slots.map((s) => s.u)) - Math.min(...slots.map((s) => s.u));
    expect(width(m.get("dag")!)).toBeGreaterThan(width(m.get("paca")!) * 3);
  });

  it("packs groups left-to-right sorted by count desc with the gutter, centred on u=0", () => {
    const m = gatherSlots([
      { id: "small", count: 4 }, // 2×2
      { id: "big", count: 16 }, // 4×4 — sorts FIRST despite input order
    ]);
    const big = m.get("big")!, small = m.get("small")!;
    const bigMax = Math.max(...big.map((s) => s.u));
    const smallMin = Math.min(...small.map((s) => s.u));
    expect(smallMin - bigMax).toBeCloseTo(GATHER_GUTTER + 1, 10); // gutter between edge cells
    // centred: overall extent symmetric about 0
    const allU = [...big, ...small].map((s) => s.u);
    expect(Math.max(...allU) + Math.min(...allU)).toBeCloseTo(0, 10);
  });

  it("is deterministic and skips zero-count groups", () => {
    const a = gatherSlots([{ id: "x", count: 7 }, { id: "empty", count: 0 }]);
    const b = gatherSlots([{ id: "x", count: 7 }, { id: "empty", count: 0 }]);
    expect(a.get("x")).toEqual(b.get("x"));
    expect(a.has("empty")).toBe(false);
  });
});
