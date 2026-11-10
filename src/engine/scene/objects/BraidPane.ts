// THE BRAID PANE — the soft sheet the DAG braid stands against in the Transaction blocks register
// (user, 2026-11-08: "give the vertical plane that the DAG layouts sit on a subtle transparent fill";
// then, of the chamber's glass fill tried first: "too bright and the edges should be soft instead of
// hard, I think glass is not the right look for this one"). So it is NOT a pane of the chamber's
// glass: no rim band, no corner clip, no hairline — one flat whisper of the core tone whose alpha
// falls to nothing over the outer stretch of every edge (`soft`, a fraction of each half extent),
// and the trail's horizon ramp along x so it dissolves where the trail does. Additive on the dark
// ground, the muted ink at normal blending on paper (`glowBlend`, rule 3: no colour literal). It is
// a backdrop: no depth write, never a pick blocker, drawn only while DAG blocks stand (the view owns
// that gate and the view fade). Layout data in, one uniform write per frame, no allocation (rule 5).
import * as THREE from "three";
import { glowBlend, isLightGround, type SceneColors } from "../../sceneColors";

/** The pane's look — one plain constant (src/engine/CLAUDE.md). `alpha` is the dark ground's
 *  whisper, `alphaPaper` the ink's; `soft` the edge falloff as a fraction of each half extent. */
export const BRAID_PANE_LOOK: Readonly<{ alpha: number; alphaPaper: number; soft: number }> = { alpha: 0.028, alphaPaper: 0.16, soft: 0.45 };

interface PaneUniforms {
  uColor: { value: THREE.Color };
  uAlpha: { value: number };
  uSoft: { value: number };
  uFadeAt: { value: number };
  uFadeSpan: { value: number };
}

export class BraidPane {
  readonly mesh: THREE.Mesh;
  private readonly _u: PaneUniforms;
  private readonly _mat: THREE.ShaderMaterial;
  private _paper: boolean;

  /** A sheet `w` wide (x) and `h` tall (y) in the x–y plane, centred at (cx, cy, cz), facing +z. */
  constructor(parent: THREE.Object3D, colors: SceneColors, o: { w: number; h: number; cx: number; cy: number; cz: number }) {
    this._paper = isLightGround(colors);
    this._mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: glowBlend(colors),
      uniforms: {
        uColor: { value: new THREE.Color(this._paper ? colors.muted : colors.core) },
        uAlpha: { value: 0 },
        uSoft: { value: BRAID_PANE_LOOK.soft },
        uHalfW: { value: o.w / 2 },
        uFadeAt: { value: 0 },
        uFadeSpan: { value: 0 },
      },
      vertexShader: `
        varying vec2 vP;
        void main() {
          vP = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uAlpha; uniform float uSoft; uniform float uHalfW;
        uniform float uFadeAt; uniform float uFadeSpan;
        varying vec2 vP;
        void main() {
          // Soft on every side: full in the middle, gone at the edge, over the outer \`uSoft\` of each half.
          float ex = smoothstep(0.0, uSoft, 1.0 - abs(vP.x));
          float ey = smoothstep(0.0, uSoft, 1.0 - abs(vP.y));
          // The trail's horizon (the same ramp the floors take): alpha reaches 0 at uFadeAt along -x.
          float fade = 1.0;
          if (uFadeSpan > 0.0) fade = smoothstep(uFadeAt, uFadeAt + uFadeSpan, vP.x * uHalfW);
          float a = uAlpha * ex * ey * fade;
          if (a <= 0.002) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this._u = this._mat.uniforms as unknown as PaneUniforms;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), this._mat);
    this.mesh.position.set(o.cx, o.cy, o.cz);
    this.mesh.renderOrder = -2;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  /** The horizon ramp in the pane's own x (world `atX` less the pane's centre), as the floors state it. */
  setHorizon(atX: number, span: number): void {
    this._u.uFadeAt.value = atX - this.mesh.position.x;
    this._u.uFadeSpan.value = span;
  }

  /** Per frame: shown or not, at the view's furniture alpha. */
  apply(on: boolean, alpha: number): void {
    this.mesh.visible = on && alpha > 0.002;
    if (!this.mesh.visible) return;
    this._u.uAlpha.value = (this._paper ? BRAID_PANE_LOOK.alphaPaper : BRAID_PANE_LOOK.alpha) * alpha;
  }

  setColors(c: SceneColors): void {
    this._paper = isLightGround(c);
    this._u.uColor.value.setHex(this._paper ? c.muted : c.core);
    this._mat.blending = glowBlend(c);
    this._mat.needsUpdate = true; // blending is a program flag, not a uniform
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this._mat.dispose();
  }
}
