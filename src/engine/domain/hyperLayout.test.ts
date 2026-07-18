import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  META_ORBIT, metaAnchor,
  META_LAYERS, META_RING, DAG_L0, DAG_L1, HYPER_TILT, HYPER_TILT_FOCUS, applyHyperRig,
} from "./hyperLayout";

describe("metaAnchor", () => {
  it("is deterministic (same slot in, same anchor out)", () => {
    const a = metaAnchor(3, 10);
    const b = metaAnchor(3, 10);
    expect(a).toEqual(b);
  });

  it("orbits at ≥ the base radius, staggered per slot (i % 4 steps)", () => {
    for (let i = 0; i < 10; i++) {
      const { radius } = metaAnchor(i, 10);
      expect(radius).toBeCloseTo(META_ORBIT + (i % 4) * 3.2, 10);
      expect(radius).toBeGreaterThanOrEqual(META_ORBIT);
    }
  });

  it("distributes slots around the full circle (angle a = i/n · 2π)", () => {
    const n = 10;
    for (let i = 0; i < n; i++) expect(metaAnchor(i, n).a).toBeCloseTo((i / n) * Math.PI * 2, 10);
  });

  it("the xz position matches the returned angle/radius/inclination", () => {
    const { x, z, a, radius, incl } = metaAnchor(5, 10);
    expect(x).toBeCloseTo(Math.cos(a) * radius, 10);
    expect(z).toBeCloseTo(Math.sin(a) * radius * Math.cos(incl), 10);
  });
});

describe("META_LAYERS / META_RING (the per-metagraph armillary atom)", () => {
  it("lists exactly the three layers, inner→outer radius order (L0 < dL1 < cL1, like the DAG)", () => {
    expect(META_LAYERS).toEqual(["l0", "dl1", "cl1"]);
    expect(META_RING.radii.l0).toBeLessThan(META_RING.radii.dl1);
    expect(META_RING.radii.dl1).toBeLessThan(META_RING.radii.cl1);
  });

  it("uses a shallow (near-flat) tilt shared by every ring", () => {
    expect(META_RING.tilt).toBeGreaterThan(0);
    expect(META_RING.tilt).toBeLessThan(Math.PI / 2);
  });
});

describe("DAG_L0 / DAG_L1 (the core's own two shells)", () => {
  it("keeps L1 (native $DAG currency) a clearly separated OUTER shell from L0", () => {
    expect(DAG_L0.radius).toBeLessThan(DAG_L1.radius);
  });

  it("shares one tilt between the two core shells (they must read as one atom)", () => {
    expect(DAG_L0.tilt).toBe(DAG_L1.tilt);
  });

  it("the core sits well clear of the metagraph hub orbit (META_ORBIT), so a hub never overlaps it", () => {
    expect(DAG_L1.radius).toBeLessThan(META_ORBIT);
  });
});

describe("HYPER_TILT / HYPER_TILT_FOCUS (the shared structure tilt)", () => {
  it("both are valid, non-degenerate tilt angles (never edge-on/collapsed, never a right angle)", () => {
    for (const t of [HYPER_TILT, HYPER_TILT_FOCUS]) {
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(Math.PI / 2);
    }
  });

  it("focusing a metagraph eases the structure MUCH flatter than the resting overview tilt", () => {
    expect(HYPER_TILT_FOCUS).toBeLessThan(HYPER_TILT * 0.25);
  });
});

describe("applyHyperRig", () => {
  it("composes tiltX/spinY/0 into the rotation Euler (XYZ order, tilt after spin)", () => {
    const e = new THREE.Euler();
    applyHyperRig({ rotation: e }, 1.2, 0.5);
    expect(e.x).toBe(0.5);
    expect(e.y).toBe(1.2);
    expect(e.z).toBe(0);
  });

  it("defaults tiltX to HYPER_TILT when omitted", () => {
    const e = new THREE.Euler();
    applyHyperRig({ rotation: e }, 0.9);
    expect(e.x).toBe(HYPER_TILT);
    expect(e.y).toBe(0.9);
    expect(e.z).toBe(0);
  });
});
