// THE LIFT MIST — what holds a data block over its snapshot: a soft column of the block's own light
// rising from the tile and thinning to nothing under the block (user, 2026-11-23: "what about some
// levitating / glow / mist from the snapshot instead of hard lines?").
//
// A block was tied to its snapshot by one hairline (2026-11-09), then by four from the tile's
// corners. Both are DRAWN ties, and a drawn tie reads as a strut: the block stood on a frame. What
// the lift should say is that the block came off the snapshot and hangs there — so the tie is
// light, not line. One instanced sheet per drawn column, always facing the viewer: as wide as the
// tile at the bottom, narrowing to the block's width at the top, with NO edge anywhere — soft
// right across, strongest where it leaves the tile and gone before it reaches the block, and a
// slow band drifts up it, so the eye is led from the snapshot to the block.
//
// The sheet's proportions are the lift's own (`DATA_MARK`), which are fractions of the TILE — so
// one unit geometry serves every column, scaled by its tile's size. Colour is per instance, the
// column's ink that frame. The ground decides how it lands (the question every additive site
// answers): added light on dark, a thin wash of the ink on paper.

import * as THREE from "three";

/** `dark` and `paper` are the mist's level where it leaves the tile; `reach` the share of the lift
 *  it has faded out by (the block hangs clear above it); `drift` how much of the level the rising
 *  band carries, and `seconds` how long one band takes to climb the column. */
export const MIST_LOOK: Readonly<{ dark: number; paper: number; reach: number; drift: number; seconds: number }> = {
  // Quieter and finer on 2026-11-23 (user: "a bit more subtle and refined, but I do like it"):
  // the level down from 0.5 / 0.34, the band slower and fainter (0.35 over 3.2 s). A single sheet
  // stacks no faces, so the level came back up a little when the shell went (0.3 → 0.42).
  dark: 0.42, paper: 0.3, reach: 0.88, drift: 0.2, seconds: 4.4,
};

export class LiftMist {
  readonly mesh: THREE.InstancedMesh;
  private readonly _mat: THREE.ShaderMaterial;
  private _paper: boolean;

  /** `max` columns; the sheet narrows by `foot` from its base to its top and is `height` tall,
   *  both in tile sizes (a column's instance scale is its tile's size). */
  constructor(parent: THREE.Object3D, max: number, foot: number, height: number, paper: boolean) {
    this._paper = paper;
    // ONE SHEET THAT FACES THE VIEWER, not a shell (user, 2026-11-23: "the mist has 4 corners, can
    // we make it more smooth?"). The shell was four faces, each fading at its own sides, and from
    // any angle they read as four blades with corners between them. A column of mist has no
    // sides: this is a single quad per column, turned to the camera in the vertex shader, as wide
    // as the tile at its foot and as the block at its top, soft right across — the same from
    // every direction. `position.x` is −1 to 1 across the sheet, `position.y` 0 to 1 up it.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this._mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uOp: { value: 0 },
        uTime: { value: 0 },
        uLook: { value: new THREE.Vector2(MIST_LOOK.reach, MIST_LOOK.drift) },
        // The column's shape in tile sizes: its half-width at the foot and at the top, its height.
        // 0.4 of the tile at the foot, narrowing by the block's own proportion — the look approved
        // live (2026-11-23), restated once the width was measured with the parent's scale.
        uShape: { value: new THREE.Vector3(0.4, 0.4 * foot, height) },
      },
      vertexShader: /* glsl */ `
        uniform vec3 uShape;
        varying vec2 vUv; varying vec3 vCol;
        void main() {
          vUv = vec2(position.x, position.y);
          vCol = vec3(1.0);
          #ifdef USE_INSTANCING_COLOR
            vCol = instanceColor;
          #endif
          // The column's spine in view space, then out along the screen's own horizontal: a sheet
          // that always faces the viewer. The instance's scale is its tile's size (x across, y up).
          mat4 im = mat4(1.0);
          #ifdef USE_INSTANCING
            im = instanceMatrix;
          #endif
          // The width's scale is the WHOLE transform's (the view group scales too), in view space.
          float sx = length((modelViewMatrix * im)[0].xyz);
          vec4 mv = modelViewMatrix * im * vec4(0.0, position.y * uShape.z, 0.0, 1.0);
          mv.x += position.x * mix(uShape.x, uShape.y, position.y) * sx;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOp; uniform float uTime; uniform vec2 uLook;
        varying vec2 vUv; varying vec3 vCol;
        void main() {
          // Soft right across: full along the spine, nothing at either side, no edge between.
          float c = cos(1.5707963 * clamp(abs(vUv.x), 0.0, 1.0));
          float across = c * c * c;
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
    // Bounds three cannot reject with: the columns move with the trail every frame, and a sphere
    // computed once would go stale (see NodeFabric.openBounds). Not a pick target either way.
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
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
