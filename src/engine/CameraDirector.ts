import * as THREE from "three";
import type { SceneCtx } from "./scene/SceneContext";
import type { HyperView } from "./scene/views/HyperView";
import type { Mode } from "@/src/store/store";
import type { CameraFraming } from "./domain/cameraRig";
import {
  FOCI, type FocusName, aspectFit, dollyBack, geoFraming, hubFraming, railsLean,
  isSamePose, nudgeMix, restOrbit, NUDGE_DUR, easeInOutQuad,
} from "./domain/cameraRig";
import { HYPER_TILT_FOCUS } from "./domain/hyperLayout";
import { TAP_ZOOM_DUR, tapZoomAround, tapZoomDistance } from "./domain/tapZoom";
import { is3D } from "./domain/viewTransition";
import type { ViewTransition } from "./domain/viewTransition";

type Vec = THREE.Vector3;

// THE CAMERA'S MOTION, lifted out of Engine.ts (2026-08-31).
//
// The split is policy vs mechanism. The Engine still DECIDES which pose a selection deserves —
// the focus ladder walk and its per-rung resolver table read the views and the committed state,
// which is squarely Engine business. This owns getting there: composing the pose (the dollyBack /
// railsLean levers), running the tween, and the double-tap dolly that has to negotiate with a
// flight already in the air.
//
// ⚠️ THE TAP-ZOOM COMES WITH IT, and that is not tidiness. `tapZoom` reads the live `_tween` to
// retarget a flight mid-air rather than fight it, and `_updateTapZoom` checks `_tween.active` for
// its ordering. They are one concern over one piece of state; splitting them would put `_tween`
// across a module boundary. What stays in the Engine is the RECOGNIZER's input edge — the pointer
// handlers, `_lastTap`, `_eatClick` — because that is input plumbing, not camera motion.
//
// ⚠️ `out` is PUBLIC and shared on purpose. The Engine's resolver table writes a domain framing
// function's result into it and hands it straight to `tweenTo`, which copies out of it
// immediately — one buffer, never re-allocated, exactly as it behaved as a private field. It is
// scratch, not state: nothing may hold a reference across frames.

export interface CameraHost {
  ctx: SceneCtx;
  layers: HyperView;
  transition: ViewTransition;
  mode: Mode;
  /** Only `canvas` is read: the flat placeholder views are inert (convention 7). */
  policy(): { canvas: boolean };
  railsHidden(): boolean;
  slowmo(): number;
  /** The camera-flying dim. Routed through the Engine rather than written here: rule 1 keeps
   *  Engine.ts the one store bridge, and this module is a sibling of it, not a second one. */
  setFlying(v: boolean): void;
  flyingNow(): boolean;
}

export class CameraDirector {
  private readonly h: CameraHost;

  // A persistent tween record (never re-allocated per focus) — `active` replaces the old
  // null-the-object pattern; `tweenTo` copies into these four vectors instead of `.clone()`ing.
  private _tween = {
    fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(),
    fromTgt: new THREE.Vector3(), toTgt: new THREE.Vector3(),
    t: 0, dur: 1.4, active: false, nudge: false,
  };
  // The step's own eased dolly, owned here because it is not a POSE: it composes onto whatever the
  // controls and the tween have already put the camera at (see _updateTapZoom's ordering note).
  private _zoom = { active: false, t: 0, from: 0, to: 0 };
  private _hubWorld = new THREE.Vector3(); // scratch: hub local pos tilted into world for framing
  private _focusEuler = new THREE.Euler(); // scratch: the focus TARGET rotation (flat tilt + spin)

  /** Scratch framing struct — see the note above. Written by the Engine's resolver table. */
  readonly out: CameraFraming = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  constructor(host: CameraHost) {
    this.h = host;
  }

  /** True while a pose flight is running — the render loop's dim rides this. */
  get flying(): boolean {
    return this._tween.active;
  }

  /** A pinch invalidates a running step: it dollies the same axis and the two would fight. */
  cancelZoom(): void {
    this._zoom.active = false;
  }

  /** Both eased motions, in the order the camera requires. Called once per frame. */
  update(dt: number): void {
    this._updateTween(dt);
    this._updateTapZoom(dt);
  }

  focus(name: FocusName, structureMoves = false) {
    const f = FOCI[name];
    this.tweenTo(f.pos, f.target, true, structureMoves);
  }


  /** `structureMoves` — the commit is answered by the STRUCTURE as well as the camera (geo's
   *  rungs: the globe spins to face the subject while the camera holds one fixed/shape-keyed
   *  pose). It changes exactly one decision, the nudge's dim — see the gate below. */
  tweenTo(toPos: Vec, toTgt: Vec, dolly = true, structureMoves = false) {
    // OUT-phase camera hold (spec A#6): the state commit stands; the boundary's
    // _applyDestLayout re-derives this pose from it, so dropping the tween loses nothing.
    if (this.h.transition.holdCamera()) return;
    const tw = this._tween;
    tw.fromPos.copy(this.h.ctx.camera.position);
    // The global CAM_ZOOM dolly (see cameraRig) — writes straight into tw.toPos, no extra
    // allocation. `dolly: false` is for poses whose TARGET is a composed look-at rather than
    // the subject (nodeFraming — see the exemption note next to CAM_ZOOM).
    if (dolly) dollyBack(toPos, toTgt, tw.toPos);
    else tw.toPos.copy(toPos);
    tw.fromTgt.copy(this.h.ctx.controls.target);
    tw.toTgt.copy(toTgt);
    // The rails-hidden LEAN composes into every destination a dolly may touch (2026-08-08,
    // review-hardened): a property of pose resolution, so focus flights, transition landings and
    // the presentation toggle can never disagree about it. In place (railsLean is outPos===pos
    // safe). It rides the SAME `dolly` gate as dollyBack — both scale (pos − target) about the
    // target, so a pose whose target is a composed look-at is exempt from both (see the exemption
    // note next to CAM_ZOOM). And it RAMPS with how close the pose already sits to the view's
    // resting orbit, which is what `restOrbit` measures — see railsLean's own note.
    if (dolly && this.h.railsHidden()) railsLean(tw.toPos, tw.toTgt, is3D(this.h.mode) ? restOrbit(this.h.mode) : 0, tw.toPos);
    // The PORTRAIT fit (2026-09-02): a vertical FOV loses width as the viewport narrows, so on a
    // portrait aspect every destination dollies out until the tuned width comes back — see
    // aspectFit's own note for the √ law. Identity at desktop aspect, so nothing above 1 changes.
    // Same `dolly` gate, same reason as both siblings; the live camera's aspect is the parameter
    // so the domain stays pure. In place (outPos===pos safe, like railsLean).
    if (dolly) aspectFit(tw.toPos, tw.toTgt, this.h.ctx.camera.aspect, tw.toPos);
    // THE COMMIT NUDGE (user, 2026-08-13): "we always animate the position but a 'nudge' is allowed
    // which means the new pos will be same as old pos". Every rung answers a click, including the
    // ones whose pose is their parent's — hyper's node and composition rungs resolve to the network
    // they belong to, so committing one lands exactly where the camera already is. A dead 1.4s
    // no-op reads as a broken click; the nudge is the acknowledgement, and it ends on this same
    // committed pose, so nothing is lost by taking it.
    tw.nudge = isSamePose(tw.fromPos, tw.fromTgt, tw.toPos, tw.toTgt);
    tw.t = 0;
    tw.dur = tw.nudge ? NUDGE_DUR : 1.4;
    tw.active = true;
    // The HUD yields while this flight runs (store.cameraFlying — see its comment): a commit made
    // from a card is a request to LOOK at what was committed, so the cards step back out of the
    // way exactly as they do under a direct drag. NOT during a view transition: that choreography
    // is already the 3.9s answer to the user's gesture, and a 1.4s dim inside it reads as a blink.
    // And NOT for a nudge — UNLESS the structure moves (user, 2026-09-02: "click a provider and
    // swipe it: the camera moves but the HUD does not fade"). The no-dim-on-nudge rule reasons
    // "the dim exists so the scene can be SEEN changing, and here it doesn't" — which is exactly
    // backwards on geo's rungs, where "view emphasis moves the structure, not the camera" means a
    // same-pose commit still spins the GLOBE to the new subject: cohortFraming and nodeFraming
    // are ONE fixed pose by design, so every sibling swipe is a nudge over a real structural
    // move. `structureMoves` is the resolver saying so; the dim rides the nudge's own window and
    // clears with it at the tween's end, like any flight's.
    if ((!tw.nudge || structureMoves) && !this.h.transition.active() && !this.h.flyingNow()) this.h.setFlying(true);
  }


  focusGeo(R: number, structureMoves = false) {
    // Look head-on at the FRONT of the globe (target pushed forward in +Z, toward where the
    // focused country/selection is aimed) so it sits centred in the view rather than low.
    geoFraming(R, this.out);
    this.tweenTo(this.out.pos, this.out.target, true, structureMoves);
  }

  focusFilter(filter: string) {
    this.h.layers.focusId = null;
    if (filter === "all") {
      this.h.ctx.controls.autoRotate = false; // the STRUCTURE spins (setHyperSpin), not the camera
      this.focus("overview"); // SHARED pose — the hyper structure is tilted (HYPER_TILT) to read
      return; // top-down instead of moving the camera, so other views tween cleanly from here.
    }
    this.h.ctx.controls.autoRotate = false;
    if (filter === "dag") {
      this.focus("dag"); // the central core — framed to fit both the L0 and cL1 shells
      return;
    }
    const meta = this.h.layers.metas.find((x) => x.cfg.id === filter);
    if (!meta) {
      this.focus("overview");
      return;
    }
    this.h.layers.focusId = filter; // anchor this hub so it stays framed (its orbit + the spin freeze)
    // Frame against the hub's morph-0 world position: root carries the structure's tilt+spin in its
    // ROTATION and the morph collapse in its SCALE. On a geo→hyper switch morph is still 1 at this
    // instant (it eases to 0 over the next frames), so root.scale ≈ 0 and getWorldPosition would
    // return the origin (the "doesn't focus the metagraph" bug). Apply ONLY the rotation to the
    // hub's local orbit position — that's where the hub lands once the morph settles; the spin/orbit
    // are frozen (focusId + non-"all" filter) so it stays valid for the whole tween.
    // Frame against the TARGET rotation — the flattened focus tilt + the (frozen) spin — not the
    // still-easing current root.rotation, so the tween ends exactly where the structure settles.
    this._focusEuler.set(HYPER_TILT_FOCUS, this.h.layers.root.rotation.y, 0);
    this._hubWorld.copy(meta.group.position).applyEuler(this._focusEuler);
    // Plain radial hub framing, world-up, NO camera roll and NO core-corner composition
    // (user, 2026-07-17: the rolled pose + DoF read fuzzy/off — keep the focused pose simple
    // and correct; the rolled hub-focus camera-roll pose was deleted — structure-tilt + plain
    // hubFraming won).
    hubFraming(this._hubWorld, this.out);
    this.tweenTo(this.out.pos, this.out.target);
  }

  /**
   * One double-tap step (domain/tapZoom owns the arithmetic). Two branches, because the camera has
   * two owners:
   *
   * - A commit flight in the air → scale its DESTINATION once, in place, and let the flight land
   *   zoomed in. ⚠️ NOT through `_tweenTo`, which composes `dollyBack` and `railsLean` into every
   *   destination it is handed — routing a direct dolly through it would apply both levers a
   *   second time.
   * - Settled → the eased step below, which is the only camera motion the Engine owns that isn't
   *   a pose.
   */
  tapZoom() {
    if (!this.h.policy().canvas) return; // the flat placeholder views are inert (convention 7)
    if (this.h.transition.active()) return; // the choreography owns the camera
    const controls = this.h.ctx.controls;
    const tw = this._tween;
    if (tw.active) {
      tapZoomAround(tw.toPos, tw.toTgt, controls.minDistance, controls.maxDistance, tw.toPos);
      return;
    }
    // Measured live, so a second pair mid-step continues from where the first one has got to.
    const from = this.h.ctx.camera.position.distanceTo(controls.target);
    const to = tapZoomDistance(from, controls.minDistance, controls.maxDistance);
    if (to === from) return; // already at the floor — nothing to animate
    const z = this._zoom;
    z.from = from;
    z.to = to;
    z.t = 0;
    z.active = true;
  }

  /**
   * The step, applied between the tween and `controls.update()` — so OrbitControls recomputes its
   * spherical from the position we wrote (exactly as it does for the tween), and the altitude
   * clamp downstream still gets the last word. Distance only: the direction is whatever the user
   * has orbited to, and the anchor is the live `controls.target`, so a pan mid-step composes.
   */
  private _updateTapZoom(dt: number) {
    const z = this._zoom;
    if (!z.active) return;
    // A commit flight is a POSE and outranks a nudge along the view vector — drop the step rather
    // than fight it for the camera position.
    if (this._tween.active) {
      z.active = false;
      return;
    }
    z.t = Math.min(1, z.t + dt / TAP_ZOOM_DUR);
    const d = z.from + (z.to - z.from) * easeInOutQuad(z.t);
    const tgt = this.h.ctx.controls.target;
    this.h.ctx.camera.position.sub(tgt).setLength(d).add(tgt);
    if (z.t >= 1) z.active = false;
  }

  private _updateTween(dt: number) {
    const tw = this._tween;
    if (!tw.active) return;
    // Scale ONLY while the transition choreography is live, so an ordinary focus flight (a
    // click while settled — no transition running) stays full speed under ?slowmo.
    tw.t = Math.min(1, tw.t + dt / (tw.dur * (this.h.transition.active() ? this.h.slowmo() : 1)));
    const e = easeInOutQuad(tw.t);
    this.h.ctx.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
    this.h.ctx.controls.target.lerpVectors(tw.fromTgt, tw.toTgt, e);
    // The nudge rides ON TOP of what is otherwise a zero-length flight: a soft push toward the
    // pose's own target and back out, contributing exactly 0 at t=1 so the tween still lands on
    // the committed pose to the pixel.
    if (tw.nudge) this.h.ctx.camera.position.lerp(tw.toTgt, nudgeMix(tw.t));
    if (tw.t >= 1) {
      tw.active = false;
      // The flight's trailing edge — one write, and unconditionally, so a tween STARTED before a
      // transition (or suppressed by one) can never strand the HUD dimmed.
      if (this.h.flyingNow()) this.h.setFlying(false);
    }
  }
}
