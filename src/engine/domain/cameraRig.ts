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
  // The Snapshots view is a stack of transparent wireframe FLOORS (layers) on Y. Frame it from an
  // elevated front angle so the stacked planes read in 3D — see LedgerView + config.LEDGER.
  // Default framing: the LEAD (latest block) sits toward the bottom-right, leaving the rest of the
  // view for the trailing chains; looking roughly along -X. Orbit is free.
  ledger: { pos: new THREE.Vector3(31, 14, 20), target: new THREE.Vector3(-17, 1, -2) },
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

// Engine.ts:784 `_updateTween`'s inline ease, lifted verbatim.
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
