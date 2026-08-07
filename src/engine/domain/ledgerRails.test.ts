import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { metaTrayLayout, dagTrayLayout, containerChipPos, type ContainerSpec } from "./ledgerRails";
import {
  CONT_X, CONT_TOP_GAP, CONT_CHIP_Z, CONT_ROW_Y, CONT_PAD, CONT_Z0, CONT_Z1,
  FLOOR_Y, LANE_HALF_Z, lanePlaneHalf, ledgerSite,
} from "./ledgerLayout";

const LANES = ["a", "b", "c", "unlisted"] as const;

describe("metaTrayLayout (one tray per metagraph plane, 2026-08-07)", () => {
  it("gives each counted metagraph ONE tray on its own lane, spanning its plane", () => {
    const specs = metaTrayLayout(new Map([["a", 3], ["c", 25]]), LANES);
    expect([...specs.keys()]).toEqual(["a", "c"]);
    const hz = lanePlaneHalf(LANES.length);
    const a = specs.get("a")!;
    expect(a.hz).toBeCloseTo(hz, 6);
    expect(a.cz).toBeCloseTo(ledgerSite(0, LANES.length).z, 6);
    expect(specs.get("c")!.cz).toBeCloseTo(ledgerSite(2, LANES.length).z, 6);
  });

  it("skips laneless counts and machine-less lanes (the unknown lane never gets a tray)", () => {
    const specs = metaTrayLayout(new Map([["a", 0], ["nope", 4], ["unlisted", 2]]), LANES.slice(0, 3));
    expect(specs.size).toBe(0);
  });

  it("hangs under the msnap plane and wraps rows against ITS plane's width", () => {
    const specs = metaTrayLayout(new Map([["c", 25]]), LANES);
    const s = specs.get("c")!;
    const top = FLOOR_Y.msnap - CONT_TOP_GAP;
    expect(s.cy + s.hy).toBeCloseTo(top, 6);
    expect(s.cols).toBe(Math.max(1, Math.floor((2 * s.hz - 2 * CONT_PAD) / CONT_CHIP_Z)));
    expect(s.rows).toBe(Math.ceil(25 / s.cols));
    expect(s.hy).toBeCloseTo((s.rows * CONT_ROW_Y + 2 * CONT_PAD) / 2, 6);
    // The first chip sits inside the frame's top-left corner.
    expect(s.chipY0).toBeCloseTo(top - CONT_PAD - CONT_ROW_Y / 2, 6);
    expect(s.chipZ0).toBeCloseTo(s.cz + s.hz - CONT_PAD - CONT_CHIP_Z / 2, 6);
  });
});

describe("dagTrayLayout (the single validator tray)", () => {
  it("is ONE full-front-width tray under the global floor — machines once, roles ignored", () => {
    const [s] = dagTrayLayout(240);
    expect(s.key).toBe("dag");
    expect(s.count).toBe(240);
    expect(s.cz).toBeCloseTo((CONT_Z0 + CONT_Z1) / 2, 6);
    expect(s.hz).toBeCloseTo((CONT_Z1 - CONT_Z0) / 2, 6);
    expect(2 * s.hz).toBeGreaterThan(2 * LANE_HALF_Z); // full width, not a lane slice
    expect(s.cy + s.hy).toBeCloseTo(FLOOR_Y.gl0 - CONT_TOP_GAP, 6);
  });

  it("returns nothing for an empty fleet", () => {
    expect(dagTrayLayout(0)).toEqual([]);
  });
});

describe("containerChipPos", () => {
  const spec = (): ContainerSpec => dagTrayLayout(9)[0];

  it("fills row-major from the top-left, marching screen-right (−Z)", () => {
    const s = spec();
    const p = new THREE.Vector3();
    containerChipPos(s, 0, p);
    expect(p.x).toBeCloseTo(CONT_X, 6);
    expect(p.y).toBeCloseTo(s.chipY0, 6);
    expect(p.z).toBeCloseTo(s.chipZ0, 6);
    containerChipPos(s, 1, p);
    expect(p.z).toBeCloseTo(s.chipZ0 - CONT_CHIP_Z, 6);
    containerChipPos(s, s.cols, p); // first chip of the second row
    expect(p.y).toBeCloseTo(s.chipY0 - CONT_ROW_Y, 6);
    expect(p.z).toBeCloseTo(s.chipZ0, 6);
  });

  it("reuses the caller's vector", () => {
    const p = new THREE.Vector3();
    expect(containerChipPos(spec(), 3, p)).toBe(p);
  });
});
