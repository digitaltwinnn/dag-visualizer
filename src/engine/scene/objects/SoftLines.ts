// SOFT LINES — hairlines drawn as thin screen-space strips with an antialiased edge (user, 2026-11-09:
// the Transaction blocks DAG's links showed "color/jagged artifacts … more with the bloom"; FXAA over
// the whole frame was tried and dropped — it smeared every 1px mark, the floor's ordinals included).
//
// WHY NOT A LineSegments: the renderer runs without MSAA on purpose (`SceneContext`), so a GL line is
// a 1-device-pixel stair-step, and on the dark ground the whole-frame half-res bloom haloes each step
// into a fringe that crawls as the camera moves. Here every segment is a quad expanded perpendicular
// to its SCREEN direction in the vertex shader, and the fragment's alpha falls off linearly to 0 at
// `HALF_PX` device pixels from the centre line — a triangular coverage profile whose integral across
// the line is the same as a hard 1px line's, so a link carries the same light, just without the steps.
// Hi-DPI screens get the same profile at their own pixel size (the width is in DEVICE pixels, like a
// GL line's), which is why the change is invisible on a phone and visible on a 1× monitor.
//
// Layout: 4 vertices a segment (A−, A+, B−, B+), a static index (two triangles a segment). `position`
// is the segment's A end on all four, `aB` its B end, `aCorner` (end, side) the static corner code,
// `aColor` RGBA per vertex — A's two vertices take the A alpha, B's the B alpha, so a fade along a
// polyline reads exactly as the line's per-vertex colours did. Positions are written at event time,
// alpha per frame; both upload only the written range (the chamber's ranged-upload rule). Its one
// uniform, the drawing buffer's size, is refreshed in `onBeforeRender` from a reused vector (rule 5).
import * as THREE from "three";
import { glowBlend, type SceneColors } from "../../sceneColors";

/** The line's half width in DEVICE pixels — the distance at which its alpha reaches 0. */
export const SOFT_LINE_HALF_PX = 1;

const _buf = new THREE.Vector2();

export class SoftLines {
  readonly mesh: THREE.Mesh;
  private readonly _geo = new THREE.BufferGeometry();
  private readonly _mat: THREE.ShaderMaterial;
  private readonly _a: THREE.Float32BufferAttribute;
  private readonly _b: THREE.Float32BufferAttribute;
  private readonly _col: THREE.Float32BufferAttribute;
  private readonly _max: number;
  private _count = 0;

  constructor(maxSegs: number, colors: SceneColors) {
    this._max = maxSegs;
    const V = maxSegs * 4;
    this._a = new THREE.Float32BufferAttribute(new Float32Array(V * 3), 3);
    this._b = new THREE.Float32BufferAttribute(new Float32Array(V * 3), 3);
    this._col = new THREE.Float32BufferAttribute(new Float32Array(V * 4), 4);
    this._a.setUsage(THREE.DynamicDrawUsage);
    this._b.setUsage(THREE.DynamicDrawUsage);
    this._col.setUsage(THREE.DynamicDrawUsage);
    const corner = new Float32Array(V * 2);
    const index = new Uint32Array(maxSegs * 6);
    for (let s = 0; s < maxSegs; s++) {
      const v = s * 4;
      // (end, side): A−, A+, B−, B+
      corner.set([0, -1, 0, 1, 1, -1, 1, 1], v * 2);
      index.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], s * 6);
    }
    this._geo.setAttribute("position", this._a);
    this._geo.setAttribute("aB", this._b);
    this._geo.setAttribute("aCorner", new THREE.Float32BufferAttribute(corner, 2));
    this._geo.setAttribute("aColor", this._col);
    this._geo.setIndex(new THREE.BufferAttribute(index, 1));
    this._geo.setDrawRange(0, 0);

    this._mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: glowBlend(colors),
      uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uHalf: { value: SOFT_LINE_HALF_PX } },
      vertexShader: `
        uniform vec2 uRes; uniform float uHalf;
        attribute vec3 aB; attribute vec2 aCorner; attribute vec4 aColor;
        varying vec4 vColor; varying float vDist;
        void main() {
          vec4 ca = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vec4 cb = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
          vColor = aColor;
          vDist = aCorner.y * uHalf;
          // An end behind the camera has no screen direction: the segment is not drawn (the chamber's
          // links never reach the near plane at any pose the camera takes).
          if (ca.w <= 0.0 || cb.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vec2 halfRes = uRes * 0.5; // (\`half\` is a GLSL reserved word)
          vec2 sa = ca.xy / ca.w * halfRes;
          vec2 sb = cb.xy / cb.w * halfRes;
          vec2 d = sb - sa;
          float len = length(d);
          vec2 dir = len > 1e-5 ? d / len : vec2(1.0, 0.0);
          vec2 nrm = vec2(-dir.y, dir.x);
          bool atB = aCorner.x > 0.5;
          vec4 c = atB ? cb : ca;
          vec2 s = (atB ? sb : sa) + nrm * (aCorner.y * uHalf);
          gl_Position = vec4(s / halfRes * c.w, c.z, c.w);
        }`,
      fragmentShader: `
        uniform float uHalf;
        varying vec4 vColor; varying float vDist;
        void main() {
          // Triangular coverage: 1 on the centre line, 0 at uHalf device pixels out.
          float a = vColor.a * clamp(1.0 - abs(vDist) / uHalf, 0.0, 1.0);
          if (a <= 0.002) discard;
          gl_FragColor = vec4(vColor.rgb, a);
        }`,
    });
    this.mesh = new THREE.Mesh(this._geo, this._mat);
    this.mesh.frustumCulled = false;
    this.mesh.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(_buf);
      (this._mat.uniforms.uRes.value as THREE.Vector2).copy(_buf);
    };
  }

  /** EVENT-TIME: segment `i`'s two ends. */
  setSegment(i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const a = this._a.array as Float32Array;
    const b = this._b.array as Float32Array;
    for (let k = 0; k < 4; k++) {
      const v = (i * 4 + k) * 3;
      a[v] = ax; a[v + 1] = ay; a[v + 2] = az;
      b[v] = bx; b[v + 1] = by; b[v + 2] = bz;
    }
  }

  /** EVENT-TIME: segment `i`'s colour (its alpha rides `setAlpha`). */
  setColor(i: number, r: number, g: number, b: number): void {
    const c = this._col.array as Float32Array;
    for (let k = 0; k < 4; k++) {
      const v = (i * 4 + k) * 4;
      c[v] = r; c[v + 1] = g; c[v + 2] = b;
    }
  }

  /** PER FRAME: segment `i`'s alpha at its A end and its B end. */
  setAlpha(i: number, a0: number, a1: number): void {
    const c = this._col.array as Float32Array;
    const v = i * 16;
    c[v + 3] = a0;
    c[v + 7] = a0;
    c[v + 11] = a1;
    c[v + 15] = a1;
  }

  /** The first `n` segments are drawn; uploads the written range of positions and/or colours. */
  commit(n: number, positions: boolean, colors: boolean): void {
    this._count = Math.min(n, this._max);
    const V = this._count * 4;
    if (V > 0 && positions) {
      this._a.clearUpdateRanges();
      this._a.addUpdateRange(0, V * 3);
      this._a.needsUpdate = true;
      this._b.clearUpdateRanges();
      this._b.addUpdateRange(0, V * 3);
      this._b.needsUpdate = true;
    }
    if (V > 0 && colors) {
      this._col.clearUpdateRanges();
      this._col.addUpdateRange(0, V * 4);
      this._col.needsUpdate = true;
    }
    this._geo.setDrawRange(0, this._count * 6);
  }

  get count(): number {
    return this._count;
  }

  setColors(c: SceneColors): void {
    this._mat.blending = glowBlend(c);
    this._mat.needsUpdate = true; // blending is a program flag
  }

  dispose(): void {
    this._geo.dispose();
    this._mat.dispose();
  }
}
