import { describe, it, expect } from "vitest";
import { METAGRAPHS } from "../config";
import { LEDGER, HYP_SPLIT, LAYER_GEOM, ledgerSite, clusterRadius, ledgerSpread } from "./ledgerLayout";

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

describe("ledgerSpread", () => {
  it("is deterministic and stays within the given radius", () => {
    const r = 3;
    for (let k = 0; k < 24; k++) {
      const a = ledgerSpread(k, 24, r);
      expect(a).toEqual(ledgerSpread(k, 24, r));
      expect(Math.hypot(a.x, a.z)).toBeLessThanOrEqual(r + 1e-9);
    }
  });
  it("a lone node sits at the centre", () => {
    expect(ledgerSpread(0, 1, 5)).toEqual({ x: 0, z: 0 });
  });
});
