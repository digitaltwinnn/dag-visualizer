// THE stage light — ONE THREE.SpotLight for the whole app, staged per frame over whichever view's
// focused subject CLAIMS it (hyper: the focused NODE, else its hub, else the DAG core; geo: the
// focused node's chip stack). The 3D views never coexist, so a second light could only ever be a
// dark one.
//
// ⚠️ This replaced a two-class arrangement (a `FocusSpot` per view + a `StageLights` registry that
// blacked out the spots of dark views). The registry existed to centralize the OFF switch, because a
// view that forgot its own spotOff left a lit beam hanging in the next view. The claim model deletes
// that bug class instead of guarding it: **not claiming IS off**, so there is nothing to forget and
// no gate to call. Every `aim()` already supplied subject, normal and height per frame, so a view
// owned nothing durable in its spot worth a second class.
//
// Neutral WHITE on purpose: lighting is a rendering technicality decoupled from the palette (the
// rig's own header states the rule; greyscale is exempt from the no-hardcoded-colours guard), and a
// white key over the identity-hued emissive meshes brightens them without shifting their hue.
// decay 0 = no attenuation inside `distance` (predictable, non-physical). Intensity eases in/out
// (no pop) and the light SLEEPS (visible=false) when dark.
import * as THREE from "three";
import { STAGE_LIGHTS, type StagedView } from "../../domain/stageLight";

export class StageLight {
  readonly light: THREE.SpotLight;
  private _i = 0; // eased intensity

  // The frame's presence per view (furniture alpha) and its winning claim. Both allocated once.
  private presence: Record<StagedView, number> = { hyper: 0, geo: 0, ledger: 0 };
  private claimed: StagedView | null = null;
  private weight = 0;
  private readonly pos = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private height = 0;
  /** Per-subject cone override (see claim); undefined falls through to the row's own angle. */
  private angle: number | undefined;
  /** THE GROUND. A lamp is not the same instrument on paper as on black (see the row's
   *  `intensityPaper`), so the one thing this class reads per theme is which level to ease toward.
   *  Swap-in-place, like every other themed value in the engine: nothing is rebuilt. */
  private paper = false;

  constructor(scene: THREE.Scene) {
    // Staging arrives per frame from STAGE_LIGHTS (so a `?tune` edit lands with no reload and no
    // re-push callback) — nothing is baked here but the light's existence.
    this.light = new THREE.SpotLight(0xffffff, 0, 0, 0, 0.5, 0);
    this.light.visible = false;
    scene.add(this.light);
    scene.add(this.light.target);
  }

  /** THEME FLIP — which level the claims ease toward (see `paper` above). Event-driven, not
   *  per frame: the Engine calls it from its one theme thread. */
  setGround(light: boolean): void {
    this.paper = light;
  }

  /** The Engine calls this ONCE PER FRAME, BEFORE the view updates that claim — a claim scales by
   *  its view's presence, so a stale value would light a view that is fading out. */
  setPresence(hyper: number, geo: number, ledger: number): void {
    this.presence.hyper = hyper;
    this.presence.geo = geo;
    this.presence.ledger = ledger;
  }

  /** Claim the light for this view's subject (both vectors WORLD space): lit `height` above it
   *  along `normal`, aimed at it. `fade` is the view's own subject ramp (a hub reveal, a morph);
   *  view PRESENCE is applied here, so a caller must not pre-multiply it. `angle` overrides the
   *  row's cone for a subject staged at a different SCALE — hyper stages a core, a hub and a single
   *  node, and the height alone cannot make a hub-sized cone read as a pool on one bead. Strongest
   *  claim wins, and claiming nothing leaves the light to ease out. */
  claim(
    view: StagedView, subject: THREE.Vector3, normal: THREE.Vector3, height: number,
    fade = 1, angle?: number,
  ): void {
    const w = fade * this.presence[view];
    if (w <= this.weight) return;
    this.weight = w;
    this.claimed = view;
    this.pos.copy(subject);
    this.normal.copy(normal);
    this.height = height;
    this.angle = angle;
  }

  /** Per frame, after every view has had its chance to claim: stage + aim the winner, ease toward
   *  its weight, then release so the next frame starts from no claim. */
  update(dt: number): void {
    if (this.claimed) {
      const row = STAGE_LIGHTS[this.claimed];
      this.light.distance = row.distance;
      this.light.angle = this.angle ?? row.angle;
      this.light.penumbra = row.penumbra ?? 0.5;
      this.light.target.position.copy(this.pos);
      this.light.position.copy(this.pos).addScaledVector(this.normal, this.height);
      const target = (this.paper ? row.intensityPaper ?? row.intensity : row.intensity) * this.weight;
      this._i += (target - this._i) * Math.min(1, dt * 3);
    } else {
      this._i += -this._i * Math.min(1, dt * 3);
    }
    this.light.intensity = this._i;
    this.light.visible = this._i > 0.02;
    this.claimed = null;
    this.weight = 0;
    this.angle = undefined;
  }
}
