// src/engine/domain/tapZoom.ts
// Double-tap-to-zoom for touch (user, 2026-08-13 — "i'm quite used that double-tap on a tablet
// does a bit of zoom-in, can we do that for our scene as well"). Pure gesture recognition plus the
// step's dolly math; the Engine owns the listeners and the frames.
//
// It is NOT a three.js feature: OrbitControls' touch map is one finger = rotate, two = dolly/pan
// (`touches: { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }`), and there is no TOUCH constant for a
// tap pair, so the recognizer is hand-rolled — the standard answer in the three.js forum threads
// on the subject, and the reason `camera-controls` is the usual drop-in for people who want it for
// free. What we take from those threads is the shape: recognize on the element the controls
// already own (pointer capture retargets every touch there anyway), ease rather than snap, and
// clamp against the controls' own dolly limits.
//
// ⚠️ THE STEP IS A DOLLY TOWARD THE CURRENT TARGET, NOT TOWARD THE TAP POINT. A map zooms at the
// finger because you are navigating a plane; here the scene is one centred subject and the pinch
// this gesture stands in for already zooms at the target — re-aiming would move `controls.target`
// off the framed subject, which is the pose system's to own (CLAUDE.md: camera poses stay dumb,
// one home per concern). Tapping a SUBJECT already answers with its own flight, and the step
// composes onto that flight's destination, so a double tap on a hub still reads as "go there, and
// closer".

import type * as THREE from "three";

/** One completed tap: when it ended, and where — in client (CSS) pixels. */
export interface Tap {
  t: number; // ms, the event timeStamp
  x: number;
  y: number;
}

/** The window a second tap has to land in to pair with the first. The platform double-tap
 *  convention is ~300ms; a touch of slack past it costs nothing, because a lone tap has already
 *  done its own work by then and the pair only ever ADDS a zoom. */
export const DOUBLE_TAP_MS = 320;

/** How far apart the two taps may land, in CSS px. Generous next to the 5px drag-suppression
 *  threshold a mouse click gets: a finger is ~9mm wide and the second tap of a real double tap
 *  routinely lands a fingertip away from the first. */
export const DOUBLE_TAP_SLOP = 40;

/** Do these two taps make a double tap? `prev` is null when there is nothing to pair with — the
 *  first tap of a session, or a pair that has already fired (the recognizer clears it, so three
 *  taps are one zoom and a fresh first tap, never two overlapping pairs). */
export function isDoubleTap(prev: Tap | null, now: Tap): boolean {
  if (!prev) return false;
  const dt = now.t - prev.t;
  if (!(dt >= 0 && dt <= DOUBLE_TAP_MS)) return false;
  return Math.hypot(now.x - prev.x, now.y - prev.y) <= DOUBLE_TAP_SLOP;
}

/** The fraction of the camera→target distance the step KEEPS. "A bit of zoom-in" — ~1.4× in, which
 *  is about one wheel notch and well short of the halving a map's double tap does, because this
 *  scene's whole subject is already in frame and a big jump would lose it. */
export const TAP_ZOOM_STEP = 0.72;

/** Seconds the step eases over. Slower than a wheel notch (which is instant and repeatable) and
 *  much faster than a commit flight's 1.4s: this is the hand's own gesture, not the instrument
 *  answering a decision. */
export const TAP_ZOOM_DUR = 0.4;

/** Where one step lands, clamped to the controls' own dolly limits (`minDistance`/`maxDistance`,
 *  which the view policy re-points per view) so repeated taps stop exactly where a pinch would
 *  instead of pushing past and being shoved back by the clamp. Returning the INPUT distance is how
 *  the caller learns the step is a no-op — at the floor there is nothing to animate. */
export function tapZoomDistance(dist: number, minDist: number, maxDist: number): number {
  if (!Number.isFinite(dist) || dist <= 0) return dist;
  return Math.min(maxDist, Math.max(minDist, dist * TAP_ZOOM_STEP));
}

/** The same step applied to a POSE rather than to the live camera: scale `pos` around `target` by
 *  one step. This is the running-flight case — a tap pair that lands while a commit tween is in
 *  the air retargets its destination instead of fighting it for the camera, so the flight simply
 *  ends closer. `out` may alias `pos`. */
export function tapZoomAround(
  pos: THREE.Vector3,
  target: THREE.Vector3,
  minDist: number,
  maxDist: number,
  out: THREE.Vector3,
): void {
  const d = pos.distanceTo(target);
  const to = tapZoomDistance(d, minDist, maxDist);
  if (!(d > 0) || to === d) {
    out.copy(pos);
    return;
  }
  out.subVectors(pos, target).multiplyScalar(to / d).add(target);
}

// ── Long-press (2026-09-03) ────────────────────────────────────────────────────────────────────
// TOUCH'S HOVER: a phone has no pointer that rests over an object, so the whole preview tier —
// the tooltip, the dim previews, the scene↔HUD hover pairing — was silently absent there. A still
// press of this duration runs the SAME hover pick a resting mouse runs (the Engine calls its one
// _handleMove path with the press point), so previews come from one code path on both input
// kinds; rule 9's channels are untouched. The threshold sits under the platform context-menu
// delay (~500ms) so the preview wins the race, and comfortably above a deliberate tap.
// Stillness reuses DOUBLE_TAP_SLOP — one fingertip tolerance for every touch gesture here.
export const LONG_PRESS_MS = 420;
/** How long a fired preview outlives the finger: the fingertip covers the tooltip while pressed,
 *  so the reading happens AFTER release — this is the read window, cleared like a mouse-leave. */
export const LONG_PRESS_LINGER_MS = 2500;
