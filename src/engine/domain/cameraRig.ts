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
  // Pulled back 68 → 76 with META_ORBIT 25 → 29 (user, 2026-07-17) so the widened hub ring
  // still fits the frame with no selection.
  overview: { pos: new THREE.Vector3(0, 21, 80), target: new THREE.Vector3(0, 2, 0) },
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

// ---- the ONE global zoom lever ------------------------------------------------------------
// Dolly every preset/framing back by CAM_ZOOM (the position pushed out from its target) — one
// lever so all views sit a touch wider without re-tuning each pose (user). The Engine applies
// it through dollyBack() in its camera tween; `nodeFraming` is the one deliberate EXEMPTION:
// its look-at is a composed point far up the globe's face (not the subject), so dollying
// along that axis drags the camera away from the node instead of widening the shot — its
// numbers are ABSOLUTE. Any new pose with a composed (non-subject) target must decide this
// explicitly.
export const CAM_ZOOM = 1.15;
export function dollyBack(pos: THREE.Vector3, target: THREE.Vector3, outPos: THREE.Vector3): void {
  outPos.subVectors(pos, target).multiplyScalar(CAM_ZOOM).add(target);
}

// ---- the geo NODE pose ----------------------------------------------------------------------
// The lean raise Globe.focusNode applies when aiming a node to the front: with the UNCAPPED
// lean, every node arrives at the SAME residual elevation (latitude-independent — a tilt cap
// made Helsinki read flatter than Nuremberg, user), which is what lets nodeFraming be ONE
// fixed pose. The two are a CONTRACT: change NODE_RAISE and the framing numbers below must be
// re-solved together.
export const NODE_RAISE = 0.42;
// The node pose (iterated live with the user): node ≈ (0, 6.9, 15.5) after the raise; the
// camera sits slightly above the equator plane ~4.5 units out, and the axis aims ~9° above
// the node so its GROUND position rides the LOWER-third line (tall co-located stacks grow up
// from it). ABSOLUTE — deliberately not dollied (see CAM_ZOOM above).
export function nodeFraming(out: CameraFraming): void {
  out.pos.set(0, 4.6, 19.2);
  out.target.set(0, 19.5, 2);
}

// ---- the geo COHORT/provider pose ----------------------------------------------------------
// One rung wider than the node pose (spec Part 4): frames the whole honeycomb stack field of
// a committed city×provider cohort. Rides the SAME Globe lean contract as nodeFraming
// (focusCohort aims the cohort centroid with the NODE_RAISE lift), so like nodeFraming it is
// ABSOLUTE / CAM_ZOOM-dolly-EXEMPT (composed far-up look-at — see the CAM_ZOOM note).
// Seed values tuned live against Falkenstein·Hetzner (the tallest stack field).
export function cohortFraming(out: CameraFraming): void {
  out.pos.set(0, 5.4, 23.5);
  out.target.set(0, 18.8, 2);
}

// ---- the hyper NODE pose --------------------------------------------------------------------
// Fly to a node's live shell point: pulled back along its outward radial, lifted a touch,
// looking at the node itself (Engine's `hyperNode` resolver).
export function hyperNodeFraming(nodeWorldPos: THREE.Vector3, out: CameraFraming): void {
  _out.copy(nodeWorldPos).normalize();
  out.pos.copy(nodeWorldPos).addScaledVector(_out, 9);
  out.pos.y += 3;
  out.target.copy(nodeWorldPos);
}

// ---- camera CLOSENESS -----------------------------------------------------------------------
// 0 at/beyond the overview altitude band, 1 at country/node range. The geo surface shaders
// consume it (GeoView's shared closeUniform): the coastal walls tighten to a crisp rim and
// the far-side see-through damps out as the camera closes in.
export const CLOSE_FAR_ALT = 30;
export const CLOSE_NEAR_ALT = 23;
export function closeness(altitude: number): number {
  return THREE.MathUtils.clamp((CLOSE_FAR_ALT - altitude) / (CLOSE_FAR_ALT - CLOSE_NEAR_ALT), 0, 1);
}

// Scratch — module-scope, reused across every framing call (never per-call allocation).
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

// FALLBACK country framing (concentration-based) — used ONLY while the countries topology
// hasn't loaded / a cc it doesn't cover; the real drill pose is countryShape.countryFraming
// (shape-driven, constant-angle). R is the selection's concentration (|mean of node dirs|,
// 0..1): near-co-located selections zoom in subtly. Kept as the honest degraded mode.
export function geoFraming(R: number, out: CameraFraming): void {
  const t = THREE.MathUtils.smoothstep(R, 0.7, 1.0);
  out.pos.set(0, 1.5, THREE.MathUtils.lerp(29, 25, t));
  out.target.set(0, THREE.MathUtils.lerp(10.5, 11.5, t), 2.5);
}

// The FLOOR focus pose (renamed from ledgerLayerFraming with the two-floor redesign, 2026-08-04):
// the DIAGONAL is deliberately kept as the layer-focus move — the resting pose stays face-on, and
// stepping onto a floor is what tilts the room. Selecting a settlement floor flies the camera to
// the nice DIAGONAL view of that floor plane — elevated, yawed off-axis from the LEFT so the live
// lead block sits toward the BOTTOM-RIGHT and the old blocks recede to the TOP-LEFT — centred on
// the plane's height `y` (already viewScale'd by the caller). The resting pose stays central/
// untilted; this tilt is an EXPLORATION move (the user can freely orbit from here, like the geo
// drill zoom).
export function ledgerFloorFraming(y: number, out: CameraFraming): void {
  // Close-in framing (user-tuned). The TARGET sits exactly at the lane's LEAD point (x=0, z=0 —
  // the caller shifts pos+target laterally by the focused lane's world x), so the node ring /
  // snapshot cluster projects at the exact screen centre. Earlier x/z target offsets (−6, −9,
  // meant for composition) each pushed the ring right of centre through the diagonal camera —
  // composition now comes from the camera OFFSET alone (left + above → trail recedes top-left).
  out.pos.set(-7, y + 6.2, 23.5); // ~22% closer than the first tuning (user: zoom in a bit more)
  out.target.set(0, y - 1, 0);
}

// A RAIL focus pose (spec §5.1): rails run across Z at the front (+X) edge of their floor, so the
// camera drops to their height and stands off in front, looking back along the field. The target
// stays at z=0 so a long rail is framed centred rather than at one end. `x` arrives PRE-SCALED by
// the ledger group's view scale (the caller multiplies), so the stand-off nudge below is in the
// same world units.
export function ledgerRailFraming(x: number, y: number, out: CameraFraming): void {
  out.pos.set(x + 2.5, y + 3.4, 16.5);
  out.target.set(0, y, 0);
}

// Snapshots NODE zoom — the level AFTER the floor zoom (user, 2026-07-17), mirroring geo's
// country→node ladder: the floor pose is the "country" level, this frames the selected node's
// chip itself. Same diagonal viewing direction as ledgerFloorFraming (left + above, trail
// receding top-left), much closer; the target sits slightly above the chip so it settles just
// below centre (the house rule-of-thirds node composition). `node` is the chip's WORLD position.
export function ledgerNodeFraming(node: THREE.Vector3, out: CameraFraming): void {
  out.pos.set(node.x - 2.6, node.y + 2.8, node.z + 8.5);
  out.target.set(node.x, node.y + 0.4, node.z);
}

// Engine.ts:784 `_updateTween`'s inline ease, lifted verbatim.
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
