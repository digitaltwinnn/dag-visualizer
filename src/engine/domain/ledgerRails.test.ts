import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  ROLE_ORDER, ROLE_CODE, railRolesOf, recordRole, containerLayout, containerChipPos,
  type RailRole, type ContainerSpec,
} from "./ledgerRails";
import {
  CONT_X, CONT_TOP_GAP, CONT_CHIP_Z, CONT_ROW_Y, CONT_PAD, CONT_GAP,
  FLOOR_Y, RAIL_GROUP_FLOOR,
} from "./ledgerLayout";

const counts = (pairs: [RailRole, number][]) => new Map<RailRole, number>(pairs);

describe("role membership (containers 2026-08-06)", () => {
  it("puts a machine in EVERY role container it serves — hybrids duplicated by design", () => {
    expect(railRolesOf("meta", ["l0", "cl1", "dl1"])).toEqual(["l0", "cl1", "dl1"]);
    expect(railRolesOf("meta", ["l0", "dl1"])).toEqual(["l0", "dl1"]);
    expect(railRolesOf("meta", ["dl1"])).toEqual(["dl1"]);
    expect(railRolesOf("meta", [])).toEqual([]);
  });

  it("presents the DAG's currency layer as L1", () => {
    expect(railRolesOf("dag", ["l0", "cl1"])).toEqual(["l0", "l1"]);
    expect(railRolesOf("dag", ["cl1"])).toEqual(["l1"]);
    expect(railRolesOf("dag", ["l0"])).toEqual(["l0"]);
  });

  it("maps ONE record (a (machine, layer) instance) to exactly its own container", () => {
    expect(recordRole("meta", "l0")).toBe("l0");
    expect(recordRole("meta", "cl1")).toBe("cl1");
    expect(recordRole("meta", "dl1")).toBe("dl1");
    expect(recordRole("meta", "other")).toBeNull();
    expect(recordRole("dag", "l0")).toBe("l0");
    expect(recordRole("dag", "cl1")).toBe("l1");
    expect(recordRole("dag", "dl1")).toBe("l1");
  });

  it("orders containers in the user's own listing order with display codes", () => {
    expect([...ROLE_ORDER.meta]).toEqual(["l0", "cl1", "dl1"]);
    expect([...ROLE_ORDER.dag]).toEqual(["l0", "l1"]);
    expect(ROLE_CODE.cl1).toBe("cL1");
  });
});

describe("containerLayout", () => {
  it("hides empty roles and lays the rest side by side, centred on z = 0", () => {
    const specs = containerLayout("meta", counts([["l0", 14], ["dl1", 25]]));
    expect(specs.map((s) => s.role)).toEqual(["l0", "dl1"]); // cl1 empty → hidden
    // Side by side with a gap, screen-left (+Z) first.
    const [a, b] = specs;
    expect(a.cz).toBeGreaterThan(b.cz);
    expect(a.cz - a.hz - (b.cz + b.hz)).toBeCloseTo(CONT_GAP, 6);
    // Centred: the row's extremes are symmetric about z = 0.
    expect(a.cz + a.hz).toBeCloseTo(-(b.cz - b.hz), 6);
  });

  it("hangs under the group's floor, below the frame-top gap", () => {
    for (const group of ["meta", "dag"] as const) {
      const [s] = containerLayout(group, counts([["l0", 6]]));
      const floorY = FLOOR_Y[RAIL_GROUP_FLOOR[group]];
      expect(s.cy + s.hy).toBeCloseTo(floorY - CONT_TOP_GAP, 6);
    }
  });

  it("sizes the frame to the chip grid plus padding", () => {
    const [s] = containerLayout("meta", counts([["l0", 10]]));
    expect(s.rows).toBe(Math.ceil(10 / s.cols));
    expect(s.hz * 2).toBeCloseTo(s.cols * CONT_CHIP_Z + 2 * CONT_PAD, 6);
    expect(s.hy * 2).toBeCloseTo(s.rows * CONT_ROW_Y + 2 * CONT_PAD, 6);
  });
});

describe("containerChipPos", () => {
  const spec = (): ContainerSpec => containerLayout("meta", counts([["l0", 7]]))[0];

  it("fills columns along −Z then wraps to the next row down", () => {
    const s = spec();
    const p0 = containerChipPos(s, 0, new THREE.Vector3());
    const p1 = containerChipPos(s, 1, new THREE.Vector3());
    const pw = containerChipPos(s, s.cols, new THREE.Vector3());
    expect(p0.x).toBeCloseTo(CONT_X, 6);
    expect(p1.z).toBeCloseTo(p0.z - CONT_CHIP_Z, 6);
    expect(p1.y).toBeCloseTo(p0.y, 6);
    expect(pw.y).toBeCloseTo(p0.y - CONT_ROW_Y, 6);
    expect(pw.z).toBeCloseTo(p0.z, 6);
  });

  it("keeps every chip inside its container frame", () => {
    const s = spec();
    const p = new THREE.Vector3();
    for (let k = 0; k < s.count; k++) {
      containerChipPos(s, k, p);
      expect(Math.abs(p.z - s.cz)).toBeLessThanOrEqual(s.hz + 1e-9);
      expect(Math.abs(p.y - s.cy)).toBeLessThanOrEqual(s.hy + 1e-9);
    }
  });
});
