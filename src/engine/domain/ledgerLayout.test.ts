import { describe, it, expect } from "vitest";
import { METAGRAPHS } from "../config";
import {
  LEDGER, HYP_SPLIT, LAYER_GEOM, ledgerSite, clusterRadius, ledgerSpread, DIAL_R,
  FLOOR_IDS, FLOOR_Y, LANE_HALF_Z, GUTTER_W, GUTTER_CZ,
  BAR_Z0, BAR_MAX_W, BAR_MIN_W, BAR_H, BAR_D, BYTE_SCALE_KB,
  RAIL_X0, RAIL_PITCH_X, RAIL_Y_LIFT, RAIL_CHIP_PITCH_Z, RAIL_ROW_LIFT, RAIL_CAP,
  RAIL_GROUP_FLOOR, railX, railY, laneSpan,
} from "./ledgerLayout";

describe("LAYER_GEOM", () => {
  it("covers each settlement layer exactly once", () => {
    const ids = LAYER_GEOM.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["ml1", "ml0", "msnap", "hypl0", "hypl1", "gl0"]);
  });

  it("full-width floors have laneZ 0; only the split hypergraph panes are offset", () => {
    for (const l of LAYER_GEOM) {
      if (l.id === "hypl0") expect(l.laneZ).toBeCloseTo(HYP_SPLIT.l0Cz, 10);
      else if (l.id === "hypl1") expect(l.laneZ).toBeCloseTo(HYP_SPLIT.l1Cz, 10);
      else expect(l.laneZ).toBe(0);
    }
  });

  it("heights match the LEDGER rows, ordered top→bottom (split panes share a height)", () => {
    const byId = Object.fromEntries(LAYER_GEOM.map((l) => [l.id, l.y]));
    expect(byId.ml1).toBe(LEDGER.rowML1);
    expect(byId.hypl0).toBe(LEDGER.rowHypL0);
    expect(byId.hypl1).toBe(LEDGER.rowDAGL1);
    expect(byId.hypl1).toBe(byId.hypl0); // the split panes are PEERS at one height
    expect(byId.gl0).toBe(LEDGER.rowGL0);
  });
});

describe("HYP_SPLIT", () => {
  it("the two sub-panes are separated by exactly the gap and tile the full depth", () => {
    expect(HYP_SPLIT.l0Edge - HYP_SPLIT.l1Edge).toBeCloseTo(HYP_SPLIT.gap, 10);
    // pane extents: l1 spans [-depth/2, l1Edge], l0 spans [l0Edge, depth/2]
    const l1D = HYP_SPLIT.l1Edge - -LEDGER.depth / 2;
    const l0D = LEDGER.depth / 2 - HYP_SPLIT.l0Edge;
    expect(l1D + HYP_SPLIT.gap + l0D).toBeCloseTo(LEDGER.depth, 10);
    // each pane's centre sits inside its extent
    expect(HYP_SPLIT.l1Cz).toBeCloseTo((-LEDGER.depth / 2 + HYP_SPLIT.l1Edge) / 2, 10);
    expect(HYP_SPLIT.l0Cz).toBeCloseTo((HYP_SPLIT.l0Edge + LEDGER.depth / 2) / 2, 10);
  });
});

describe("ledgerSite", () => {
  it("spreads lanes symmetrically around z=0 at x=0", () => {
    const n = METAGRAPHS.length;
    for (let i = 0; i < n; i++) {
      const a = ledgerSite(i, n);
      const b = ledgerSite(n - 1 - i, n);
      expect(a.x).toBe(0);
      expect(a.z).toBeCloseTo(-b.z, 10); // mirrored pair
    }
  });
  it("a single lane sits at the centre", () => {
    expect(ledgerSite(0, 1)).toEqual({ x: 0, z: 0 });
  });
});

describe("clusterRadius", () => {
  it("grows with node count but never exceeds the lane-spacing cap", () => {
    const r1 = clusterRadius(1);
    const r20 = clusterRadius(20);
    expect(r20).toBeGreaterThan(r1);
    const laneGap = Math.abs(ledgerSite(1, METAGRAPHS.length).z - ledgerSite(0, METAGRAPHS.length).z);
    expect(clusterRadius(10_000)).toBeLessThanOrEqual(laneGap * 0.46 + 1e-9);
  });
});

describe("DIAL_R (the one fixed station-dial radius)", () => {
  it("matches the documented formula (0.38 of the lane gap)", () => {
    const laneGap = Math.abs(ledgerSite(1, METAGRAPHS.length).z - ledgerSite(0, METAGRAPHS.length).z);
    expect(DIAL_R).toBeCloseTo(laneGap * 0.38, 10);
  });

  it("sits outside clusterRadius's cap, so even a huge group's dots stay inside the dial", () => {
    expect(clusterRadius(10_000)).toBeLessThan(DIAL_R);
  });
});

describe("ledgerSpread (honeycomb + stacks)", () => {
  const r = 3, cell = 0.6, lvl = 0.11;
  it("is deterministic and stays within the given radius", () => {
    for (let k = 0; k < 64; k++) {
      const a = ledgerSpread(k, 64, r, cell, lvl);
      expect(a).toEqual(ledgerSpread(k, 64, r, cell, lvl));
      expect(Math.hypot(a.x, a.z)).toBeLessThanOrEqual(r + 1e-9);
    }
  });
  it("no two chips share a cell on the same level (no overlap)", () => {
    const seen = new Set<string>();
    for (let k = 0; k < 200; k++) {
      const a = ledgerSpread(k, 200, r, cell, lvl);
      const key = `${a.x.toFixed(4)}|${a.y.toFixed(4)}|${a.z.toFixed(4)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
  it("stacks UP in level-pitch multiples once the dial's cells fill", () => {
    // With a tiny dial only the centre cell fits — every node stacks on it.
    for (let k = 0; k < 5; k++) {
      const a = ledgerSpread(k, 5, 0.1, cell, lvl);
      expect(a.x).toBe(0);
      expect(a.z).toBe(0);
      expect(a.y).toBeCloseTo(k * lvl, 9);
    }
  });
  it("a lone node sits at the centre", () => {
    expect(ledgerSpread(0, 1, 5, cell, lvl)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("two-floor chamber (redesign 2026-08-04)", () => {
  it("keeps only the two snapshot layers as floors, at today's heights", () => {
    expect([...FLOOR_IDS]).toEqual(["msnap", "gl0"]);
    expect(FLOOR_Y.msnap).toBe(LEDGER.rowMSnap);
    expect(FLOOR_Y.gl0).toBe(LEDGER.rowGL0);
    // The 13.5-unit separation the ribbons run through is deliberately unchanged.
    expect(FLOOR_Y.msnap - FLOOR_Y.gl0).toBeCloseTo(13.5, 6);
  });

  it("spans the lane field symmetrically about z=0", () => {
    const n = METAGRAPHS.length;
    expect(ledgerSite(0, n).z).toBeCloseTo(-LANE_HALF_Z, 6);
    expect(ledgerSite(n - 1, n).z).toBeCloseTo(LANE_HALF_Z, 6);
  });

  it("puts the gutter outside the lane field, on the screen-right (−Z) side", () => {
    expect(GUTTER_CZ).toBeLessThan(-LANE_HALF_Z);
    expect(GUTTER_CZ + GUTTER_W / 2).toBeLessThanOrEqual(-LANE_HALF_Z + 1e-9);
    expect(GUTTER_W).toBeCloseTo((2 * LANE_HALF_Z) / 6, 6);
  });

  it("starts the byte bar at lane 0's end and can grow across the whole field", () => {
    expect(BAR_Z0).toBeCloseTo(-LANE_HALF_Z, 6);
    expect(BAR_MAX_W).toBeCloseTo(2 * LANE_HALF_Z, 6);
    expect(BAR_MIN_W).toBeGreaterThan(0);
    expect(BAR_MIN_W).toBeLessThan(BAR_MAX_W);
    expect(BAR_H).toBeGreaterThan(0);
    // Depth stays inside one slot so consecutive ticks never touch.
    expect(BAR_D).toBeLessThan(3.6);
  });

  it("carries the baked p99 scale reference in KB", () => {
    expect(BYTE_SCALE_KB).toBe(60);
  });

  it("steps rails toward the camera and stacks overflow rows upward", () => {
    expect(railX(0)).toBeCloseTo(RAIL_X0, 6);
    expect(railX(2)).toBeCloseTo(RAIL_X0 + 2 * RAIL_PITCH_X, 6);
    expect(railY("meta", 0)).toBeCloseTo(FLOOR_Y.msnap + RAIL_Y_LIFT, 6);
    expect(railY("dag", 1)).toBeCloseTo(FLOOR_Y.gl0 + RAIL_Y_LIFT + RAIL_ROW_LIFT, 6);
    expect(RAIL_GROUP_FLOOR.meta).toBe("msnap");
    expect(RAIL_GROUP_FLOOR.dag).toBe("gl0");
    expect(RAIL_CAP).toBe(Math.floor((2 * LANE_HALF_Z) / RAIL_CHIP_PITCH_Z) + 1);
  });

  it("keeps every lane in its own slice with nothing committed", () => {
    const n = METAGRAPHS.length;
    for (let i = 0; i < n; i++) {
      const s = laneSpan(i, n, null);
      expect(s.hidden).toBe(false);
      expect(s.cz).toBeCloseTo(ledgerSite(i, n).z, 6);
      // Each lane owns one slice of the field, so n lanes tile it without overlapping.
      expect(s.hz).toBeCloseTo(LANE_HALF_Z / n, 6);
    }
  });

  it("gives a committed lane the whole floor and takes the others away (spec §5.2)", () => {
    const n = METAGRAPHS.length;
    const on = laneSpan(3, n, 3);
    expect(on.hidden).toBe(false);
    expect(on.cz).toBeCloseTo(0, 6);
    expect(on.hz).toBeCloseTo(LANE_HALF_Z, 6);
    for (const i of [0, 2, 4, n - 1]) {
      expect(laneSpan(i, n, 3).hidden).toBe(true);
    }
  });
});
