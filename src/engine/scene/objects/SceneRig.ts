// THE SCENE RIG — the app's one ambient + three-point directional set, staged per frame from the
// per-view rows in `domain/sceneRig.ts`.
//
// It is the STAGE LIGHT's sibling and deliberately its opposite. The StageLight is a CLAIM: one
// subject, strongest claim wins, not claiming IS off. The rig is a BLEND: every view is always
// lighting the scene, weighted by the same per-view presence the light's claims are scaled by, so a
// view transition cross-fades one room's lighting into the next instead of cutting. Both read their
// numbers per frame, so a `?tune` edit lands with no reload and no re-push callback.
//
// ⚠️ DIRECTIONAL, NOT POSITIONAL — see the domain module's header. A directional light has ONE
// direction for the whole field, which is what makes a hundred spheres read as one lit scene; the
// point lights this replaced gave every node its own angle and so gave the field no shared form.
// `RIG_R` is therefore cosmetic (a directional light's position only fixes its direction) and no
// knob: nothing here casts a shadow map that would care how far away the lamp sits.
//
// Colour comes from `tempTint` — a temperature, never a palette hue (lighting is a rendering
// technicality, decoupled from the design tokens both ways).
import * as THREE from "three";
import { SCENE_RIG, RIG_PAPER, tempTint, type RigRow } from "../../domain/sceneRig";

/** How far the lamps are staged from the origin. Cosmetic — see the header. */
const RIG_R = 120;

export class SceneRig {
  private readonly ambient: THREE.AmbientLight;
  private readonly key: THREE.DirectionalLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly rim: THREE.DirectionalLight;
  /** The frame's blended row. Allocated once and rewritten in place — never replaced. */
  private readonly mix: RigRow;
  private paper = false;
  /** The key's world direction (subject → lamp), published for the views that need to agree with
   *  it. Geo's globe shades its day side from exactly this vector, which is what makes ONE light
   *  serve as both the scene's key and the globe's sun. */
  readonly keyDir = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene) {
    this.ambient = new THREE.AmbientLight(0xffffff, 0);
    this.key = new THREE.DirectionalLight(0xffffff, 0);
    this.fill = new THREE.DirectionalLight(0xffffff, 0);
    this.rim = new THREE.DirectionalLight(0xffffff, 0);
    scene.add(this.ambient, this.key, this.fill, this.rim);
    // Each light's target is its own object at the origin; only the DIRECTION matters, so the
    // targets never move and never need adding to the scene graph individually beyond this.
    for (const l of [this.key, this.fill, this.rim]) scene.add(l.target);
    this.mix = { ...SCENE_RIG.hyper };
  }

  /** THE GROUND (theme flip). Plain data in — the Engine's swap-in-place contract: nothing here is
   *  rebuilt, the next frame simply multiplies by the other set. */
  setGround(light: boolean): void {
    this.paper = light;
  }

  /**
   * Stage the frame's rig. `w*` are the same per-view furniture presences the StageLight's claims
   * are scaled by, so the lighting fades between views exactly as the furniture does.
   *
   * ⚠️ When every weight is ~0 (mid-transition, or a flat "soon" view with the canvas fading) the
   * blend is UNDEFINED, not dark: the previous frame's mix stands. Normalising a zero would black
   * the scene out at the one moment it is most visible — the gather boundary.
   */
  update(camera: THREE.Camera, target: THREE.Vector3, wHyper: number, wGeo: number, wLedger: number): void {
    const total = wHyper + wGeo + wLedger;
    if (total > 1e-3) {
      const kh = wHyper / total, kg = wGeo / total, kl = wLedger / total;
      const h = SCENE_RIG.hyper, g = SCENE_RIG.geo, l = SCENE_RIG.ledger;
      const m = this.mix;
      // Hoist rule: each row is read once per FRAME here, and every consumer below reads `m`.
      for (const f of RIG_FIELDS) m[f] = h[f] * kh + g[f] * kg + l[f] * kl;
    }
    const m = this.mix;
    const paper = this.paper;
    const gAmb = paper ? RIG_PAPER.amb : 1;
    const gKey = paper ? RIG_PAPER.key : 1;
    const gFill = paper ? RIG_PAPER.fill : 1;
    const gRim = paper ? RIG_PAPER.rim : 1;

    // The camera's own bearing — every azimuth in a row is an offset from THIS, so the lit side is
    // always a side the viewer can see (the rig follows the actor).
    const camAz = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);

    this.ambient.intensity = m.ambInt * gAmb;
    tempTint(m.ambTemp, this.ambient.color);

    this._aim(this.key, camAz + m.keyAz, m.keyEl, m.keyInt * gKey, m.keyTemp);
    this.keyDir.copy(this.key.position).normalize();
    // The fill is staged OPPOSITE the key (+ its own offset) — the shadow side is by definition the
    // side the key is not on, so it is derived rather than aimed independently.
    this._aim(this.fill, camAz + m.keyAz + Math.PI + m.fillAz, m.fillEl, m.fillInt * gFill, m.fillTemp);
    this._aim(this.rim, camAz + m.rimAz, m.rimEl, m.rimInt * gRim, m.rimTemp);
  }

  private _aim(light: THREE.DirectionalLight, az: number, el: number, intensity: number, temp: number): void {
    const ce = Math.cos(el);
    light.position.set(ce * Math.sin(az) * RIG_R, Math.sin(el) * RIG_R, ce * Math.cos(az) * RIG_R);
    light.intensity = intensity;
    tempTint(temp, light.color);
  }
}

/** The blended fields, listed once so the mix loop can't silently miss one a row grows later.
 *  ⚠️ Angles are blended LINEARLY, which is correct only while the rows sit in one neighbourhood —
 *  they do, by design (a rig is a rig in every view; the views differ in strength and temperature,
 *  not in which side the key is on). A row aimed across the ±π seam would swing the blend the long
 *  way round mid-transition, so keep new azimuths near their siblings. */
const RIG_FIELDS: (keyof RigRow)[] = [
  "keyAz", "keyEl", "keyInt", "keyTemp",
  "fillAz", "fillEl", "fillInt", "fillTemp",
  "rimAz", "rimEl", "rimInt", "rimTemp",
  "ambInt", "ambTemp",
];
