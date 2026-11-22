// THE LIFT MIST — what holds a data block over its snapshot: a soft column of the block's own light
// rising from the tile and thinning to nothing under the block (user, 2026-11-23: "what about some
// levitating / glow / mist from the snapshot instead of hard lines?").
//
// A block was tied to its snapshot by one hairline (2026-11-09), then by four from the tile's
// corners. Both are DRAWN ties, and a drawn tie reads as a strut: the block stood on a frame. What
// the lift should say is that the block came off the snapshot and hangs there — so the tie is
// light, not line. One instanced shell per drawn column: the tile's footprint at the bottom,
// narrowing to the block's at the top, with NO edge anywhere — each face fades to nothing at its
// own sides, the column is strongest where it leaves the tile and gone before it reaches the
// block, and a slow band drifts up it, so the eye is led from the snapshot to the block.
//
// The shell's proportions are the lift's own (`DATA_MARK`), which are fractions of the TILE — so
// one unit geometry serves every column, scaled by its tile's size. Colour is per instance, the
// column's ink that frame. The ground decides how it lands (the question every additive site
// answers): added light on dark, a thin wash of the ink on paper.

import * as THREE from "three";

/** `dark` and `paper` are the mist's level where it leaves the tile; `reach` the share of the lift
 *  it has faded out by (the block hangs clear above it); `drift` how much of the level the rising
 *  band carries, and `seconds` how long one band takes to climb the column. */
export const MIST_LOOK: Readonly<{ dark: number; paper: number; reach: number; drift: number; seconds: number }> = {
  dark: 0.5, paper: 0.34, reach: 0.92, drift: 0.35, seconds: 3.2,
};

export class LiftMist {
  readonly mesh: THREE.InstancedMesh;
  private readonly _mat: THREE.ShaderMaterial;
  private _paper: boolean;

  /** `max` columns; the shell is `foot` of the tile's footprint wide at its top and `height` tall,
   *  both in tile sizes (a column's instance scale is its tile's size). */
  constructor(parent: THREE.Object3D, max: number, foot: number, height: number, paper: boolean) {
    this._paper = paper;
    // Four faces, bottom (the tile's edge) to top (the block's): uv.x runs across a face, uv.y up it.
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const b = 0.5, t = 0.5 * foot;
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
    for (let f = 0; f < 4; f++) {
      const [ax, az] = ring[f]!, [bx, bz] = ring[(f + 1) % 4]!;
      const o = pos.length / 3;
      pos.push(ax * b, 0, az * b, bx * b, 0, bz * b, bx * t, height, bz * t, ax * t, height, az * t);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this._mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uOp: { value: 0 },
        uTime: { value: 0 },
        uLook: { value: new THREE.Vector2(MIST_LOOK.reach, MIST_LOOK.drift) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vCol;
        void main() {
          vUv = uv;
          vCol = vec3(1.0);
          #ifdef USE_INSTANCING_COLOR
            vCol = instanceColor;
          #endif
          vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * p;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOp; uniform float uTime; uniform vec2 uLook;
        varying vec2 vUv; varying vec3 vCol;
        void main() {
          // No edge on a face: it fades out toward both of its sides.
          float across = sin(3.14159265 * vUv.x);
          // Strongest at the tile, gone by uLook.x of the way up.
          float up = 1.0 - smoothstep(0.0, uLook.x, vUv.y);
          up *= up;
          // A soft band climbing the column.
          float band = 0.5 + 0.5 * sin(6.2831853 * (vUv.y * 1.6 - uTime));
          float a = across * up * (1.0 - uLook.y + uLook.y * band);
          gl_FragColor = vec4(vCol, a * uOp);
        }
      `,
    });
    this.mesh = new THREE.InstancedMesh(geo, this._mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1; // over the planes and the tiles it rises from
    this.mesh.raycast = () => {}; // never a pick target: the tile under it answers the click
    parent.add(this.mesh);
    this.setGround(paper);
  }

  /** Per frame: how many columns were written (slots 0 to `n − 1`), the chamber's furniture alpha
   *  and the frame's `dt` (the band's clock; 0 holds it still). Ranged upload, allocation-free. */
  commit(n: number, alpha: number, dt: number): void {
    this.mesh.count = n;
    this._mat.uniforms.uOp.value = alpha * (this._paper ? MIST_LOOK.paper : MIST_LOOK.dark);
    this._mat.uniforms.uTime.value = (this._mat.uniforms.uTime.value + dt / MIST_LOOK.seconds) % 1000;
    if (n <= 0) return;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.clearUpdateRanges();
      this.mesh.instanceColor.addUpdateRange(0, n * 3);
      this.mesh.instanceColor.needsUpdate = true;
    }
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
