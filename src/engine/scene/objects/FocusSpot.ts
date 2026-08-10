// One reusable focus STAGE-LIGHT: a real THREE.SpotLight staged above a focused subject along a
// caller-supplied normal, so the selection catches a light wash on top of the camera/dim emphasis
// (user: the zoomed-in modes across views benefit from a spotlight). Each view owns an instance and
// DRIVES it per frame — hyper stages it over the focused atom (or the DAG core), geo over the
// selected node's chip stack, ledger over the committed settlement layer's lead area.
//
// Neutral WHITE on purpose: lighting is a rendering technicality decoupled from the palette (see
// SceneContext's LIGHT_* note; greyscale is exempt from the no-hardcoded-colours guard), and a white
// key over the identity-hued emissive meshes brightens them without shifting their hue. decay 0 =
// no attenuation inside `distance` (predictable, non-physical) — size `distance` past the farthest
// lit point. Intensity eases in/out (no pop) and the light SLEEPS (visible=false) when dark.
import * as THREE from "three";

export class FocusSpot {
  readonly light: THREE.SpotLight;
  private _i = 0; // eased intensity
  private _full: number; // target intensity while on

  constructor(scene: THREE.Scene, opts: { angle: number; distance: number; intensity: number; penumbra?: number }) {
    this._full = opts.intensity;
    this.light = new THREE.SpotLight(0xffffff, 0, opts.distance, opts.angle, opts.penumbra ?? 0.5, 0);
    this.light.visible = false;
    scene.add(this.light);
    scene.add(this.light.target);
  }

  // Place the stage over the subject (both WORLD space): light `height` above it along `normal`,
  // aimed at it. Call only while the subject is live — during a fade-out the light dims in place
  // (re-aiming from stale data is the caller's bug to avoid, not this class's job to guess).
  aim(subjectWorld: THREE.Vector3, normalWorld: THREE.Vector3, height: number): void {
    this.light.target.position.copy(subjectWorld);
    this.light.position.copy(subjectWorld).addScaledVector(normalWorld, height);
  }

  // Re-push a staging row onto the live light. The constructor BAKES its opts into the SpotLight,
  // so the `?tune` panel needs this to make STAGE_LIGHTS edits visible without a reload — `height`
  // needs no setter, since aim() reads it fresh every frame. Dev-only in practice; harmless
  // otherwise (it is exactly what the constructor does).
  setStaging(opts: { angle: number; distance: number; intensity: number; penumbra?: number }): void {
    this._full = opts.intensity;
    this.light.distance = opts.distance;
    this.light.angle = opts.angle;
    this.light.penumbra = opts.penumbra ?? 0.5;
  }

  // Per-frame intensity ease toward on/off; `fade` scales the on-target (morph/view ramps).
  update(dt: number, on: boolean, fade = 1): void {
    this._i += ((on ? this._full * fade : 0) - this._i) * Math.min(1, dt * 3);
    this.light.intensity = this._i;
    this.light.visible = this._i > 0.02;
  }

  // Instant off — for hosts whose update() stops ticking when their view hides (the ledger chamber
  // pops out on a view switch, so an instant light-off matches; an orphaned lit spot would linger).
  blackout(): void {
    this._i = 0;
    this.light.intensity = 0;
    this.light.visible = false;
  }
}
