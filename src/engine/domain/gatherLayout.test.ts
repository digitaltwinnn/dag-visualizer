// src/engine/domain/gatherLayout.test.ts
import { describe, it, expect } from "vitest";
import { gatherSlots, gatherExtent, gatherBand, GATHER_GUTTER, GATHER_MAX_GROWTH } from "./gatherLayout";

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

  it("empty input returns an empty map", () => {
    expect(gatherSlots([])).toEqual(new Map());
  });

  it("a single-network single-node input is one 1x1 grid at the packing origin", () => {
    const m = gatherSlots([{ id: "solo", count: 1 }]);
    expect(m.size).toBe(1);
    const s = m.get("solo")!;
    expect(s).toEqual([{ u: 0, v: -0.5, rank: 0, count: 1 }]);
  });

  // The comparator carries an EXPLICIT secondary key (`a.id.localeCompare(b.id)`) for ties,
  // not a bare reliance on Array.prototype.sort's stability — so two equal-count groups pack
  // by id ASCENDING regardless of input order. Pin that as the contract: a future rewrite
  // that drops the secondary key (leaving ties to raw input order) must fail this test.
  it("equal-count groups tie-break by id ascending, independent of input order", () => {
    const inOrder = gatherSlots([
      { id: "zzz", count: 5 },
      { id: "aaa", count: 5 },
    ]);
    const reversed = gatherSlots([
      { id: "aaa", count: 5 },
      { id: "zzz", count: 5 },
    ]);
    // "aaa" sorts first (leftmost, most-negative u) in BOTH calls.
    const leftMost = (m: Map<string, { u: number }[]>, id: string) => Math.min(...m.get(id)!.map((s) => s.u));
    expect(leftMost(inOrder, "aaa")).toBeLessThan(leftMost(inOrder, "zzz"));
    expect(leftMost(reversed, "aaa")).toBeLessThan(leftMost(reversed, "zzz"));
    expect(inOrder.get("aaa")).toEqual(reversed.get("aaa"));
    expect(inOrder.get("zzz")).toEqual(reversed.get("zzz"));
  });
});

// The extent is what the scene fits into the viewport, so it MUST describe the grids that
// gatherSlots actually lays out — the two share one packing pass precisely so they can't
// disagree. These tests measure the slots and compare, rather than restating the arithmetic.
describe("gatherExtent", () => {
  const measured = (groups: { id: string; count: number }[]) => {
    const m = gatherSlots(groups);
    const all = [...m.values()].flat();
    if (!all.length) return { w: 0, h: 0 };
    // Slots are cell CENTRES (u = left + 0.5, v = -(row + 0.5)), so the edge-to-edge extent is
    // the centre span plus one whole cell.
    const us = all.map((s) => s.u), vs = all.map((s) => s.v);
    return { w: Math.max(...us) - Math.min(...us) + 1, h: Math.max(...vs) - Math.min(...vs) + 1 };
  };

  it("matches the extent of the slots gatherSlots actually places", () => {
    const groups = [
      { id: "dag", count: 164 },
      { id: "dor", count: 20 },
      { id: "paca", count: 12 },
      { id: "ded", count: 3 },
    ];
    expect(gatherExtent(groups)).toEqual(measured(groups));
  });

  it("counts the gutters between squares, not around them", () => {
    // Two 2×2 grids: 2 + gutter + 2 cells wide, 2 rows tall.
    expect(gatherExtent([{ id: "a", count: 4 }, { id: "b", count: 4 }])).toEqual({ w: 4 + GATHER_GUTTER, h: 2 });
  });

  it("is the TALLEST group's row count, since grids hang from one shared top edge", () => {
    // 164 → 13 cols × 13 rows; 3 → 2 cols × 2 rows. The band's height is the deeper one.
    expect(gatherExtent([{ id: "dag", count: 164 }, { id: "tiny", count: 3 }]).h).toBe(13);
  });

  it("skips zero-count groups and answers 0×0 for nothing at all", () => {
    expect(gatherExtent([])).toEqual({ w: 0, h: 0 });
    expect(gatherExtent([{ id: "empty", count: 0 }])).toEqual({ w: 0, h: 0 });
    expect(gatherExtent([{ id: "x", count: 4 }, { id: "empty", count: 0 }])).toEqual({ w: 2, h: 2 });
  });
});

// gatherBand answers in FRUSTUM fractions, so these read them back as pixels the way the Engine
// does: a point `f` half-heights above centre lands at viewH/2 · (1 − f) px from the top.
describe("gatherBand", () => {
  const topPx = (b: { topFrac: number }, viewH: number) => (viewH / 2) * (1 - b.topFrac);
  const halfWidthPx = (b: { halfWidthFrac: number }, viewW: number) => (viewW / 2) * b.halfWidthFrac;

  it("puts the band's top edge on the rail cards' own top, at any viewport height", () => {
    // --rail-top is 90px, and the canvas rides --topbar-extra exactly as the rails do, so the
    // cards' top is 90 canvas-local px whatever the filter strip is doing.
    expect(topPx(gatherBand(1600, 950, false), 950)).toBeCloseTo(90, 6);
    expect(topPx(gatherBand(390, 780, false), 780)).toBeCloseTo(90, 6);
  });

  it("spans wider with the rails hidden than with them showing", () => {
    const cards = gatherBand(1600, 950, false);
    const scene = gatherBand(1600, 950, true);
    expect(halfWidthPx(scene, 1600)).toBeGreaterThan(halfWidthPx(cards, 1600) * 1.5);
  });

  it("clears the wider rail on BOTH sides — the band is centred on the screen, not on the gap", () => {
    // Centring on the screen means the band never slides sideways when a rail comes or goes; the
    // price is that the WIDER rail (the right one, --detail-w 320) binds both edges.
    const b = gatherBand(1600, 950, false);
    expect(halfWidthPx(b, 1600)).toBeCloseTo(1600 / 2 - (26 + 320) - 24, 6);
  });

  it("ignores the rails below the tier where they stop being inline columns", () => {
    // Under 1100px they are dock sheets over the scene, so there is no column to clear.
    expect(gatherBand(900, 800, false)).toEqual(gatherBand(900, 800, true));
  });

  it("leaves the LiveStrip's lane free below the band", () => {
    const b = gatherBand(1600, 950, false);
    expect(90 + (950 / 2) * b.heightFrac).toBeLessThanOrEqual(950 - 130);
  });

  it("never returns a negative box, however cramped the viewport", () => {
    const b = gatherBand(320, 240, false);
    expect(b.halfWidthFrac).toBeGreaterThan(0);
    expect(b.heightFrac).toBeGreaterThanOrEqual(0);
  });
});

describe("GATHER_MAX_GROWTH", () => {
  // Shrinking is deliberately unbounded (phone portrait: fitting is the whole point) and only
  // GROWTH is capped, so a sparse network set can't blow the staging squares up to fill the
  // screen. A cap at or below 1 would disable growing entirely.
  it("caps growth above the tuned size without bounding the shrink", () => {
    expect(GATHER_MAX_GROWTH).toBeGreaterThan(1);
  });
});
