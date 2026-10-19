// A DRAG IN GEOGRAPHY TURNS THE GLOBE, NEVER THE CAMERA (user, 2026-10-19: with a node selected,
// "dragging across the view feels very counter intuitive because it keeps the globe centre as
// reference while the camera has a very specific position for this layer — applies to most other
// layers as well"). The Globe already brings every subject to the FRONT by turning itself (yaw +
// lean, `Globe._aimAt`) while the camera flies to a fixed pose; the free orbit was the one gesture
// still moving the camera, and it orbited OrbitControls' look-at — the globe centre at rest, and at
// the node and cohort poses a composed point in the sky above the globe (`cameraRig.nodeFraming`:
// the axis aims above the node so its ground rides below the frame's centre). A drag there swung
// the camera about that sky point and the node whipped out of the frame. So in this view a drag
// adds to the globe's own yaw and lean: the camera and its look-at stay exactly where the pose put
// them and the surface moves under them — at the resting pose indistinguishable from the orbit
// it replaces, at every other rung the gesture the reader expects. One rule for the whole view.
//
// THE RATE IS THE ORBIT'S AT REST, AND IT SLOWS WITH THE ALTITUDE. OrbitControls turns a full
// circle per viewport height wherever the camera stands; a globe two units above the plateau at
// that rate flies past the node in a flick. Honest finger-follow (the surface point under the
// pointer stays under it) is the other end: at the node pose it answers ~10° per screen height,
// which reads as stuck. The rate here is the resting orbit's, scaled by the altitude's share of
// the resting altitude — unchanged where nobody complained, and the SAME multiple of finger-follow
// at every altitude (the orbit's resting rate is ~3.4× finger-follow; scaling by the altitude's
// share keeps that multiple as the camera closes in: measured live at the node pose, a floor of
// 0.12 ran the surface 4.5× the finger and read as a flick). The floor is a safety only — geo's
// `minCamAlt` keeps the camera at least a unit above the plateau, a share of ~0.03.
import { R, LAND_H } from "./geoLayout";

/** The surface the altitude is measured from: the land plateau. */
export const GLOBE_SURFACE_R = R + LAND_H;
/** The lean may not tip past a pole — past it the yaw would read backwards. */
export const LEAN_MAX = Math.PI / 2;
/** Below this share of the resting altitude the rate stops falling. */
export const RATE_FLOOR = 0.03;
/** Travel past which a press has become a drag (the fingertip slop OrbitControls uses). */
export const DRAG_SLOP_PX = 4;

export interface GlobeTurn {
  /** Added to the globe group's rotation.y — positive carries the front of the globe to the right. */
  yaw: number;
  /** Added to rotation.x — positive carries the front of the globe down. */
  lean: number;
}

/** The turn a pointer travel of (dx, dy) px asks for, with the camera `camDist` from the globe's
 *  centre and the view's resting pose `restDist` from it. Both are distances to the CENTRE; the
 *  altitude above the plateau is what the rate rides. */
export function dragTurn(dxPx: number, dyPx: number, viewportH: number, camDist: number, restDist: number): GlobeTurn {
  const h = Math.max(1, viewportH);
  const alt = Math.max(0, camDist - GLOBE_SURFACE_R);
  const restAlt = Math.max(1e-6, restDist - GLOBE_SURFACE_R);
  const share = Math.min(1, Math.max(RATE_FLOOR, alt / restAlt));
  const k = ((2 * Math.PI) / h) * share;
  return { yaw: dxPx * k, lean: dyPx * k };
}

/** The lean the globe may hold: the input clamped to ±`LEAN_MAX`. */
export function clampLean(lean: number): number {
  return Math.max(-LEAN_MAX, Math.min(LEAN_MAX, lean));
}

/** Has a press travelled far enough to be a drag rather than a click? */
export function isDrag(dxPx: number, dyPx: number): boolean {
  return Math.hypot(dxPx, dyPx) > DRAG_SLOP_PX;
}
