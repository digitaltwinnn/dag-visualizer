import { describe, it, expect } from "vitest";
import { METAGRAPHS } from "../config";
import {
  LEDGER, LAYER_GEOM, ledgerSite, clusterRadius, ledgerSpread,
  FLOOR_IDS, FLOOR_Y, LANE_HALF_Z, GUTTER_W, GUTTER_CZ, GUTTER_GAP, FLOOR_MAIN_Z0,
  BAR_MAX_W, BAR_MIN_W, BAR_H, BAR_D, BYTE_SCALE_KB,
  CONT_X, CONT_TOP_GAP, CONT_CHIP_Z, CONT_ROW_Y, CONT_PAD, CONT_GAP,
  RAIL_GROUP_FLOOR, laneSpan,
} from "./ledgerLayout";

describe("LAYER_GEOM after the layer-navigation retirement (2026-08-06)", () => {
  it("frames only the two snapshot floors, at their own heights", () => {
    expect(LAYER_GEOM.map((l) => l.id)).toEqual(["msnap", "gl0"]);
    expect(LAYER_GEOM.find((l) => l.id === "msnap")!.y).toBe(FLOOR_Y.msnap);
    expect(LAYER_GEOM.find((l) => l.id === "gl0")!.y).toBe(FLOOR_Y.gl0);
    expect(RAIL_GROUP_FLOOR.meta).toBe("msnap");
    expect(RAIL_GROUP_FLOOR.dag).toBe("gl0");
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

  it("splits the gutter onto its own plane beyond the lane field, screen-right (−Z)", () => {
    expect(FLOOR_MAIN_Z0).toBeLessThan(-LANE_HALF_Z); // the main plane still covers the lane field
    // The gutter plane sits wholly beyond the main plane's edge, past a visible seam.
    expect(GUTTER_GAP).toBeGreaterThan(0);
    expect(GUTTER_CZ + GUTTER_W / 2).toBeCloseTo(FLOOR_MAIN_Z0 - GUTTER_GAP, 6);
    expect(GUTTER_W).toBeCloseTo((2 * LANE_HALF_Z) / 6, 6);
  });

  it("lets the byte bar grow across the whole field", () => {
    expect(BAR_MAX_W).toBeCloseTo(2 * LANE_HALF_Z, 6);
    expect(BAR_MIN_W).toBeGreaterThan(0);
    expect(BAR_MIN_W).toBeLessThan(BAR_MAX_W);
    expect(BAR_H).toBeGreaterThan(0);
    // Depth stays inside one slot so consecutive ticks never touch.
    expect(BAR_D).toBeLessThan(3.6);
  });

  it("carries the baked p99 scale reference in KB", () => {
    expect(BYTE_SCALE_KB).toBe(77);
  });

  it("hangs the node containers under their floor's front edge, facing the camera", () => {
    // The shared container X plane sits camera-side (+X), the frames below the floor plane.
    expect(CONT_X).toBeGreaterThan(0);
    expect(CONT_TOP_GAP).toBeGreaterThan(0);
    // Chip/row pitches and frame chrome are positive and modest against the lane field.
    for (const v of [CONT_CHIP_Z, CONT_ROW_Y, CONT_PAD, CONT_GAP]) expect(v).toBeGreaterThan(0);
    expect(CONT_GAP).toBeLessThan(LANE_HALF_Z);
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
