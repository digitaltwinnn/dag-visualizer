// THE FLOOR MIRROR — the Snapshots chamber's global floor, reflecting what stands on it.
//
// The floor is glass, and glass that shows nothing of the bars standing on it and the sheets
// falling to it reads as a drawn rectangle. This is three's own planar `Reflector` (the scene
// rendered once more from the mirrored camera, clipped at the plane), drawn as ADDED LIGHT at a
// fraction of its level and feathered to nothing at the floor's edges — a sheen, never a second
// chamber. What it shows is the scene itself, so it states nothing the chamber does not.
//
// Three decisions:
//  · The mirror plane sits `lift` ABOVE the glass. Everything lying IN the floor — the ordinal and
//    size columns, their dotted lines, the live edge, the silent stretch — is below the clip, so
//    none of it is reflected: a mirrored copy would land exactly under its own text and blur it.
//  · The two grounds composite it in opposite directions (the ground rule every additive site here
//    answers). Dark ADDS the reflected light. Light added to a printed sheet is a bleach, so paper
//    MULTIPLIES: the reflection is divided by the plate's own colour, which leaves 1 wherever the
//    mirror sees only the page and the mark's ink where it sees a mark, and the floor is darkened
//    toward that — a reflection made of ink, which can tint and never blow out.
//  · It costs one more scene render at `MIRROR_RES`, only while the chamber is on screen: the
//    Reflector renders from its own `onBeforeRender`, which a hidden mesh never reaches.

import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

/** The mirror's look: `strength` the share of the reflected light that is added, `lift` how far
 *  above the glass the mirror plane (and so its clip) sits, `feather` the fraction of each side
 *  over which it fades out, `back` the same for the far end, where the floor itself dissolves. */
export const MIRROR_LOOK: Readonly<{ strength: number; strengthPaper: number; lift: number; feather: number; back: number }> = {
  strength: 0.2, strengthPaper: 0.4, lift: 0.12, feather: 0.08, back: 0.4,
};
const MIRROR_RES = { w: 1024, h: 640 } as const;

const MIRROR_SHADER = {
  name: "FloorMirror",
  uniforms: {
    color: { value: null }, // the Reflector writes it; this shader does not read it
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uOp: { value: 0 },
    uPaper: { value: 0 },
    uGround: { value: new THREE.Color() },
    uFeather: { value: new THREE.Vector2(MIRROR_LOOK.feather, MIRROR_LOOK.back) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec2 vP;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vP = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uOp;
    uniform float uPaper;
    uniform vec3 uGround;
    uniform vec2 uFeather;
    varying vec4 vUv;
    varying vec2 vP;
    void main() {
      vec3 r = texture2DProj(tDiffuse, vUv).rgb;
      // uv.x runs back -> front along the trail, uv.y across the lanes.
      float f = smoothstep(0.0, uFeather.y, vP.x) * smoothstep(0.0, uFeather.x, 1.0 - vP.x)
              * smoothstep(0.0, uFeather.x, vP.y) * smoothstep(0.0, uFeather.x, 1.0 - vP.y);
      // Dark: light to add. Paper: a factor to multiply the floor by (1 = the bare page).
      vec3 ink = mix(vec3(1.0), clamp(r / max(uGround, vec3(1e-3)), 0.0, 1.0), uOp * f);
      gl_FragColor = vec4(mix(r * uOp * f, ink, uPaper), 1.0);
    }
  `,
};

export class FloorMirror {
  readonly mesh: Reflector;
  private _paper: boolean;

  /** `w` along the trail, `d` across the lanes, centred on (`cx`, `y`, 0) in the parent's frame —
   *  the global floor's own extents. */
  constructor(parent: THREE.Group, w: number, d: number, cx: number, y: number, paper: boolean, ground: number) {
    this._paper = paper;
    this.mesh = new Reflector(new THREE.PlaneGeometry(w, d), {
      textureWidth: MIRROR_RES.w, textureHeight: MIRROR_RES.h, multisample: 2, shader: MIRROR_SHADER,
    });
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.transparent = true;
    mat.depthWrite = false;
    // Paper's multiply, spelled as factors (src × dst): three's own MultiplyBlending asks for a
    // premultiplied material, which this is not.
    mat.blendSrc = THREE.DstColorFactor;
    mat.blendDst = THREE.ZeroFactor;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(cx, y + MIRROR_LOOK.lift, 0);
    this.mesh.renderOrder = -1; // over the glass (-2), under everything that stands on it
    parent.add(this.mesh);
    this.setGround(paper, ground);
  }

  /** The chamber's furniture alpha, per frame. At 0 the mesh hides, and its render with it. */
  setAlpha(a: number): void {
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uOp.value =
      a * (this._paper ? MIRROR_LOOK.strengthPaper : MIRROR_LOOK.strength);
    this.mesh.visible = a > 0.001;
  }

  /** THEME FLIP (and construction): the blend the ground needs, and the plate's colour the paper
   *  term divides by. Event-time — three caches the program per blend mode, hence `needsUpdate`. */
  setGround(paper: boolean, ground: number): void {
    this._paper = paper;
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.blending = paper ? THREE.CustomBlending : THREE.AdditiveBlending;
    mat.uniforms.uPaper.value = paper ? 1 : 0;
    (mat.uniforms.uGround.value as THREE.Color).setHex(ground);
    mat.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.mesh.geometry.dispose();
  }
}
