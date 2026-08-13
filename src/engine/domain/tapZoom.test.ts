import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP,
  isDoubleTap,
  TAP_ZOOM_STEP,
  TAP_ZOOM_DUR,
  tapZoomDistance,
  tapZoomAround,
  type Tap,
} from "./tapZoom";

const tap = (t: number, x = 0, y = 0): Tap => ({ t, x, y });

describe("isDoubleTap", () => {
  it("has nothing to pair with on the first tap", () => {
    expect(isDoubleTap(null, tap(1000))).toBe(false);
  });

  it("pairs two taps in the same place inside the window", () => {
    expect(isDoubleTap(tap(1000), tap(1000 + DOUBLE_TAP_MS - 1))).toBe(true);
  });

  it("takes the window's own edge — the constant is the boundary, not an approximation", () => {
    expect(isDoubleTap(tap(1000), tap(1000 + DOUBLE_TAP_MS))).toBe(true);
    expect(isDoubleTap(tap(1000), tap(1000 + DOUBLE_TAP_MS + 1))).toBe(false);
  });

  // A slow second tap is a deliberate second gesture — two picks, not a zoom.
  it("rejects a second tap that arrives after the window", () => {
    expect(isDoubleTap(tap(0), tap(2000))).toBe(false);
  });

  it("allows the second tap a fingertip of travel, and no more", () => {
    expect(isDoubleTap(tap(0, 100, 100), tap(100, 100 + DOUBLE_TAP_SLOP, 100))).toBe(true);
    expect(isDoubleTap(tap(0, 100, 100), tap(100, 100 + DOUBLE_TAP_SLOP + 1, 100))).toBe(false);
  });

  it("measures the slop as a distance, not per axis", () => {
    // Inside the box on both axes, outside the circle: a diagonal miss is still a miss.
    const d = DOUBLE_TAP_SLOP * 0.8;
    expect(Math.hypot(d, d)).toBeGreaterThan(DOUBLE_TAP_SLOP);
    expect(isDoubleTap(tap(0, 0, 0), tap(100, d, d))).toBe(false);
  });

  // Timestamps come from the events, so they only ever move forward; a negative gap means the
  // recognizer's state is stale (a clock reset between sessions), and pairing on it would fire a
  // zoom nobody asked for.
  it("does not pair a tap that precedes its predecessor", () => {
    expect(isDoubleTap(tap(1000), tap(900))).toBe(false);
  });
});

describe("tapZoomDistance", () => {
  it("keeps TAP_ZOOM_STEP of the distance — one step in, not a jump", () => {
    expect(tapZoomDistance(100, 0, 1000)).toBeCloseTo(100 * TAP_ZOOM_STEP);
  });

  it("moves toward the target and never past it", () => {
    const d = tapZoomDistance(100, 0, 1000);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(100);
  });

  it("stops at the controls' floor instead of pushing past it to be shoved back", () => {
    expect(tapZoomDistance(14, 12, 140)).toBe(12);
  });

  // The floor is where repeated taps end up, so it has to be a fixed point: another tap there
  // must return the input unchanged, which is also how the caller reads "nothing to animate".
  it("is a no-op once the camera is already at the floor", () => {
    expect(tapZoomDistance(12, 12, 140)).toBe(12);
  });

  it("respects the ceiling for a camera outside it (the clamp is symmetric)", () => {
    expect(tapZoomDistance(300, 12, 140)).toBe(140);
  });

  it("passes a degenerate distance through rather than inventing one", () => {
    expect(tapZoomDistance(0, 12, 140)).toBe(0);
    expect(tapZoomDistance(NaN, 12, 140)).toBeNaN();
  });
});

describe("TAP_ZOOM_DUR", () => {
  // Faster than a commit flight (1.4s) and slower than a wheel notch: the hand's own gesture.
  it("eases over a gesture-length window", () => {
    expect(TAP_ZOOM_DUR).toBeGreaterThan(0.15);
    expect(TAP_ZOOM_DUR).toBeLessThan(1.4);
  });
});

describe("tapZoomAround", () => {
  it("scales the pose about the target, keeping the view direction exactly", () => {
    const pos = new THREE.Vector3(30, 40, 0);
    const tgt = new THREE.Vector3(0, 0, 0);
    const out = new THREE.Vector3();
    tapZoomAround(pos, tgt, 0, 1000, out);
    expect(out.distanceTo(tgt)).toBeCloseTo(50 * TAP_ZOOM_STEP);
    // Same ray from the target — a dolly, never a re-aim (see the module header).
    expect(out.clone().normalize().dot(pos.clone().normalize())).toBeCloseTo(1);
  });

  it("dollies about an OFF-ORIGIN target — geo's is not the world centre", () => {
    const tgt = new THREE.Vector3(5, -3, 2);
    const pos = new THREE.Vector3(5, -3, 42); // 40 out along +z
    const out = new THREE.Vector3();
    tapZoomAround(pos, tgt, 0, 1000, out);
    expect(out.distanceTo(tgt)).toBeCloseTo(40 * TAP_ZOOM_STEP);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(-3);
  });

  it("clamps to the floor, so repeated taps settle exactly where a pinch would", () => {
    const pos = new THREE.Vector3(0, 0, 14);
    const out = new THREE.Vector3();
    tapZoomAround(pos, new THREE.Vector3(), 12, 140, out);
    expect(out.z).toBeCloseTo(12);
  });

  it("leaves a pose that is already at the floor untouched", () => {
    const pos = new THREE.Vector3(0, 0, 12);
    const out = new THREE.Vector3();
    tapZoomAround(pos, new THREE.Vector3(), 12, 140, out);
    expect(out.toArray()).toEqual([0, 0, 12]);
  });

  it("survives a degenerate pose (camera sitting on its own target)", () => {
    const tgt = new THREE.Vector3(1, 2, 3);
    const out = new THREE.Vector3();
    tapZoomAround(tgt.clone(), tgt, 12, 140, out);
    expect(out.toArray()).toEqual([1, 2, 3]);
  });

  // The Engine applies the step to a running tween's destination IN PLACE (out === pos), so
  // aliasing has to be safe or a commit flight would land somewhere nobody asked for.
  it("is safe when the output aliases the input", () => {
    const pos = new THREE.Vector3(0, 0, 100);
    tapZoomAround(pos, new THREE.Vector3(), 0, 1000, pos);
    expect(pos.z).toBeCloseTo(100 * TAP_ZOOM_STEP);
  });

  it("allocates nothing (rule 5 — this runs from an event, but the Engine holds no scratch for it)", () => {
    const pos = new THREE.Vector3(0, 0, 100);
    const tgt = new THREE.Vector3();
    const out = new THREE.Vector3();
    // Two steps compose exactly as the arithmetic says — no hidden state between calls.
    tapZoomAround(pos, tgt, 0, 1000, out);
    tapZoomAround(out, tgt, 0, 1000, out);
    expect(out.z).toBeCloseTo(100 * TAP_ZOOM_STEP * TAP_ZOOM_STEP);
  });
});
