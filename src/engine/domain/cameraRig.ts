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

// ---- the hyper NODE pose --------------------------------------------------------------------
// Fly to a node's live shell point: pulled back along its outward radial, lifted a touch,
// looking at the node itself (Engine._focusHyperNode).
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
const _d = new THREE.Vector3(); // hyperFocusFraming: hub radial
const _f0 = new THREE.Vector3(); //  "  view direction
const _r0 = new THREE.Vector3(); //  "  screen-right
const _u0 = new THREE.Vector3(); //  "  screen-up

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

// Focused-metagraph pose (the CURRENT hyper hub focus): read as WIDE, HORIZONTAL discs AND pin the
// global hypergraph (the DAG core at the world origin) to a CONSISTENT corner of the frame — the same
// place for every metagraph (user: a consistent look). This needs a custom camera ROLL, so the pose
// carries its own `up` (the Engine tweens camera.up to it; OrbitControls' per-frame lookAt reads it).
//   • up = the ring normal `n` → the disc always foreshortens vertically → its major axis stays
//     horizontal at ANY spin, regardless of the view direction.
//   • Position: behind the hub along the radial `d` (away from the core, so the core sits BEHIND) and
//     lifted along `n` above the ring plane (oblique → the disc is a flat wide ellipse, ratio ≈
//     HF_UP/√(HF_BACK²+HF_UP²)). Because the whole offset is expressed in the camera's own screen
//     axes (r0,u0), the core lands at a FIXED screen offset (−right, +up) for every hub slot → the
//     same corner every time.
// `planeNormal` = root.rotation·+Y. Target is the subject → CAM_ZOOM dolly applies normally.
const HF_BACK = 12; // pull behind the hub along the radial (away from the core) — closer = more zoom (user)
const HF_UP = 6.5; //  lift above the ring plane (sets disc flatness; ratio to HF_BACK kept)
const HF_OR = 14; //   in-screen shift that drops the core to one side (LEFT) — larger = nearer the corner
const HF_OU = 6; //    in-screen shift that lifts the core (TOP), on top of the natural above-plane lift
export function hyperFocusFraming(hubWorld: THREE.Vector3, planeNormal: THREE.Vector3, out: CameraFraming): void {
  _out.copy(planeNormal).normalize(); // n
  _d.copy(hubWorld);
  if (_d.lengthSq() < 1e-6) _d.set(0, 0, 1);
  _d.normalize(); // radial: core → hub
  // view direction toward the hub from "behind + above": f0 = −(HF_BACK·d + HF_UP·n), normalized
  _f0.copy(_d).multiplyScalar(-HF_BACK).addScaledVector(_out, -HF_UP).normalize();
  _r0.crossVectors(_f0, _out).normalize(); // screen-right (⟂ n → disc major axis horizontal)
  _u0.crossVectors(_r0, _f0).normalize(); //  screen-up
  if (_u0.dot(_out) < 0) {
    _r0.negate();
    _u0.negate();
  } // orient so +u0 is the up (n) side
  out.pos
    .copy(hubWorld)
    .addScaledVector(_d, HF_BACK)
    .addScaledVector(_out, HF_UP)
    // Parallax: the core is FARTHER than the target, so it shifts WITH the camera — shift the camera
    // screen-LEFT and slightly screen-UP to drop the core into the frame's top-left. (The in-plane
    // "horizon" effect already lifts the distant core; the up-nudge just firms the corner.)
    .addScaledVector(_r0, -HF_OR)
    .addScaledVector(_u0, HF_OU);
  out.target.copy(hubWorld);
  // The camera ROLL (up = this ring normal) is applied by the Engine — it reads planeNormal directly.
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

// Snapshots NODE zoom — the level AFTER the layer zoom (user, 2026-07-17), mirroring geo's
// country→node ladder: the layer pose is the "country" level, this frames the selected node's
// chip itself. Same diagonal viewing direction as ledgerLayerFraming (left + above, trail
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
