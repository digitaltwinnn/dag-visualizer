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
//  · Dark only. Light added to a printed sheet is a bleach (the ground rule every additive site
//    here answers), so on paper the mesh is hidden and its render never runs.
//  · It costs one more scene render at `MIRROR_RES`, only while the chamber is on screen: the
//    Reflector renders from its own `onBeforeRender`, which a hidden mesh never reaches.

import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

/** The mirror's look: `strength` the share of the reflected light that is added, `lift` how far
 *  above the glass the mirror plane (and so its clip) sits, `feather` the fraction of each side
 *  over which it fades out, `back` the same for the far end, where the floor itself dissolves. */
export const MIRROR_LOOK: Readonly<{ strength: number; lift: number; feather: number; back: number }> = {
  strength: 0.3, lift: 0.12, feather: 0.08, back: 0.4,
};
const MIRROR_RES = { w: 1024, h: 640 } as const;

const MIRROR_SHADER = {
  name: "FloorMirror",
  uniforms: {
    color: { value: null }, // the Reflector writes it; this shader does not read it
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uOp: { value: 0 },
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
    uniform vec2 uFeather;
    varying vec4 vUv;
    varying vec2 vP;
    void main() {
      vec3 r = texture2DProj(tDiffuse, vUv).rgb;
      // uv.x runs back -> front along the trail, uv.y across the lanes.
      float f = smoothstep(0.0, uFeather.y, vP.x) * smoothstep(0.0, uFeather.x, 1.0 - vP.x)
              * smoothstep(0.0, uFeather.x, vP.y) * smoothstep(0.0, uFeather.x, 1.0 - vP.y);
      gl_FragColor = vec4(r * uOp * f, 1.0);
    }
  `,
};

export class FloorMirror {
  readonly mesh: Reflector;
  private _paper: boolean;

  /** `w` along the trail, `d` across the lanes, centred on (`cx`, `y`, 0) in the parent's frame —
   *  the global floor's own extents. */
  constructor(parent: THREE.Group, w: number, d: number, cx: number, y: number, paper: boolean) {
    this._paper = paper;
    this.mesh = new Reflector(new THREE.PlaneGeometry(w, d), {
      textureWidth: MIRROR_RES.w, textureHeight: MIRROR_RES.h, multisample: 2, shader: MIRROR_SHADER,
    });
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(cx, y + MIRROR_LOOK.lift, 0);
    this.mesh.renderOrder = -1; // over the glass (-2), under everything that stands on it
    this.mesh.visible = !paper;
    parent.add(this.mesh);
  }

  /** The chamber's furniture alpha, per frame. At 0 the mesh hides, and its render with it. */
  setAlpha(a: number): void {
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uOp.value = a * MIRROR_LOOK.strength;
    this.mesh.visible = !this._paper && a > 0.001;
  }

  setPaper(paper: boolean): void {
    this._paper = paper;
    this.mesh.visible = !paper;
  }

  dispose(): void {
    this.mesh.dispose();
    this.mesh.geometry.dispose();
  }
}
