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
  // Pulled back (60 → 68, user): every view's START pose gets the same zoom-out the globe
  // needs — the whole scene rests inside the rail-free centre of the frame. Shared by the
  // hyper resting pose, the ledger overview and the placeholder idle.
  overview: { pos: new THREE.Vector3(0, 17, 68), target: new THREE.Vector3(0, 2, 0) },
  // The whole DAG core: pulled back enough to frame the outer cL1 (purple) shell (radius 14).
  dag: { pos: new THREE.Vector3(0, 9, 38), target: new THREE.Vector3(0, 1, 0) },
  // Geo targets the globe CENTRE — the downward-tilt composition comes from camera HEIGHT
  // only. An off-centre target made every manual orbit wobble (the globe centre swept a small
  // screen-space circle around the pivot, user bug). The drill/node framings still compose
  // their targets off-centre on purpose (a grab-to-re-centre ease was tried and reverted —
  // user preferred the composed pivots left alone).
  // Pulled back (36 → 41.5, user): the whole globe must rest inside the VISIBLE centre of
  // the frame — the rails carve the sides and the LiveStrip the bottom, so the fit is set by
  // the bottom-strip vertical band, not the raw FOV.
  geo: { pos: new THREE.Vector3(0, 12.5, 41.5), target: new THREE.Vector3(0, 0, 0) },
  // Metagraph-selection pose: rotated-to-densest at a WIDE distance — deliberately farther out
  // than the country framing (geoFraming z 29..25) so the country drill reads as a real zoom-in.
  // Camera held LOW (near the equator plane, like the country/node poses) — a higher camera
  // stacked on the densest-cluster lean read as "viewing the globe from the north" (user).
  geoNetwork: { pos: new THREE.Vector3(0, 5, 33), target: new THREE.Vector3(0, 2, 0) },
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

// Geo selection framing (country drill / metagraph focus): R is the selection's concentration
// (|mean of node dirs|, 0..1) — near-co-located selections zoom in subtly by smoothstepping from
// the wide end (R<=0.7) to the near end (R>=1.0). The POSE is the node-zoom's low-camera TILT
// (user: the old high framing read too top-down) — camera near the equator plane looking up at
// the focused region high on the near face, horizon tilted — but held farther out than the node
// zoom so the COUNTRY carries the frame, not individual stacks.
export function geoFraming(R: number, out: CameraFraming): void {
  const t = THREE.MathUtils.smoothstep(R, 0.7, 1.0);
  out.pos.set(0, 1.5, THREE.MathUtils.lerp(29, 25, t));
  out.target.set(0, THREE.MathUtils.lerp(10.5, 11.5, t), 2.5);
}

// Layer-focus framing (Snapshots view): selecting a settlement layer flies the camera to the nice
// DIAGONAL view of that layer's floor plane — elevated, yawed off-axis from the LEFT so the live
// lead block sits toward the BOTTOM-RIGHT and the old blocks recede to the TOP-LEFT — centred on
// the plane's height `y` (already viewScale'd by the caller). The resting pose stays central/
// untilted; this tilt is an EXPLORATION move (the user can freely orbit from here, like the geo
// drill zoom).
export function ledgerLayerFraming(y: number, out: CameraFraming): void {
  // Close-in framing (user-tuned). The TARGET sits exactly at the lane's LEAD point (x=0, z=0 —
  // the caller shifts pos+target laterally by the focused lane's world x), so the node ring /
  // snapshot cluster projects at the exact screen centre. Earlier x/z target offsets (−6, −9,
  // meant for composition) each pushed the ring right of centre through the diagonal camera —
  // composition now comes from the camera OFFSET alone (left + above → trail recedes top-left).
  out.pos.set(-7, y + 6.2, 23.5); // ~22% closer than the first tuning (user: zoom in a bit more)
  out.target.set(0, y - 1, 0);
}

// Engine.ts:784 `_updateTween`'s inline ease, lifted verbatim.
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
