import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  RAIL_ORDER, railKindOf, visibleRails, railChipPos, railLayerId, railLit,
  type RailKind,
} from "./ledgerRails";
import { railX, railY, RAIL_CAP, RAIL_CHIP_PITCH_Z, LANE_HALF_Z } from "./ledgerLayout";

const counts = (o: Partial<Record<RailKind, number>>) =>
  new Map<RailKind, number>(Object.entries(o) as [RailKind, number][]);

describe("railKindOf", () => {
  it("partitions machines by make-up, each machine on exactly one rail", () => {
    expect(railKindOf(["l0", "cl1", "dl1"])).toBe("hybrid");
    expect(railKindOf(["l0", "dl1"])).toBe("hybrid");
    expect(railKindOf(["dl1"])).toBe("l1only");
    expect(railKindOf(["cl1"])).toBe("l1only");
    expect(railKindOf(["l0"])).toBe("l0only");
  });

  it("returns null for a machine with no ledger-relevant role", () => {
    expect(railKindOf([])).toBeNull();
    expect(railKindOf(["unknown"])).toBeNull();
  });
});

describe("visibleRails", () => {
  it("keeps the fixed order and hides empty rails so the rest collapse up", () => {
    expect(visibleRails(counts({ l1only: 19, hybrid: 3, l0only: 0 }))).toEqual(["l1only", "hybrid"]);
    expect(visibleRails(counts({ hybrid: 3 }))).toEqual(["hybrid"]);
    // The DAG's own validators: L0-only and L1-only machines, no hybrids — the same rule, a
    // different outcome.
    expect(visibleRails(counts({ l1only: 40, l0only: 160 }))).toEqual(["l1only", "l0only"]);
    expect(visibleRails(counts({}))).toEqual([]);
    expect([...RAIL_ORDER]).toEqual(["l1only", "hybrid", "l0only"]);
  });
});

describe("railChipPos", () => {
  it("lays chips along Z at the rail's own X, centred on the field", () => {
    const out = new THREE.Vector3();
    railChipPos("meta", 1, 0, out);
    expect(out.x).toBeCloseTo(railX(1), 6);
    expect(out.y).toBeCloseTo(railY("meta", 0), 6);
    expect(out.z).toBeCloseTo(-LANE_HALF_Z, 6);
    railChipPos("meta", 1, 2, out);
    expect(out.z).toBeCloseTo(-LANE_HALF_Z + 2 * RAIL_CHIP_PITCH_Z, 6);
  });

  it("wraps an over-long rail into a stacked row rather than running off the floor", () => {
    const out = new THREE.Vector3();
    railChipPos("dag", 0, RAIL_CAP, out);
    expect(out.y).toBeCloseTo(railY("dag", 1), 6);
    expect(out.z).toBeCloseTo(-LANE_HALF_Z, 6);
  });

  it("returns the out vector it was given", () => {
    const out = new THREE.Vector3();
    expect(railChipPos("meta", 0, 0, out)).toBe(out);
  });
});

describe("railLayerId / railLit", () => {
  it("names each rail's own layer, hybrid siding with the L0 that produces the floor below", () => {
    expect(railLayerId("meta", "l1only")).toBe("ml1");
    expect(railLayerId("meta", "hybrid")).toBe("ml0");
    expect(railLayerId("meta", "l0only")).toBe("ml0");
    expect(railLayerId("dag", "l1only")).toBe("hypl1");
    expect(railLayerId("dag", "l0only")).toBe("hypl0");
  });

  it("lights rails by OVERLAP — the hybrid rail answers to both rungs", () => {
    expect(railLit("ml1", "meta", "l1only")).toBe(true);
    expect(railLit("ml1", "meta", "hybrid")).toBe(true);
    expect(railLit("ml1", "meta", "l0only")).toBe(false);
    expect(railLit("ml0", "meta", "l0only")).toBe(true);
    expect(railLit("ml0", "meta", "hybrid")).toBe(true);
    expect(railLit("ml0", "meta", "l1only")).toBe(false);
    expect(railLit("hypl0", "dag", "l0only")).toBe(true);
    expect(railLit("hypl1", "dag", "l1only")).toBe(true);
    // A rung on the other group's floor never lights these rails.
    expect(railLit("hypl0", "meta", "hybrid")).toBe(false);
    expect(railLit("msnap", "meta", "hybrid")).toBe(false);
  });
});
