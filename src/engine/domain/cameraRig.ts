// Pure camera-framing math shared by the Engine's focus/tween logic (Engine.ts's
// FOCI / _focusFilter / _focusGeo / _updateTween). Extracted verbatim (with source line
// references) as the domain layer for Task 15 — the numbers/behaviour are unchanged.
// Every framing function writes into a caller-provided, pre-allocated `out` struct so the
// Engine's per-focus calls (mousemove-adjacent, filter/country changes) allocate nothing.

import * as THREE from "three";
import type { View3D } from "./viewTransition";

export interface CameraFraming {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

// Camera presets (ported from ui.js FOCI; Engine.ts:46-56 verbatim).
//
// `satisfies` rather than a `Record<string, …>` annotation, so the KEYS survive into the type: a
// bare `string` index makes `focus("overvieww")` a silent undefined at runtime instead of the
// compile error it should be, and it is what let REST_POSE claim to be checked while checking
// nothing.
export const FOCI = {
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
  // the topbar and the LiveStrip. Both global levers survive it: dollyBack and railsLean scale
  // (pos − target) around the target, so a pure translation of the pair is invariant under them.
  ledger: { pos: new THREE.Vector3(0, -1, 54), target: new THREE.Vector3(0, -7, 0) },
} satisfies Record<string, CameraFraming>;
/** A pose that exists. Every caller of `focus()` names one of these, checked. */
export type FocusName = keyof typeof FOCI;

// ---- the ONE global zoom lever ------------------------------------------------------------
// Dolly every preset/framing back by CAM_ZOOM (the position pushed out from its target) — one
// lever so all views sit a touch wider without re-tuning each pose (user). The Engine applies
// it through dollyBack() in its camera tween; `nodeFraming` is the one deliberate EXEMPTION:
// its look-at is a composed point far up the globe's face (not the subject), so dollying
// along that axis drags the camera away from the node instead of widening the shot — its
// numbers are ABSOLUTE. Any new pose with a composed (non-subject) target must decide this
// explicitly.
//
// ⚠️ THE EXEMPTION IS THE POSE'S, NOT THIS LEVER'S — `railsLean` INHERITS IT (2026-08-13). Both
// levers scale (pos − target) about the target, so the argument above is about the AXIS and applies
// to either of them verbatim: on a composed look-at there is no honest radial to move along. The
// rails lean was added later and composed centrally, so it never inherited the exemption and leaned
// geo's node pose 14% down an axis aimed 15 units up the globe's face — the node ended up 3.3×
// closer and half out of frame in scene mode, which is what the user reported as "it zooms in too
// much". One flag now gates both (`_tweenTo`'s `dolly`), because there is one reason.
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
//
// ⚠️ THE LEAN IS A RESTING-POSE TRADE, SO IT FADES OUT AS THE POSE CLOSES IN (user, 2026-08-13 —
// "looks great in unfiltered mode in scene starting position, but when filtered at the lowest level
// … it zooms in too much; probably the zoom effect should be reduced depending on how close they
// sit to the actual subject compared to scene starting position"). The physical argument is the
// whole rule: what hiding the rails frees is HORIZONTAL width (at 1600px the band goes 908px →
// 1600px, +76%), but the camera's FOV is VERTICAL, so a radial dolly buys the horizontal gain by
// spending vertical fit. At the resting pose the subject is width-bound — the globe, the hub ring,
// the lane field all run wide — so the trade is free. At a deep rung the subject is HEIGHT-bound: a
// co-located stack grows upward off its surface point, a hub's shells fill the frame vertically. So
// the same 14% crops exactly where there is nothing left to crop. `railsLean` ramps the factor with
// the pose's own orbit distance against its view's resting one: full lean at rest, none at the
// subject. It is the one lever, not a second knob — RAILS_HIDDEN_DOLLY is still what "full" means.
export const RAILS_HIDDEN_DOLLY = 0.86;
// The resting pose each view's lean is measured against — the user's "scene starting position".
// Read out of FOCI rather than restated, so re-tuning a resting pose re-tunes the ramp with it.
const REST_POSE: Record<View3D, FocusName> = { hyper: "overview", geo: "geo", ledger: "ledger" };
export function restOrbit(view: View3D): number {
  const f = FOCI[REST_POSE[view]];
  return f.pos.distanceTo(f.target);
}
/** The resting pose's PITCH — how far above its target the camera sits at rest, in radians.
 *  The scene rig measures the live camera's pitch against this so the lamps can follow pitch as
 *  a DELTA (SceneRig): at the resting pose the delta is zero and the shipped look is untouched;
 *  a dive to a node or a free vertical orbit carries the rig with the view instead of leaving
 *  the lit side behind (user, 2026-08-30 — "a lot of the lighting effects get lost"). Read out
 *  of FOCI like restOrbit, so re-tuning a resting pose re-tunes the reference with it. */
export function restPitch(view: View3D): number {
  const f = FOCI[REST_POSE[view]];
  const dy = f.pos.y - f.target.y;
  const dx = f.pos.x - f.target.x, dz = f.pos.z - f.target.z;
  return Math.atan2(dy, Math.hypot(dx, dz));
}
/** Lean `pos` toward `target`, at full strength only while the pose orbits as wide as its view's
 *  resting one. `restDist <= 0` means "no resting pose to measure against" (a flat view, which has
 *  no canvas anyway) and takes the full lean, exactly as the un-ramped lever did. */
export function railsLean(pos: THREE.Vector3, target: THREE.Vector3, restDist: number, outPos: THREE.Vector3): void {
  const k = restDist > 0 ? THREE.MathUtils.clamp(pos.distanceTo(target) / restDist, 0, 1) : 1;
  outPos.subVectors(pos, target).multiplyScalar(1 - (1 - RAILS_HIDDEN_DOLLY) * k).add(target);
}

// ---- the PORTRAIT fit (2026-09-02) ----------------------------------------------------------
// The third global lever, same species as the two above: scale (pos − target) about the target.
// Every FOCI pose and framing was tuned at desktop aspect (the design sessions measured at
// 1600×950), and the camera's FOV is VERTICAL — so a portrait phone keeps the tuned pose's full
// height and loses width linearly with aspect. Measured at 390×844: the ledger chamber ran off
// BOTH side edges while ~37% of the viewport height sat empty above and below it; hyper the same
// shape. The fit dollies the pose OUT until the width comes back, spending the height portrait
// has to spare.
//
// ⚠️ PARTIAL COMPENSATION, BY SQUARE ROOT, ON PURPOSE. Full width-compensation is
// restAspect/aspect ≈ 3.6× at phone aspect — but poses don't USE the full desktop width (the
// subject sits inside the rail-free centre band), so restoring all of it would shrink the scene
// to a third of its height for margin it never had. `√ratio` (≈1.9× at 390×844, ≈1.4× at tablet
// portrait) splits the deficit between the two axes: the subject gives up some height to buy
// back most of its width. Verified live at 390×844 across all three 3D views.
//
// Clamped to ≥ 1 — the lever only ever WIDENS. A wide viewport (ratio < 1) already fits the
// tuned height exactly, and dollying IN would crop it. So on desktop this is the identity, by
// construction rather than by gate.
//
// It rides `tweenTo`'s one `dolly` flag like both siblings: same scaling form, same reasoning —
// on a composed look-at (nodeFraming, cohortFraming) there is no honest radial to move along.
// The aspect is a PARAMETER (the caller reads it off the live camera): this module stays pure,
// and the lever re-resolves with whatever aspect the next pose application sees. A device
// ROTATION alone does not re-frame — resize only writes the projection — and that is accepted:
// the next commit, view switch or rails toggle re-resolves, and holding the old framing for a
// beat beats re-tweening the camera under a gesture the user didn't make.
export const REST_ASPECT = 1600 / 950;
export function aspectFit(pos: THREE.Vector3, target: THREE.Vector3, aspect: number, outPos: THREE.Vector3): void {
  const k = Math.sqrt(Math.max(1, REST_ASPECT / Math.max(0.1, aspect)));
  outPos.subVectors(pos, target).multiplyScalar(k).add(target);
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

// ---- the hyper NODE pose: RETIRED (2026-08-13) ------------------------------------------------
// `hyperNodeFraming` flew to a node's own shell point, pulled back along its outward radial. It is
// gone and hyper's node rung delegates to its NETWORK's framing, the way the composition rung
// already did (user, 2026-08-13 — "when a node is selected and i navigate to hyper view, it does
// not correctly focus on the metagraph. It should behave the same as when (only) a metagraph filter
// is selected"). The view's subject is the STRUCTURE: a node there is one bead on a shell, and
// diving onto it loses the shells, the hub and the orbit that say what the bead is part of — the
// same reason the ledger's node rung resolves to the chamber pose. Arriving from geo with a node
// selected made it plainest, since the walk starts at the finest rung: the carried node framed
// itself and the metagraph the user had committed never appeared.
//
// It also carried a mid-transition trap worth remembering if a per-node pose is ever tried again:
// the framing has to read the node's LAYOUT position, never its rendered instance matrix, because
// mid-flight the instance sits in the staging grid (`Globe.hyperWorldPos`, retired with it).
// The nudge below is what answers the click now.

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

// ---- the COMMIT NUDGE -------------------------------------------------------------------------
// EVERY commit animates the camera, and where the ladder resolves to the pose already held, the
// animation is a NUDGE (user, 2026-08-13 — "we always animate the position but a 'nudge' is allowed
// which means the new pos will be same as old pos"). A finer rung that shares its parent's framing
// used to answer a click with no motion at all, which reads as a dropped input rather than as "you
// are already looking at it" — and there are now several: every ledger rung delegates to the one
// chamber pose, and hyper's node and composition rungs delegate to their network's.
//
// The nudge is a PULSE, not a flight, and the difference is the whole point: it pushes a little way
// toward the pose's own target and eases back to exactly where it started, so the framing the user
// committed is never disturbed. Two consequences the Engine relies on — it runs on its own short
// clock (the smallest member of the navigation clock family), and it must NOT raise `cameraFlying`:
// that dim exists so the scene under the phone's cards can be seen changing, and here nothing does.
export const NUDGE_DUR = 0.55; //  seconds
// ⚠️ THE NUDGE ONLY HAS TO BE NOTICED, NOT FELT (user, 2026-08-13 — "make the camera nudge much more
// subtle when pos does not have to change but the selected subject has"). It shipped at 0.04, a 4%
// push toward the subject, which at hyper's orbit distance is a visible lurch: big enough to read as
// the camera moving somewhere and then changing its mind, which is the opposite of the reassurance
// it exists to give. What answers the click is that SOMETHING moved — the eye catches a sub-percent
// shift on a still frame — so the amplitude is set at the low end of visible, and the 0.55s clock
// does the rest of the work.
export const NUDGE_AMP = 0.012; //  peak push, as a fraction of the way toward the pose's target
// Two poses are "the same" within this fraction of the ORBIT DISTANCE — relative, because the views
// sit an order of magnitude apart in scale, and because a move too small to see is one the nudge
// should replace rather than one the epsilon merely forgives.
export const NUDGE_SAME = 0.004;

/** Is the destination the pose the camera already holds — so this commit gets a nudge, not a flight? */
export function isSamePose(
  fromPos: THREE.Vector3,
  fromTgt: THREE.Vector3,
  toPos: THREE.Vector3,
  toTgt: THREE.Vector3,
): boolean {
  const eps = NUDGE_SAME * Math.max(fromPos.distanceTo(fromTgt), 1);
  return fromPos.distanceTo(toPos) <= eps && fromTgt.distanceTo(toTgt) <= eps;
}

/** The nudge's shape: how far toward the target the camera sits at time `t` (0..1), as a fraction.
 *  Zero at BOTH ends with zero slope there, peaking at NUDGE_AMP halfway — so it composes onto a
 *  resting pose without a start or a landing of its own, and t=1 restores that pose exactly. */
export function nudgeMix(t: number): number {
  const s = Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0, 1));
  return NUDGE_AMP * s * s;
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
// Composes cleanly with both global levers (`dollyBack`, `railsLean`): they scale (pos − target)
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
