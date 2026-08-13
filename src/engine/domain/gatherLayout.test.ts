// src/engine/domain/gatherLayout.test.ts
import { describe, it, expect } from "vitest";
import {
  gatherSlots, gatherExtent, gatherBand, gatherSpread, gatherRows,
  GATHER_GUTTER, GATHER_GUTTER_MAX,
  type GatherExtent,
} from "./gatherLayout";

describe("gatherSlots", () => {
  it("gives every node exactly one slot, rank-ordered row-major", () => {
    const m = gatherSlots([{ id: "dag", count: 5 }], 2);
    const s = m.get("dag")!;
    expect(s).toHaveLength(5);
    s.forEach((slot, i) => {
      expect(slot.rank).toBe(i);
      expect(slot.count).toBe(5);
    });
    // 5 nodes, 2 rows deep → cols = ceil(5/2) = 3: ranks 0..2 on row 0, 3..4 on row 1
    expect(s[0].v).toBe(s[2].v);
    expect(s[3].v).toBeLessThan(s[0].v); // rows grow DOWNWARD (negative v)
  });

  // The block is width-FIRST (user, 2026-08-13): the depth is given and the columns follow, so
  // the same nodes lay out longer and shallower the more width the band has. The old rule was
  // `cols = ceil(√count)` — width-agnostic, and the origin of the DAG's ten-row block.
  it("fills the given depth's rows before it wraps: cols = ceil(n / rows)", () => {
    const cols = (n: number, rows: number) => new Set(gatherSlots([{ id: "dor", count: n }], rows).get("dor")!.map((x) => x.u)).size;
    expect(cols(21, 1)).toBe(21); // one row: every node side by side
    expect(cols(21, 3)).toBe(7);
    expect(cols(21, 5)).toBe(5);
    expect(cols(21, 100)).toBe(1); // deeper than the count: one column, n rows
  });

  it("a big network's block is visibly wider than a small one's (DAG rule)", () => {
    const m = gatherSlots([
      { id: "dag", count: 164 },
      { id: "paca", count: 3 },
    ], 4);
    const width = (slots: { u: number }[]) =>
      Math.max(...slots.map((s) => s.u)) - Math.min(...slots.map((s) => s.u));
    expect(width(m.get("dag")!)).toBeGreaterThan(width(m.get("paca")!) * 3);
  });

  it("packs groups left-to-right sorted by count desc with the gutter, centred on u=0", () => {
    const m = gatherSlots([
      { id: "small", count: 4 }, // 2×2
      { id: "big", count: 16 }, // 8×2 — sorts FIRST despite input order
    ], 2);
    const big = m.get("big")!, small = m.get("small")!;
    const bigMax = Math.max(...big.map((s) => s.u));
    const smallMin = Math.min(...small.map((s) => s.u));
    expect(smallMin - bigMax).toBeCloseTo(GATHER_GUTTER + 1, 10); // gutter between edge cells
    // centred: overall extent symmetric about 0
    const allU = [...big, ...small].map((s) => s.u);
    expect(Math.max(...allU) + Math.min(...allU)).toBeCloseTo(0, 10);
  });

  it("is deterministic and skips zero-count groups", () => {
    const a = gatherSlots([{ id: "x", count: 7 }, { id: "empty", count: 0 }], 3);
    const b = gatherSlots([{ id: "x", count: 7 }, { id: "empty", count: 0 }], 3);
    expect(a.get("x")).toEqual(b.get("x"));
    expect(a.has("empty")).toBe(false);
  });

  it("empty input returns an empty map", () => {
    expect(gatherSlots([], 4)).toEqual(new Map());
  });

  it("a single-network single-node input is one 1x1 grid at the packing origin", () => {
    const m = gatherSlots([{ id: "solo", count: 1 }], 3);
    expect(m.size).toBe(1);
    const s = m.get("solo")!;
    expect(s).toEqual([{ u: 0, v: -0.5, rank: 0, count: 1, gs: 0 }]);
  });

  // A depth is a count of rows, so anything that isn't one packs as a single row rather than
  // dividing by it — the alternative is NaN slots, which would gather every node onto one point.
  it("treats a nonsense depth as one row", () => {
    const one = gatherSlots([{ id: "x", count: 4 }], 1).get("x")!;
    expect(gatherSlots([{ id: "x", count: 4 }], 0).get("x")).toEqual(one);
    expect(gatherSlots([{ id: "x", count: 4 }], -3).get("x")).toEqual(one);
    expect(gatherSlots([{ id: "x", count: 4 }], Number.NaN).get("x")).toEqual(one);
    expect(gatherSlots([{ id: "x", count: 4 }], 2.7).get("x")).toEqual(gatherSlots([{ id: "x", count: 4 }], 2).get("x"));
  });

  // The comparator carries an EXPLICIT secondary key (`a.id.localeCompare(b.id)`) for ties,
  // not a bare reliance on Array.prototype.sort's stability — so two equal-count groups pack
  // by id ASCENDING regardless of input order. Pin that as the contract: a future rewrite
  // that drops the secondary key (leaving ties to raw input order) must fail this test.
  it("equal-count groups tie-break by id ascending, independent of input order", () => {
    const inOrder = gatherSlots([
      { id: "zzz", count: 5 },
      { id: "aaa", count: 5 },
    ], 2);
    const reversed = gatherSlots([
      { id: "aaa", count: 5 },
      { id: "zzz", count: 5 },
    ], 2);
    // "aaa" sorts first (leftmost, most-negative u) in BOTH calls.
    const leftMost = (m: Map<string, { u: number }[]>, id: string) => Math.min(...m.get(id)!.map((s) => s.u));
    expect(leftMost(inOrder, "aaa")).toBeLessThan(leftMost(inOrder, "zzz"));
    expect(leftMost(reversed, "aaa")).toBeLessThan(leftMost(reversed, "zzz"));
    expect(inOrder.get("aaa")).toEqual(reversed.get("aaa"));
    expect(inOrder.get("zzz")).toEqual(reversed.get("zzz"));
  });

  // `gs` is the lever that slides whole BLOCKS apart without touching the pitch inside one,
  // so it has to be constant per group and centred on 0 — otherwise spreading would drag the
  // whole row sideways instead of opening it symmetrically.
  it("stamps every slot of a group with the same centred group index", () => {
    const solo = gatherSlots([{ id: "only", count: 9 }], 3);
    expect(new Set(solo.get("only")!.map((s) => s.gs))).toEqual(new Set([0]));

    const three = gatherSlots([
      { id: "big", count: 9 },
      { id: "mid", count: 4 },
      { id: "small", count: 1 },
    ], 3);
    // Packed biggest-first, so big/mid/small are groups 0/1/2 → -1/0/+1, summing to 0.
    expect(new Set(three.get("big")!.map((s) => s.gs))).toEqual(new Set([-1]));
    expect(new Set(three.get("mid")!.map((s) => s.gs))).toEqual(new Set([0]));
    expect(new Set(three.get("small")!.map((s) => s.gs))).toEqual(new Set([1]));

    // An EVEN count straddles the middle rather than favouring a side.
    const two = gatherSlots([
      { id: "big", count: 9 },
      { id: "small", count: 1 },
    ], 3);
    expect(two.get("big")![0].gs).toBe(-0.5);
    expect(two.get("small")![0].gs).toBe(0.5);
  });
});

// The pack's depth is the band's answer — its width is the budget, its HEIGHT is where the search
// stops — which is what lets the fit hold chip size constant while the block reshapes
// (user, 2026-08-13).
describe("gatherRows", () => {
  const set = [{ id: "dag", count: 162 }, { id: "a", count: 3 }, { id: "b", count: 3 }, { id: "c", count: 3 }, { id: "d", count: 3 }];
  const packedW = (groups: { id: string; count: number }[], rows: number) => gatherExtent(groups, rows).w;
  const TALL = 40; // a desktop band: deeper than any depth these budgets ask for

  it("answers the SHALLOWEST depth whose packed row still fits the budget", () => {
    for (const budget of [26, 34.6, 62.6, 200]) {
      const rows = gatherRows(set, budget, TALL);
      expect(packedW(set, rows)).toBeLessThanOrEqual(budget);
      if (rows > 1) expect(packedW(set, rows - 1)).toBeGreaterThan(budget); // one row shallower overflows
    }
  });

  it("goes shallower as the band gets wider — the same nodes, more of the width used", () => {
    const hud = gatherRows(set, 34.6, TALL); //   1600px viewport with both rails inline
    const scene = gatherRows(set, 62.6, TALL); // …and with them away
    expect(scene).toBeLessThan(hud);
    expect(packedW(set, scene)).toBeGreaterThan(packedW(set, hud)); // the width goes into the block
  });

  // The user's rule twice over (2026-08-13): "use the screen width optimally before adding rows …
  // vertical only when horizontal runs out". A near-square ceiling stopped the search at a shape
  // the band had nothing to do with, handing the rest to the shrink while vertical room went
  // unused; the band's own height is what says when horizontal has genuinely run out.
  it("spends the band's whole HEIGHT on rows before a narrow band is left to the fit", () => {
    const square = Math.ceil(Math.sqrt(162)); // 13 — what the ceiling used to be
    const deep = gatherRows(set, 20, 30);
    expect(deep).toBeGreaterThan(square);
    expect(gatherExtent(set, deep).w).toBeLessThanOrEqual(20); // the rows past the square make it FIT
    expect(gatherExtent(set, square).w).toBeGreaterThan(20); //  …where stopping at the square did not
    // A shorter band stops sooner: the depth is the height's answer, not the count's.
    expect(gatherRows(set, 20, 8)).toBe(8);
  });

  it("never goes deeper than one column per group — past that, depth buys nothing", () => {
    // The phone: the row's gutters alone outrun the whole budget, so NO depth fits. Overflow from
    // there is the fit's job; walking deeper would only shrink the block further for nothing.
    expect(gatherRows(set, 1, 1000)).toBe(162);
    expect(gatherExtent(set, gatherRows(set, 1, 1000)).w).toBe(5 + GATHER_GUTTER * 4);
  });

  it("falls back to the near-square when no band has been measured yet", () => {
    // The first data load packs before any transition frame has run, so there is no budget to
    // solve against; the fit re-packs on the frame it draws.
    expect(gatherRows([{ id: "dag", count: 164 }], 0)).toBe(13); // ceil(√164)
    expect(gatherRows([{ id: "dag", count: 164 }], Number.NaN)).toBe(13);
    // A width with no height still solves — it just can't go past the near-square to do it, which
    // is the old behaviour and is all a caller that never measured a height can honestly ask for.
    expect(gatherRows([{ id: "dag", count: 164 }], 20)).toBe(9);
    expect(gatherRows([{ id: "dag", count: 164 }], 2)).toBe(13);
  });

  it("answers a usable depth for nothing at all", () => {
    expect(gatherRows([], 50, TALL)).toBe(1);
    expect(gatherRows([{ id: "empty", count: 0 }], 50, TALL)).toBe(1);
  });
});

// The spare width goes HERE and nowhere else (user, 2026-08-13): chip size is capped and the
// depth solve has already spent what it can on columns, so what is left over — the solve is
// integer, so there always is some — can only buy space BETWEEN the blocks. These pin that the
// arithmetic is a share-out with both ends closed.
describe("gatherSpread", () => {
  const extent = (w: number, gaps: number): GatherExtent => ({ w, h: 2, gaps });

  it("answers 0 when there is no gap to spend it on", () => {
    expect(gatherSpread(500, extent(4, 0))).toBe(0);
    expect(gatherSpread(500, extent(0, -1))).toBe(0);
  });

  it("answers 0 for a band that is not wider than the packed row", () => {
    expect(gatherSpread(20, extent(20, 1))).toBe(0);
    expect(gatherSpread(5, extent(20, 1))).toBe(0); // a too-narrow band is the FIT's problem
    expect(gatherSpread(Number.NaN, extent(20, 1))).toBe(0);
  });

  it("shares the slack equally between the gaps", () => {
    expect(gatherSpread(26, extent(20, 3))).toBeCloseTo(2, 6);
    expect(gatherSpread(26, extent(20, 6))).toBeCloseTo(1, 6);
  });

  it("caps the total gutter so two networks can't fly to opposite edges", () => {
    expect(gatherSpread(10_000, extent(20, 1))).toBeCloseTo(GATHER_GUTTER_MAX - GATHER_GUTTER, 6);
    expect(GATHER_GUTTER + gatherSpread(10_000, extent(20, 1))).toBeCloseTo(GATHER_GUTTER_MAX, 6);
  });
});

// The extent is what the scene fits into the viewport, so it MUST describe the blocks that
// gatherSlots actually lays out — the two share one packing pass precisely so they can't
// disagree. These tests measure the slots and compare, rather than restating the arithmetic.
describe("gatherExtent", () => {
  const measured = (groups: { id: string; count: number }[], rows: number) => {
    const m = gatherSlots(groups, rows);
    const all = [...m.values()].flat();
    if (!all.length) return { w: 0, h: 0, gaps: 0 };
    // Slots are cell CENTRES (u = left + 0.5, v = -(row + 0.5)), so the edge-to-edge extent is
    // the centre span plus one whole cell.
    const us = all.map((s) => s.u), vs = all.map((s) => s.v);
    return {
      w: Math.max(...us) - Math.min(...us) + 1,
      h: Math.max(...vs) - Math.min(...vs) + 1,
      gaps: groups.filter((g) => g.count > 0).length - 1,
    };
  };

  it("matches the extent of the slots gatherSlots actually places", () => {
    const groups = [
      { id: "dag", count: 164 },
      { id: "dor", count: 20 },
      { id: "paca", count: 12 },
      { id: "ded", count: 3 },
    ];
    for (const rows of [1, 4, 7, 13, 40]) {
      const e = gatherExtent(groups, rows), m = measured(groups, rows);
      expect(e.w).toBeCloseTo(m.w, 6); // summed vs measured: the same width, different float order
      expect({ h: e.h, gaps: e.gaps }).toEqual({ h: m.h, gaps: m.gaps });
    }
  });

  it("counts the gutters between blocks, not around them", () => {
    // Two 2×2 grids: 2 + gutter + 2 cells wide, 2 rows tall.
    expect(gatherExtent([{ id: "a", count: 4 }, { id: "b", count: 4 }], 2)).toEqual({ w: 4 + GATHER_GUTTER, h: 2, gaps: 1 });
  });

  it("is the DEEPEST group's row count, which a group smaller than the depth stays under", () => {
    // 164 at depth 4 → 41 cols × 4 rows; 3 → one column, 3 rows. The band's height is the deeper.
    expect(gatherExtent([{ id: "dag", count: 164 }, { id: "tiny", count: 3 }], 4).h).toBe(4);
    // …and with the DAG filtered out, the deepest is that same little column — never the depth
    // it was allowed, because rows follow the nodes there are.
    expect(gatherExtent([{ id: "tiny", count: 3 }], 4).h).toBe(3);
  });

  it("skips zero-count groups and answers 0×0 for nothing at all", () => {
    expect(gatherExtent([], 3)).toEqual({ w: 0, h: 0, gaps: 0 });
    expect(gatherExtent([{ id: "empty", count: 0 }], 3)).toEqual({ w: 0, h: 0, gaps: 0 });
    expect(gatherExtent([{ id: "x", count: 4 }, { id: "empty", count: 0 }], 2)).toEqual({ w: 2, h: 2, gaps: 0 });
  });
});

// gatherBand answers in FRUSTUM fractions, so these read them back as pixels the way the Engine
// does: a point `f` half-heights above centre lands at viewH/2 · (1 − f) px from the top.
describe("gatherBand", () => {
  // It writes into a caller-provided struct (it is on the frame path), so each call gets its own.
  const band = (viewW: number, viewH: number, railsHidden: boolean) =>
    gatherBand(viewW, viewH, railsHidden, { topFrac: 0, halfWidthFrac: 0, heightFrac: 0 });
  const topPx = (b: { topFrac: number }, viewH: number) => (viewH / 2) * (1 - b.topFrac);
  const halfWidthPx = (b: { halfWidthFrac: number }, viewW: number) => (viewW / 2) * b.halfWidthFrac;

  it("puts the band's top edge on the rail cards' own top, at any viewport height", () => {
    // --rail-top is 90px, and the canvas rides --topbar-extra exactly as the rails do, so the
    // cards' top is 90 canvas-local px whatever the filter strip is doing.
    expect(topPx(band(1600, 950, false), 950)).toBeCloseTo(90, 6);
    expect(topPx(band(390, 780, false), 780)).toBeCloseTo(90, 6);
  });

  it("spans wider with the rails hidden than with them showing", () => {
    const cards = band(1600, 950, false);
    const scene = band(1600, 950, true);
    expect(halfWidthPx(scene, 1600)).toBeGreaterThan(halfWidthPx(cards, 1600) * 1.5);
  });

  it("clears the wider rail on BOTH sides — the band is centred on the screen, not on the gap", () => {
    // Centring on the screen means the band never slides sideways when a rail comes or goes; the
    // price is that the WIDER rail (the right one, --detail-w 320) binds both edges.
    const b = band(1600, 950, false);
    expect(halfWidthPx(b, 1600)).toBeCloseTo(1600 / 2 - (26 + 320) - 24, 6);
  });

  it("ignores the rails below the tier where they stop being inline columns", () => {
    // Under 1100px they are dock sheets over the scene, so there is no column to clear.
    expect(band(900, 800, false)).toEqual(band(900, 800, true));
  });

  it("leaves the LiveStrip's lane free below the band", () => {
    const b = band(1600, 950, false);
    expect(90 + (950 / 2) * b.heightFrac).toBeLessThanOrEqual(950 - 130);
  });

  it("never returns a negative box, however cramped the viewport", () => {
    const b = band(320, 240, false);
    expect(b.halfWidthFrac).toBeGreaterThan(0);
    expect(b.heightFrac).toBeGreaterThanOrEqual(0);
  });
});

// The size half of the rule, pinned where the shape math can see it: the fit's factor starts at 1
// and only ever shrinks (Globe.setGatherFit), so what a band with room to spare can buy is exactly
// two things — a shallower block, then wider gutters. These two are the whole ledger, and neither
// of them is size (user, 2026-08-13, "find a structural fix that does not reappear").
describe("spare width has nowhere to go but the shape", () => {
  const set = [{ id: "dag", count: 162 }, { id: "a", count: 3 }, { id: "b", count: 3 }, { id: "c", count: 3 }, { id: "d", count: 3 }];

  it("gives the wider band a shallower block and wider gutters, at the same pitch", () => {
    // The two presentations at 1600×950, measured live: the railed band against the open one.
    const hud = gatherRows(set, 34.94 / 0.62, 25.77 / 0.62);
    const scene = gatherRows(set, 61.25 / 0.62, 25.77 / 0.62);
    expect(scene).toBeLessThan(hud);
    // Both packs fit their own band, so neither one makes the fit shrink — same chip in both.
    expect(gatherExtent(set, hud).w).toBeLessThanOrEqual(34.94 / 0.62);
    expect(gatherExtent(set, scene).w).toBeLessThanOrEqual(61.25 / 0.62);
    // …and the remainder, which the solve leaves because a column is a whole cell, goes to the gaps.
    expect(gatherSpread(61.25 / 0.62, gatherExtent(set, scene))).toBeGreaterThan(0);
  });
});
