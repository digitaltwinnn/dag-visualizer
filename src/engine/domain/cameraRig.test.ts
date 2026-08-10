import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { FOCI, hubFraming, geoFraming, ledgerFloorFraming, ledgerRailFraming, ledgerCommitTilt, LEDGER_TILT_YAW, LEDGER_TILT_PITCH, LEDGER_TILT_DOLLY, easeInOutQuad, CAM_ZOOM, dollyBack, RAILS_HIDDEN_DOLLY, railsDolly, nodeFraming, cohortFraming, hyperNodeFraming, closeness, CLOSE_FAR_ALT, CLOSE_NEAR_ALT, NODE_RAISE } from "./cameraRig";

// The Snapshots POSES that used to be pinned here are gone with the poses themselves (2026-08-09):
// `ledgerNodeFraming` (the tray-chip zoom) and `ledgerLaneNudge` (the lateral commit nudge) are
// retired — the view has one pose, `FOCI.ledger`, and colour carries every commit. Its one
// variation is `ledgerCommitTilt`, the commit ORBIT, pinned below. See the ⚠️ note above
// `ledgerFloorFraming` in cameraRig.ts; the floor/rail poses are the same kind of leftover, still
// pinned only because they're still exported.

describe("FOCI", () => {
  it("carries the camera presets (ledger gained its own frontal resting pose, 2026-08-07)", () => {
    // The Snapshots view rests FRONTAL and zoomed (user) — straight onto the chamber's face.
    // Lowered by a uniform 4.5 on BOTH pos.y and target.y (user, 2026-08-09): a pure frustum
    // translation, so the ~6° pitch is untouched and the chamber centres in the HUD's band.
    expect(FOCI.ledger.pos).toEqual(new THREE.Vector3(0, -1, 54));
    expect(FOCI.ledger.target).toEqual(new THREE.Vector3(0, -7, 0));
    expect(FOCI.overview.pos).toEqual(new THREE.Vector3(0, 21, 80)); // pulled back again with META_ORBIT 29 (user: whole ring visible unselected, clear of the LiveStrip band)
    expect(FOCI.overview.target).toEqual(new THREE.Vector3(0, 2, 0));
    expect(FOCI.dag.pos).toEqual(new THREE.Vector3(0, 9, 38));
    expect(FOCI.dag.target).toEqual(new THREE.Vector3(0, 1, 0));
    // Pulled back once more (×1.08 around the target, user 2026-08-09) — the composition is
    // preserved because pos is scaled about the target, only the fit changes.
    expect(FOCI.geo.pos).toEqual(new THREE.Vector3(0, 13.5, 44.8));
    // Geo targets the globe CENTRE (manual orbits stay concentric — no wobble).
    expect(FOCI.geo.target).toEqual(new THREE.Vector3(0, 0, 0));
    // Metagraph pose sits between the overview (z 36) and the country framing (z 29..25).
    expect(FOCI.geoNetwork.pos).toEqual(new THREE.Vector3(0, 5, 33));
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

describe("dollyBack (the one global zoom lever)", () => {
  it("pushes the position out from its target by CAM_ZOOM, leaving the target fixed", () => {
    const pos = new THREE.Vector3(0, 0, 10);
    const target = new THREE.Vector3(0, 0, 2);
    const out = new THREE.Vector3();
    dollyBack(pos, target, out);
    expect(out.z).toBeCloseTo(2 + (10 - 2) * CAM_ZOOM, 9);
    // inputs untouched (the Engine hands it preset vectors)
    expect(pos.z).toBe(10);
    expect(target.z).toBe(2);
  });
});

describe("railsDolly (the rails-hidden camera lean, 2026-08-08)", () => {
  it("leans IN toward the pose's target by RAILS_HIDDEN_DOLLY, leaving the target fixed", () => {
    const pos = new THREE.Vector3(0, 0, 12);
    const target = new THREE.Vector3(0, 0, 2);
    const out = new THREE.Vector3();
    railsDolly(pos, target, out);
    expect(out.z).toBeCloseTo(2 + 10 * RAILS_HIDDEN_DOLLY, 9);
    expect(pos.z).toBe(12); // inputs untouched
    expect(target.z).toBe(2);
  });
  it("is safe to compose IN PLACE (outPos === pos — the Engine leans tween destinations)", () => {
    const pos = new THREE.Vector3(3, 4, 12);
    const target = new THREE.Vector3(1, 0, 2);
    const expected = new THREE.Vector3();
    railsDolly(pos, target, expected);
    railsDolly(pos, target, pos); // in place
    expect(pos.distanceTo(expected)).toBeLessThan(1e-12);
  });
});

describe("nodeFraming (the geo node pose — ABSOLUTE, dolly-exempt)", () => {
  it("is the one live-tuned pose: camera above the equator plane, axis aimed above the node", () => {
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    nodeFraming(out);
    expect(out.pos).toEqual(new THREE.Vector3(0, 4.6, 19.2));
    expect(out.target).toEqual(new THREE.Vector3(0, 19.5, 2));
  });
});

describe("cohortFraming (the geo COHORT/provider pose)", () => {
  it("sits BETWEEN the country band and the node pose (the ladder's zoom order)", () => {
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    cohortFraming(out);
    const cohortDist = out.pos.length();
    nodeFraming(out);
    const nodeDist = out.pos.length();
    // Wider than the node pose, tighter than the country framing floor (countryShape dist ≥ 4.3
    // from R≈15-based math — assert against the node pose + the geoNetwork preset instead).
    expect(cohortDist).toBeGreaterThan(nodeDist);
    expect(cohortDist).toBeLessThan(FOCI.geoNetwork.pos.length());
  });
});

describe("NODE_RAISE (the Globe.focusNode lean-raise contract paired with nodeFraming)", () => {
  it("is a fraction in (0,1) — a partial, uncapped lean raise, not a full flip", () => {
    expect(NODE_RAISE).toBeGreaterThan(0);
    expect(NODE_RAISE).toBeLessThan(1);
  });
  it("is the exact documented value the nodeFraming pose above is solved against", () => {
    expect(NODE_RAISE).toBeCloseTo(0.42, 10);
  });
});

describe("hyperNodeFraming", () => {
  it("pulls back along the node's outward radial, lifted, looking at the node", () => {
    const node = new THREE.Vector3(0, 0, 20);
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    hyperNodeFraming(node, out);
    expect(out.target).toEqual(node);
    expect(out.pos.z).toBeCloseTo(29, 9); // 20 + 9 along the radial
    expect(out.pos.y).toBeCloseTo(3, 9);  // the lift
  });
});

describe("closeness (camera altitude → surface-sharpening factor)", () => {
  it("is 0 at/beyond the far band, 1 at/inside the near band, linear between", () => {
    expect(closeness(CLOSE_FAR_ALT)).toBe(0);
    expect(closeness(CLOSE_FAR_ALT + 10)).toBe(0);
    expect(closeness(CLOSE_NEAR_ALT)).toBe(1);
    expect(closeness(CLOSE_NEAR_ALT - 5)).toBe(1);
    expect(closeness((CLOSE_FAR_ALT + CLOSE_NEAR_ALT) / 2)).toBeCloseTo(0.5, 9);
  });
});

describe("ledgerCommitTilt (the Snapshots commit ORBIT, 2026-08-09)", () => {
  const pos = () => FOCI.ledger.pos.clone();
  const tgt = () => FOCI.ledger.target.clone();

  it("is an ORBIT about the target, not a lateral translation — the retired lane nudge's whole failure", () => {
    // The distinction is the reason this framing is allowed where `ledgerLaneNudge` was retired: a
    // translation walks the symmetric field's far end out of frame, an orbit only changes the angle.
    // So the ONLY radial change is the documented dolly factor, and the azimuth moves by the yaw.
    const out = new THREE.Vector3();
    ledgerCommitTilt(pos(), tgt(), out);
    const before = new THREE.Spherical().setFromVector3(pos().sub(tgt()));
    const after = new THREE.Spherical().setFromVector3(out.clone().sub(tgt()));
    expect(after.radius).toBeCloseTo(before.radius * LEDGER_TILT_DOLLY, 9);
    expect(after.theta).toBeCloseTo(before.theta + LEDGER_TILT_YAW, 9);
    expect(after.phi).toBeCloseTo(before.phi - LEDGER_TILT_PITCH, 9);
  });

  it("swings toward +X and RISES (a three-quarter view looking a little further down)", () => {
    const out = new THREE.Vector3();
    ledgerCommitTilt(pos(), tgt(), out);
    expect(out.x).toBeGreaterThan(FOCI.ledger.pos.x); // lanes spread on X (LEDGER.viewRotY)
    expect(out.y).toBeGreaterThan(FOCI.ledger.pos.y); // phi − pitch lifts the camera
  });

  it("stays MODEST — a nicer 3D read, not a new pose (the flat edge labels must stay legible)", () => {
    expect(LEDGER_TILT_YAW).toBeGreaterThan(0);
    expect(LEDGER_TILT_YAW).toBeLessThan(Math.PI / 6); // < 30°
    expect(LEDGER_TILT_PITCH).toBeGreaterThan(0);
    expect(LEDGER_TILT_PITCH).toBeLessThan(LEDGER_TILT_YAW); // the yaw leads, the pitch supports
    expect(LEDGER_TILT_DOLLY).toBeGreaterThan(1); // never closer than the frontal pose
  });

  it("is safe to compose IN PLACE (outPos === pos — the Engine tweens from a preset)", () => {
    const expected = new THREE.Vector3();
    ledgerCommitTilt(pos(), tgt(), expected);
    const p = pos();
    ledgerCommitTilt(p, tgt(), p);
    expect(p.distanceTo(expected)).toBeLessThan(1e-12);
  });
});

describe("ledger framings (two-floor chamber)", () => {
  it("frames a floor on the same diagonal the layer focus always used", () => {
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    ledgerFloorFraming(4, out);
    expect(out.pos.toArray()).toEqual([-7, 10.2, 23.5]);
    expect(out.target.toArray()).toEqual([0, 3, 0]);
  });

  it("frames a rail from in front of it, looking along the field", () => {
    const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    ledgerRailFraming(3.2, 2.85, out);
    // In front of the rail (further toward the camera) and slightly above it.
    expect(out.pos.z).toBeGreaterThan(0);
    expect(out.pos.y).toBeGreaterThan(2.85);
    expect(out.target.x).toBeCloseTo(0, 6);
    expect(out.target.y).toBeCloseTo(2.85, 6);
    // The rail runs across Z, so the pose must not be pushed off to one end of it.
    expect(out.target.z).toBeCloseTo(0, 6);
  });
});
