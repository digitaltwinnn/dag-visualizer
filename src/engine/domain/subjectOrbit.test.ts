import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DRAG_SLOP_PX, isDrag, MAX_ELEVATION, orbitAbout, orbitAllowed, orbitAngles, TURN_PER_VIEWPORT } from "./subjectOrbit";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe("orbitAngles — OrbitControls' own rate and signs", () => {
  it("a full viewport height is one full turn on either axis", () => {
    expect(orbitAngles(900, 0, 900).yaw).toBeCloseTo(-TURN_PER_VIEWPORT, 9);
    expect(orbitAngles(0, 900, 900).pitch).toBeCloseTo(-TURN_PER_VIEWPORT, 9);
  });
  it("a press is a drag once it travels past the slop", () => {
    expect(isDrag(DRAG_SLOP_PX, 0)).toBe(false);
    expect(isDrag(DRAG_SLOP_PX + 1, 0)).toBe(true);
  });
});

describe("orbitAbout — a rigid turn of the camera pair about the pivot", () => {
  it("the pivot keeps its place on screen: its camera-space position is unchanged by the turn", () => {
    const pos = v(0, 4.6, 19.2), tgt = v(0, 17.8, 2), pivot = v(0, 6.9, 15.5);
    const cam = new THREE.PerspectiveCamera();
    const before = (p: THREE.Vector3, t: THREE.Vector3) => {
      cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.updateMatrixWorld();
      return pivot.clone().applyMatrix4(cam.matrixWorldInverse);
    };
    const a = before(pos, tgt);
    const oPos = v(0, 0, 0), oTgt = v(0, 0, 0);
    orbitAbout(pos, tgt, pivot, orbitAngles(120, -40, 900), oPos, oTgt);
    const b = before(oPos, oTgt);
    expect(b.distanceTo(a)).toBeLessThan(1e-6);
  });
  it("a rightward drag carries the camera to the left of the pivot; a downward drag raises it", () => {
    const pos = v(0, 0, 10), tgt = v(0, 0, 0), pivot = v(0, 0, 0);
    const oPos = v(0, 0, 0), oTgt = v(0, 0, 0);
    orbitAbout(pos, tgt, pivot, orbitAngles(100, 0, 900), oPos, oTgt);
    expect(oPos.x).toBeLessThan(0);
    orbitAbout(pos, tgt, pivot, orbitAngles(0, 100, 900), oPos, oTgt);
    expect(oPos.y).toBeGreaterThan(0);
  });
  it("about the globe centre at the resting pose it is the plain orbit: the distance to the pivot holds", () => {
    const pos = v(0, 13.5, 44.8), tgt = v(0, 0, 0), pivot = v(0, 0, 0);
    const oPos = v(0, 0, 0), oTgt = v(0, 0, 0);
    orbitAbout(pos, tgt, pivot, orbitAngles(300, 50, 900), oPos, oTgt);
    expect(oPos.length()).toBeCloseTo(pos.length(), 9);
    expect(oTgt.length()).toBeCloseTo(0, 9);
  });
  it("aliasing the outputs onto the inputs is allowed", () => {
    const pos = v(0, 0, 10), tgt = v(0, 0, 0), pivot = v(0, 0, 0);
    orbitAbout(pos, tgt, pivot, orbitAngles(225, 0, 900), pos, tgt);
    expect(pos.length()).toBeCloseTo(10, 9);
  });
});

describe("orbitAllowed — declines the altitude floor and the zenith", () => {
  it("under the floor is declined, above it allowed, and a null floor never declines", () => {
    expect(orbitAllowed(v(0, 0, 17), v(0, 0, 0), 18)).toBe(false);
    expect(orbitAllowed(v(0, 0, 19), v(0, 0, 0), 18)).toBe(true);
    expect(orbitAllowed(v(0, 0, 1), v(0, 0, 0), null)).toBe(true);
  });
  it("looking past the zenith is declined", () => {
    const steep = Math.tan(MAX_ELEVATION + 0.05);
    expect(orbitAllowed(v(0, 0, 0), v(0, steep, 1), null)).toBe(false);
    expect(orbitAllowed(v(0, 0, 0), v(0, Math.tan(MAX_ELEVATION - 0.05), 1), null)).toBe(true);
  });
});
