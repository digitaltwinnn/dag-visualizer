import { describe, it, expect } from "vitest";
import { METAGRAPHS } from "@/src/net/current";
import {
  LEDGER, LAYER_GEOM, ledgerSite, clusterRadius, ledgerSpread,
  FLOOR_IDS, FLOOR_Y, LANE_HALF_Z, PLANE_FIELD_HALF,
  BAR_MAX_W, BAR_MIN_W, BAR_H, BAR_D, BYTE_SCALE_KB, BYTE_SCALE_KB_BY_NET, BAR_EDGE_MARGIN,
  CONT_X, CONT_TOP_GAP, CONT_CHIP_Z, CONT_ROW_Y, CONT_PAD, CONT_Z0, CONT_Z1,
  LEAD_X, TILE_LIFT, BAR_LIFT,
  FLOOR_W, FLOOR_CX, FLOOR_FRONT_X, FLOOR_BACK_X,
  LANE_PLANE_GAP, lanePlaneHalf, laneSpan,
} from "./ledgerLayout";

describe("LAYER_GEOM after the layer-navigation retirement (2026-08-06)", () => {
  it("frames only the two snapshot floors, at their own heights", () => {
    expect(LAYER_GEOM.map((l) => l.id)).toEqual(["msnap", "gl0"]);
    expect(LAYER_GEOM.find((l) => l.id === "msnap")!.y).toBe(FLOOR_Y.msnap);
    expect(LAYER_GEOM.find((l) => l.id === "gl0")!.y).toBe(FLOOR_Y.gl0);
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
  // The two properties, asserted separately because only ONE of them is observable at the shipped
  // catalog size: with 11 metagraphs the lane step is narrow enough that the cap binds at EVERY
  // count (it already bound from count 2 at 10 — the growth term's last visible count was 1, whose
  // radius `ledgerSpread` never reads, since `cnt <= 1` returns the centre cell). So the growth term
  // is the guard for a SMALLER catalog, not the shipped look, and the shipped look is the cap. A
  // strict `r20 > r1` therefore asserts the catalog's size, not the layout's design.
  it("never shrinks as the node count grows", () => {
    let prev = 0;
    for (const n of [1, 2, 3, 20, 160, 10_000]) {
      const r = clusterRadius(n);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
  it("never exceeds the lane-spacing cap, however large the group", () => {
    const laneGap = Math.abs(ledgerSite(1, METAGRAPHS.length).z - ledgerSite(0, METAGRAPHS.length).z);
    expect(clusterRadius(10_000)).toBeLessThanOrEqual(laneGap * 0.46 + 1e-9);
    // …and the cap is what a real fleet gets, so a lane added to the catalog narrows every tray
    // rather than letting the widest one spill into its neighbour.
    expect(clusterRadius(160)).toBe(clusterRadius(10_000));
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

  it("centres the plane field about z=0 — the global plane sits right beneath the lanes", () => {
    // The field half covers the outermost lane's plane exactly (site + its plane half).
    const n = METAGRAPHS.length + 1;
    expect(PLANE_FIELD_HALF).toBeCloseTo(LANE_HALF_Z + lanePlaneHalf(n), 6);
    expect(PLANE_FIELD_HALF).toBeGreaterThan(LANE_HALF_Z);
  });

  it("lets the byte bar grow across the field, clear of the ordinal labels", () => {
    expect(BAR_MAX_W).toBeCloseTo(2 * (LANE_HALF_Z - BAR_EDGE_MARGIN), 6);
    expect(BAR_EDGE_MARGIN).toBeGreaterThan(0);
    expect(BAR_MIN_W).toBeGreaterThan(0);
    expect(BAR_MIN_W).toBeLessThan(BAR_MAX_W);
    expect(BAR_H).toBeGreaterThan(0);
    // Depth stays inside one slot so consecutive ticks never touch.
    expect(BAR_D).toBeLessThan(3.6);
  });

  it("carries the baked scale reference in KB (~p70 — the user prefers full-and-clipping over sliver bars)", () => {
    expect(BYTE_SCALE_KB).toBe(150);
    // Under Node the resolver answers mainnet, so the live constant IS the mainnet row; the
    // dev rows keep the mainnet reference until a bake finds honest traffic (see the source).
    expect(BYTE_SCALE_KB).toBe(BYTE_SCALE_KB_BY_NET.mainnet);
    for (const v of Object.values(BYTE_SCALE_KB_BY_NET)) expect(v).toBeGreaterThan(0);
  });

  it("hangs the node trays under their plane's front edge, facing the camera", () => {
    // The shared tray X plane sits camera-side (+X), the frames below the floor plane.
    expect(CONT_X).toBeGreaterThan(0);
    expect(CONT_TOP_GAP).toBeGreaterThan(0);
    // Chip/row pitches and frame chrome are positive and modest against the lane field.
    for (const v of [CONT_CHIP_Z, CONT_ROW_Y, CONT_PAD]) expect(v).toBeGreaterThan(0);
    // The DAG validator tray spans the global plane's full front width, inset SYMMETRICALLY.
    expect(CONT_Z0).toBeCloseTo(-CONT_Z1, 6);
    expect(CONT_Z1).toBeLessThan(PLANE_FIELD_HALF);
    expect(CONT_Z1 - CONT_Z0).toBeGreaterThan(2 * LANE_HALF_Z);
  });

  it("gives each lane its own plane, gapped, inside its slice (2026-08-07)", () => {
    const n = METAGRAPHS.length + 1; // the unknown lane included
    expect(LANE_PLANE_GAP).toBeGreaterThan(0);
    expect(lanePlaneHalf(n)).toBeGreaterThan(0);
    expect(lanePlaneHalf(n)).toBeLessThan(LANE_HALF_Z / (n - 1));
    // Neighbouring planes never touch: centre distance ≥ plane width + gap.
    const d = Math.abs(ledgerSite(1, n).z - ledgerSite(0, n).z);
    expect(d).toBeCloseTo(2 * lanePlaneHalf(n) + LANE_PLANE_GAP, 6);
  });

  it("leads the time trail toward the camera-side floor edge", () => {
    // The lead slot sits well forward of centre but inside the floors' front edge (~6.5 local).
    expect(LEAD_X).toBeGreaterThan(0);
    expect(LEAD_X).toBeLessThan(6.5);
  });

  it("floats the snapshots just above their planes (bottoms never pierce the glass)", () => {
    expect(TILE_LIFT).toBeGreaterThan(0);
    expect(BAR_LIFT).toBeGreaterThan(0);
    expect(Math.max(TILE_LIFT, BAR_LIFT)).toBeLessThan(0.5);
  });

  it("keeps every lane in its own FIXED slice — a filter never moves or hides lanes (user reversal 2026-08-07)", () => {
    const n = METAGRAPHS.length + 1; // the roster incl. the unknown lane
    for (let i = 0; i < n; i++) {
      const s = laneSpan(i, n);
      expect(s.cz).toBeCloseTo(ledgerSite(i, n).z, 6);
      // Each lane owns one slice of the field, so n lanes tile it without overlapping.
      expect(s.hz).toBeCloseTo(LANE_HALF_Z / n, 6);
    }
  });
});

describe("the glass footprint (promoted out of LedgerView 2026-08-19)", () => {
  it("gives the chamber ONE front rim and one back rim, centred on FLOOR_CX", () => {
    expect(FLOOR_FRONT_X).toBe(FLOOR_CX + FLOOR_W / 2);
    expect(FLOOR_BACK_X).toBe(FLOOR_CX - FLOOR_W / 2);
    expect(FLOOR_FRONT_X - FLOOR_BACK_X).toBe(FLOOR_W);
  });

  it("leaves the lead slot standing on glass, well inside the front rim", () => {
    // The trail's front boundary is derived from this rim (ledgerModel's FRONT_INK_X), so a rim
    // that fell behind the lead would dissolve the live row on arrival.
    expect(LEAD_X).toBeLessThan(FLOOR_FRONT_X);
    expect(FLOOR_FRONT_X - LEAD_X).toBeGreaterThan(BAR_D / 2);
  });
});
