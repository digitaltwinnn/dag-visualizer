import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { FOCI, hubFraming, geoFraming, easeInOutQuad } from "./cameraRig";

describe("FOCI", () => {
  it("carries the camera presets (ledger has none — it uses `overview` + a rotated group)", () => {
    expect(FOCI.overview.pos).toEqual(new THREE.Vector3(0, 17, 68)); // pulled back (user: whole scene visible at view start)
    expect(FOCI.overview.target).toEqual(new THREE.Vector3(0, 2, 0));
    expect(FOCI.dag.pos).toEqual(new THREE.Vector3(0, 9, 38));
    expect(FOCI.dag.target).toEqual(new THREE.Vector3(0, 1, 0));
    expect(FOCI.geo.pos).toEqual(new THREE.Vector3(0, 12.5, 41.5)); // pulled back (whole globe inside the rail-free centre)
    // Geo targets the globe CENTRE (manual orbits stay concentric — no wobble).
    expect(FOCI.geo.target).toEqual(new THREE.Vector3(0, 0, 0));
    // Metagraph pose sits between the overview (z 36) and the country framing (z 29..25).
    expect(FOCI.geoNetwork.pos).toEqual(new THREE.Vector3(0, 5, 33));
    // The Snapshots view shares `overview` (no own preset — the ledger GROUP is rotated instead).
    expect(FOCI.ledger).toBeUndefined();
  });
});

describe("hubFraming", () => {
  // Hand-computed from the exact Engine.ts:699-707 formula for a hub at local (36, 4, 0):
  //   out = hub.normalize() = (0.99388373467…, 0.11043152607…, 0)
  //   side = normalize(cross((0,1,0), out)) = (0, 0, -1)
  //   camPos = hub + out*12 + side*-6 + (0,1,0)*5.5
  //          = (47.926604816083426, 10.825178312898158, 5.999999999999999)
  //   target = hub
  it("matches the hand-computed framing for hub local (36, 4, 0)", () => {
    const hub = new THREE.Vector3(36, 4, 0);
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    hubFraming(hub, out);
    expect(out.pos.x).toBeCloseTo(47.926604816083426, 10);
    expect(out.pos.y).toBeCloseTo(10.825178312898158, 10);
    expect(out.pos.z).toBeCloseTo(5.999999999999999, 10);
    expect(out.target.x).toBeCloseTo(36, 10);
    expect(out.target.y).toBeCloseTo(4, 10);
    expect(out.target.z).toBeCloseTo(0, 10);
  });

  it("does not mutate the caller's hubLocalPos", () => {
    const hub = new THREE.Vector3(36, 4, 0);
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    hubFraming(hub, out);
    expect(hub).toEqual(new THREE.Vector3(36, 4, 0));
  });

  it("writes into the SAME out.pos/out.target instances (no new Vector3 allocated)", () => {
    const hub = new THREE.Vector3(10, 0, 0);
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    const posRef = out.pos;
    const targetRef = out.target;
    hubFraming(hub, out);
    expect(out.pos).toBe(posRef);
    expect(out.target).toBe(targetRef);
  });
});

describe("geoFraming", () => {
  // The node-zoom TILT held farther out (user: the old framing read too top-down) —
  // t = smoothstep(R, 0.7, 1.0); only the dolly + target height vary with concentration.
  it("at R=0.7 (t=0, wide end) matches pos (0,1.5,29) / target (0,10.5,2.5)", () => {
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    geoFraming(0.7, out);
    expect(out.pos.x).toBeCloseTo(0, 10);
    expect(out.pos.y).toBeCloseTo(1.5, 10);
    expect(out.pos.z).toBeCloseTo(29, 10);
    expect(out.target.x).toBeCloseTo(0, 10);
    expect(out.target.y).toBeCloseTo(10.5, 10);
    expect(out.target.z).toBeCloseTo(2.5, 10);
  });

  it("at R=1 (t=1, near end) dollies in and lifts the target", () => {
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    geoFraming(1, out);
    expect(out.pos.z).toBeCloseTo(25, 10);
    expect(out.target.y).toBeCloseTo(11.5, 10);
  });

  it("writes into the SAME out.pos/out.target instances (no new Vector3 allocated)", () => {
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    const posRef = out.pos;
    const targetRef = out.target;
    geoFraming(0.8, out);
    expect(out.pos).toBe(posRef);
    expect(out.target).toBe(targetRef);
  });

  it("clamps below the wide end (R<0.7 behaves like R=0.7)", () => {
    const a = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    const b = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    geoFraming(0.2, a);
    geoFraming(0.7, b);
    expect(a.pos).toEqual(b.pos);
    expect(a.target).toEqual(b.target);
  });
});

describe("easeInOutQuad", () => {
  // Engine.ts:784 — `t < 0.5 ? 2*t*t : 1 - (-2*t+2)^2/2`
  it("is 0 at t=0", () => {
    expect(easeInOutQuad(0)).toBe(0);
  });
  it("is 1 at t=1", () => {
    expect(easeInOutQuad(1)).toBe(1);
  });
  it("is 0.5 at t=0.5 (the ease's symmetric midpoint)", () => {
    expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, 10);
  });
  it("matches the inline formula at t=0.25 (accelerating half)", () => {
    const t = 0.25;
    expect(easeInOutQuad(t)).toBeCloseTo(2 * t * t, 12);
  });
  it("matches the inline formula at t=0.75 (decelerating half)", () => {
    const t = 0.75;
    expect(easeInOutQuad(t)).toBeCloseTo(1 - Math.pow(-2 * t + 2, 2) / 2, 12);
  });
});
