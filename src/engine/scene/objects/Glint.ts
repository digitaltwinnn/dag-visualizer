// THE ARRIVAL GLINT — one highlight that runs once along a global snapshot's bar the moment the bar
// is measured, and is gone (user, 2026-11-22: light for "some nice effects", agreed as "a tick
// arriving gets its moment without adding any number or mark").
//
// It is an EVENT, not a state: nothing here says anything a reader could come back and read. The
// bar is the measurement; the glint is the instant it landed. So it is one mesh for the whole
// chamber (two ticks never land inside one sweep's length), it draws nothing while idle, and a
// tick that arrives while the previous sweep is still running simply takes the sweep over.
//
// A flat strip lying on the bar's top face: its width is the bar's own depth along the trail, its
// length the bar's measured width across the lanes, and the highlight is a soft band travelling
// that length. White, like every light in the scene — a glint is a lamp, not a palette hue. The
// ground decides how it lands (the question every additive site answers): added light on dark, a
// pale sheen laid over the ink on paper.

import * as THREE from "three";

/** `seconds` one sweep lasts, `delay` how long after the trigger it starts (the bar is still
 *  rising out of its seed then), `width` the highlight's half-width as a fraction of the bar's
 *  length, and its level on each ground. */
export const GLINT_LOOK: Readonly<{ seconds: number; delay: number; width: number; dark: number; paper: number }> = {
  seconds: 0.85, delay: 0.3, width: 0.09, dark: 0.55, paper: 0.5,
};

export class Glint {
  readonly mesh: THREE.Mesh;
  private readonly _mat: THREE.ShaderMaterial;
  /** Seconds since the trigger; negative while idle. */
  private _t = -1;
  private _paper: boolean;

  constructor(parent: THREE.Object3D, paper: boolean) {
    this._paper = paper;
    this._mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uAt: { value: 0 }, uOp: { value: 0 }, uWidth: { value: GLINT_LOOK.width } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uAt; uniform float uOp; uniform float uWidth;
        varying vec2 vUv;
        void main() {
          // A soft band across the strip at uAt along its length, feathered at the strip's sides.
          float d = (vUv.y - uAt) / uWidth;
          float side = smoothstep(0.0, 0.18, vUv.x) * smoothstep(0.0, 0.18, 1.0 - vUv.x);
          gl_FragColor = vec4(vec3(1.0), exp(-d * d) * side * uOp);
        }
      `,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2); // flat on the bar's top: uv.x along the trail, uv.y across the lanes
    this.mesh = new THREE.Mesh(geo, this._mat);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3; // over the bar it lies on
    parent.add(this.mesh);
    this.setGround(paper);
  }

  /** A bar has just been measured: start one sweep (a running one is taken over). Event-time. */
  fire(): void {
    this._t = 0;
  }

  /** Whether a sweep is running — the caller only needs the bar's place while it is. */
  get running(): boolean {
    return this._t >= 0;
  }

  /** Per frame while running: the bar's centre (`x`, `y` its top face, `z`), its `depth` along the
   *  trail and `length` across the lanes, and the chamber's furniture alpha. `null` for `x` ends the
   *  sweep (the row left the trail). Allocation-free. */
  update(dt: number, x: number | null, y: number, z: number, depth: number, length: number, alpha: number): void {
    if (this._t < 0) return;
    this._t += dt;
    const p = (this._t - GLINT_LOOK.delay) / GLINT_LOOK.seconds;
    if (x == null || p >= 1) {
      this._t = -1;
      this.mesh.visible = false;
      return;
    }
    if (p < 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.set(x, y, z);
    this.mesh.scale.set(depth, 1, length);
    // The band enters past one end and leaves past the other, eased; its level rises and falls
    // with it, so nothing pops on or off.
    const e = p * p * (3 - 2 * p);
    this._mat.uniforms.uAt.value = -GLINT_LOOK.width * 2 + e * (1 + GLINT_LOOK.width * 4);
    this._mat.uniforms.uOp.value = Math.sin(Math.PI * p) * alpha * (this._paper ? GLINT_LOOK.paper : GLINT_LOOK.dark);
  }

  /** THEME FLIP (and construction). Event-time — three caches the program per blend mode. */
  setGround(paper: boolean): void {
    this._paper = paper;
    this._mat.blending = paper ? THREE.NormalBlending : THREE.AdditiveBlending;
    this._mat.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this._mat.dispose();
  }
}
