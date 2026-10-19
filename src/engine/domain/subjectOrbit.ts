// A DRAG IN GEOGRAPHY ORBITS THE SUBJECT (user, 2026-10-19, two rounds). The free orbit used to
// swing the camera about OrbitControls' look-at: the globe centre at rest, and at the node and
// cohort poses a composed point in the sky above the globe (`cameraRig.nodeFraming` aims above
// the node so its ground rides below the frame's centre) — "it keeps the globe centre as
// reference while the camera has a very specific position for this layer". A first answer turned
// the GLOBE under a fixed camera, and the selection rotated out of the view with it. What the
// gesture means with a subject on screen is LOOKING AROUND IT: the camera and its look-at turn
// together, rigidly, about the subject's own position, so the subject stays exactly where the
// pose put it in the frame while the ground and the stacks around it swing. With no subject the
// pivot is the globe centre, which at the resting pose is the orbit that was always there.
//
// The rate is OrbitControls' own — a full turn per viewport height, both axes — so the resting
// pose feels as it did. Yaw turns about the WORLD up through the pivot (the globe's axis stays
// upright; north stays up), pitch about the camera's own right axis through the pivot, and a
// step that would dive the camera under the view's altitude floor or tip the look past the
// zenith is declined rather than clamped, so the gesture never jumps.
import * as THREE from "three";

/** Travel past which a press has become a drag (the fingertip slop OrbitControls uses). */
export const DRAG_SLOP_PX = 4;
/** OrbitControls' rotate rate: one full turn per viewport height. */
export const TURN_PER_VIEWPORT = 2 * Math.PI;
/** The look may not tip past the POLAR CLAMP OrbitControls applies every frame about its target
 *  (`viewPolicy.minPolarAngle`, 0.25 from either pole): a step admitted past it would be written
 *  and then snapped back by the controls' own update — a jitter at the limit, about the target
 *  rather than the pivot (PR review, 2026-10-19). The cap is the clamp less a hair. */
export function elevationCap(minPolarAngle: number): number {
  return Math.PI / 2 - minPolarAngle - 0.02;
}
/** The default cap — the views' standard 0.25 clamp. */
export const MAX_ELEVATION = elevationCap(0.25);

export interface OrbitAngles {
  /** About the world up through the pivot. Negative for a rightward drag: the camera goes left
   *  so the scene follows the finger right. */
  yaw: number;
  /** About the camera's right axis through the pivot. Negative for a downward drag: the camera
   *  rises so the scene follows the finger down. */
  pitch: number;
}

/** Has a press travelled far enough to be a drag rather than a click? */
export function isDrag(dxPx: number, dyPx: number): boolean {
  return Math.hypot(dxPx, dyPx) > DRAG_SLOP_PX;
}

/** The angles a pointer travel of (dx, dy) px asks for. */
export function orbitAngles(dxPx: number, dyPx: number, viewportH: number): OrbitAngles {
  const k = TURN_PER_VIEWPORT / Math.max(1, viewportH);
  return { yaw: -dxPx * k, pitch: -dyPx * k };
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _qPitch = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const _q = new THREE.Quaternion();

/** Rotate the camera's (pos, target) pair RIGIDLY about `pivot`: pitch about the pair's own right
 *  axis first, then yaw about the world up. The pivot keeps its place on screen. Writes `outPos`
 *  and `outTgt` (either may alias its input). */
export function orbitAbout(
  pos: THREE.Vector3,
  target: THREE.Vector3,
  pivot: THREE.Vector3,
  a: OrbitAngles,
  outPos: THREE.Vector3,
  outTgt: THREE.Vector3,
): void {
  _fwd.subVectors(target, pos);
  _right.crossVectors(_fwd, _up);
  if (_right.lengthSq() < 1e-10) _right.set(1, 0, 0); // looking straight up/down: any right will do
  _right.normalize();
  _qPitch.setFromAxisAngle(_right, a.pitch);
  _qYaw.setFromAxisAngle(_up, a.yaw);
  _q.multiplyQuaternions(_qYaw, _qPitch);
  outPos.subVectors(pos, pivot).applyQuaternion(_q).add(pivot);
  outTgt.subVectors(target, pivot).applyQuaternion(_q).add(pivot);
}

/** May the camera take this pose? Not under the view's altitude floor (a distance from the globe
 *  centre; null = no floor), and not looking past the zenith or the nadir. */
export function orbitAllowed(pos: THREE.Vector3, target: THREE.Vector3, minCamAlt: number | null, maxElevation = MAX_ELEVATION): boolean {
  if (minCamAlt != null && pos.length() < minCamAlt) return false;
  _fwd.subVectors(target, pos);
  const len = _fwd.length();
  if (len < 1e-9) return false;
  return Math.abs(Math.asin(THREE.MathUtils.clamp(_fwd.y / len, -1, 1))) <= maxElevation;
}
