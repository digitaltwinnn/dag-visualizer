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
  // Pulled back again (41.5 → 44.8, user 2026-08-09: "the globe view at rest needs to zoom out a
  // little"): pos is scaled AROUND the target (×1.08), so the composition — the downward tilt and
  // the globe's screen-centre — is preserved exactly and only the fit changes.
  geo: { pos: new THREE.Vector3(0, 13.5, 44.8), target: new THREE.Vector3(0, 0, 0) },
  // Metagraph-selection pose: rotated-to-densest at a WIDE distance — deliberately farther out
  // than the country framing (geoFraming z 29..25) so the country drill reads as a real zoom-in.
  // Camera held LOW (near the equator plane, like the country/node poses) — a higher camera
  // stacked on the densest-cluster lean read as "viewing the globe from the north" (user).
  geoNetwork: { pos: new THREE.Vector3(0, 5, 33), target: new THREE.Vector3(0, 2, 0) },
  // The Snapshots RESTING pose (user, 2026-08-07 — it used to share `overview`): FRONTAL and
  // zoomed in, straight onto the chamber's camera-side face, so the ribbon sheets (which span
  // the lane field) and the node trays (which face +Z) present flat-on. Slightly elevated,
  // aimed between the floors.
  // Nearly level (user: "more from the front, no tilt") — a ~6° pitch keeps the plane tops
  // just barely readable while the trays + ribbon sheets present flat-on.
  // Raised in FRAME (user, 2026-08-09 — "the scene elements sit too close to the bottom of the
  // viewport", then "lower it a little bit, in HUD mode it's too high now"): pos.y and target.y
  // are lowered by the SAME 4.5, which translates the frustum down without touching the view
  // direction — so the ~6° pitch is preserved exactly and the chamber centres in the band between
  // the topbar and the LiveStrip. Both global levers survive it: dollyBack and railsDolly scale
  // (pos − target) around the target, so a pure translation of the pair is invariant under them.
  ledger: { pos: new THREE.Vector3(0, -1, 54), target: new THREE.Vector3(0, -7, 0) },
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

// The rails-hidden LEAN (2026-08-08, reworked after review): hiding the card rails hands the
// scene the whole frame, and the camera leans IN by this radial factor toward the pose's own
// target. It is a property of POSE RESOLUTION, not a one-shot delta — the Engine composes it
// into EVERY tween destination while the rails are hidden (`_tweenTo`), so focus flights,
// transition landings and the toggle itself all agree, and showing the rails simply re-resolves
// the canonical pose (no inverse math, no desync when a reframe happened in between — the
// original from-the-live-pose delta drifted across holdCamera, flat views and clamps).
// Safe to call with `outPos === pos` (subVectors reads before it writes).
export const RAILS_HIDDEN_DOLLY = 0.86;
export function railsDolly(pos: THREE.Vector3, target: THREE.Vector3, outPos: THREE.Vector3): void {
  outPos.subVectors(pos, target).multiplyScalar(RAILS_HIDDEN_DOLLY).add(target);
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
const _sph = new THREE.Spherical();

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

// ---- the Snapshots view's ONE pose, and its ONE commit-time variation -----------------------
// ⚠️ The Snapshots view has exactly ONE camera POSE — `FOCI.ledger`, which every rung on its ladder
// resolves to (Engine's `ledgerNode`/`ledgerNetwork` both delegate to `ledgerOverview`). FIVE framings
// have been tried in this view and all five are RETIRED, which is why the fact is recorded here
// rather than left to be inferred from an empty file:
//
//   · `ledgerLaneNudge` (2026-08-08 → 2026-08-09) TRANSLATED laterally toward the committed lane.
//     The field is FIXED and symmetric, so any lateral move pushes its far end out of frame.
//   · `ledgerNodeFraming` (2026-07-17 → 2026-08-09) zoomed to a chip in its tray. The trays are
//     visual aid — machines filling the chamber; the snapshots are the subjects.
//   · `ledgerFloorFraming` / `ledgerRailFraming` (→ 2026-08-11) predated the two-storey redesign:
//     neither floors nor rails have been focus rungs since, so nothing called them. They outlived
//     their callers by a release because rule 4 keeps a domain export alive as long as its sibling
//     test names it — a green test is not a consumer, so check callers before trusting coverage.
//
// **Don't grow a sixth.** Emphasis in this view is COLOUR — the four dim tiers in
// `scene/objects/dimTiers.ts` carry every commit — plus the one ORBIT below.

// Engine.ts:784 `_updateTween`'s inline ease, lifted verbatim.
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ---- the Snapshots COMMIT ORBIT -------------------------------------------------------------
// With a metagraph filter committed, the frontal resting pose ORBITS a little into a
// three-quarter view (user, 2026-08-09: "when there is a filter on a metagraph, tilt the camera a
// bit to give it a nicer 3d effect") — the chamber's depth (two storeys, the trail running away
// from the lead edge) then reads as 3D instead of as a flat elevation. Keyed on the FILTER, not on
// a rung, so it is a property of the committed STATE: every ledger rung inherits it by delegating
// to `ledgerOverview`, and clearing the filter tweens back to frontal.
//
// ⚠️ This is NOT the retired `ledgerLaneNudge` in another shape, and the difference is exactly why
// it's allowed: the nudge translated laterally, which walks the symmetric field's far end out of
// frame. An ORBIT about the field's own centre keeps every lane in frame — it only changes the
// angle they are seen at — and the radius factor pays for the wider projected diagonal a yawed
// field presents. The composition is still filter-independent: the orbit is the same for every
// network, so no lane is ever framed better than another.
//
// Composes cleanly with both global levers (`dollyBack`, `railsDolly`): they scale (pos − target)
// about the target, which commutes with a rotation about that same target. Safe to call with
// `outPos === pos` — the scratch read happens before the write.
export const LEDGER_TILT_YAW = 0.23; // rad ≈ 13°, orbiting toward +X (the lane field's right end)
export const LEDGER_TILT_PITCH = 0.1; // rad ≈ 5.7° of extra look-down, so the two storeys separate
export const LEDGER_TILT_DOLLY = 1.08; // pays for the yawed field's wider projected diagonal
export function ledgerCommitTilt(pos: THREE.Vector3, target: THREE.Vector3, outPos: THREE.Vector3): void {
  _sph.setFromVector3(_out.subVectors(pos, target));
  _sph.theta += LEDGER_TILT_YAW;
  _sph.phi -= LEDGER_TILT_PITCH; // phi is measured from +Y, so subtracting RAISES the camera
  _sph.radius *= LEDGER_TILT_DOLLY;
  outPos.setFromSpherical(_sph).add(target);
}
