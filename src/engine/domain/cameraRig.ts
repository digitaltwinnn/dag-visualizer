// Pure camera-framing math shared by the Engine's focus/tween logic (Engine.ts's
// FOCI / _focusFilter / _focusGeo / _updateTween). Extracted verbatim (with source line
// references) as the domain layer for Task 15 — the numbers/behaviour are unchanged.
// Every framing function writes into a caller-provided, pre-allocated `out` struct so the
// Engine's per-focus calls (mousemove-adjacent, filter/country changes) allocate nothing.

import * as THREE from "three";

export interface CameraFraming {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

// Camera presets (ported from ui.js FOCI; Engine.ts:46-56 verbatim).
export const FOCI: Record<string, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  overview: { pos: new THREE.Vector3(0, 15, 60), target: new THREE.Vector3(0, 2, 0) },
  // The whole DAG core: pulled back enough to frame the outer cL1 (purple) shell (radius 14).
  dag: { pos: new THREE.Vector3(0, 9, 38), target: new THREE.Vector3(0, 1, 0) },
  geo: { pos: new THREE.Vector3(0, 11, 36), target: new THREE.Vector3(0, 2, 0) },
  // (The Snapshots view has no camera of its own — it uses `overview`. The ledger GROUP is rotated/
  // tilted/scaled instead, config.viewRotY/viewTiltX/viewScale, so the camera never moves on a switch.)
};

// Scratch — module-scope, reused across every hubFraming() call (never per-call allocation).
const _out = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// Hypergraph metagraph-hub framing (Engine.ts:699-707 `_focusFilter` verbatim): camera pulled
// back along the hub's outward radial, offset sideways and lifted, looking at the hub itself.
// `hubLocalPos` is read-only (never mutated); the result is written into `out.pos`/`out.target`.
export function hubFraming(hubLocalPos: THREE.Vector3, out: CameraFraming): void {
  _out.copy(hubLocalPos).normalize();
  _side.crossVectors(_up, _out).normalize();
  out.pos
    .copy(hubLocalPos)
    .addScaledVector(_out, 12)
    .addScaledVector(_side, -6)
    .addScaledVector(_up, 5.5);
  out.target.copy(hubLocalPos);
}

// Geo selection framing (Engine.ts:671-679 `_focusGeo` verbatim): R is the selection's
// concentration (|mean of node dirs|, 0..1) — near-co-located selections zoom in subtly by
// smoothstepping from the wide end (R<=0.7) to the near end (R>=1.0).
export function geoFraming(R: number, out: CameraFraming): void {
  const t = THREE.MathUtils.smoothstep(R, 0.7, 1.0);
  out.pos.set(0, THREE.MathUtils.lerp(7, 6, t), THREE.MathUtils.lerp(34, 26, t));
  out.target.set(0, THREE.MathUtils.lerp(2, 2.5, t), 7);
}

// Layer-focus framing (Snapshots view): selecting a settlement layer flies the camera to the nice
// DIAGONAL view of that layer's floor plane — elevated, yawed off-axis from the LEFT so the live
// lead block sits toward the BOTTOM-RIGHT and the old blocks recede to the TOP-LEFT — centred on
// the plane's height `y` (already viewScale'd by the caller). The resting pose stays central/
// untilted; this tilt is an EXPLORATION move (the user can freely orbit from here, like the geo
// drill zoom).
export function ledgerLayerFraming(y: number, out: CameraFraming): void {
  // Close-in framing (user-tuned) — the same diagonal, pulled back a touch from the closest cut.
  out.pos.set(-18, y + 12, 16);
  out.target.set(-6, y - 2, -14);
}

// Engine.ts:784 `_updateTween`'s inline ease, lifted verbatim.
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
