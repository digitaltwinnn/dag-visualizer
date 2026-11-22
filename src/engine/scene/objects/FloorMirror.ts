// THE FLOOR MIRROR — the Snapshots chamber's global floor, reflecting what stands on it.
//
// The floor is glass, and glass that shows nothing of the bars standing on it and the sheets
// falling to it reads as a drawn rectangle. This is three's own planar `Reflector` (the scene
// rendered once more from the mirrored camera, clipped at the plane), drawn as ADDED LIGHT at a
// fraction of its level and feathered to nothing at the floor's edges — a sheen, never a second
// chamber. What it shows is the scene itself, so it states nothing the chamber does not.
//
// And it is glass that takes LIGHT as well as an image (user, 2026-11-22: "besides mirror (glass)
// perhaps also some light effect?"): the same reflection read again at two coarse mip levels is a
// soft pool of each mark's colour on the floor around its reflection — the SPILL. It is the marks'
// own light, from the same render, so a brighter bar lights more floor and a dimmed one less, with
// no lamp and no second number to keep in step with the emphasis system.
//
// Three decisions:
//  · THE MIRROR PLANE SITS `depth` BELOW THE GLASS — the floor is a slab, and the image is in it.
//    Mirrored about the glass's own top face, a block's reflection began exactly where the block
//    did, in the same hue, and the two read as one shape (user, 2026-11-22: "it feels like the
//    block doesn't really sit on the surface and kinda transitions into its mirror"). Mirrored
//    about a plane a little under the surface, the image starts a clear gap below the block's
//    base: the block stands ON the glass, its reflection lies IN it. The image is read SHARP
//    (`soft` 0 — a mip down was tried for "the thing is crisp, its reflection is not" and read as
//    fuzzy blocks; the gap alone is what separates them). The spill is where the softness lives.
//  · THE MIRROR SHOWS ITS MEMBERS AND NOTHING ELSE (`MIRROR_LAYER`, `joinMirror` — the bloom
//    layers' idiom). A plain mirror reflects everything above it: the labels and dotted lines
//    lying in the floor came back as ghost copies under their own text, and the metagraph planes
//    a whole storey up lay across the floor as grey sheets (user, of light mode: "too much of the
//    top metagraph plane in the mirror … even though its quite far away"). What a reader expects
//    in the glass is what STANDS on it or FALLS to it: the bars, the lane tiles, the data marks,
//    the blocks and their links, the anchor sheets. Those join; nothing else is drawn.
//  · The two grounds composite it in opposite directions (the ground rule every additive site here
//    answers). Dark ADDS the reflected light. Light added to a printed sheet is a bleach, so paper
//    MULTIPLIES: the reflection is divided by the plate's own colour, which leaves 1 wherever the
//    mirror sees only the page and the mark's ink where it sees a mark, and the floor is darkened
//    toward that — a reflection made of ink, which can tint and never blow out.
//  · It costs one more scene render at `MIRROR_RES`, only while the chamber is on screen: the
//    Reflector renders from its own `onBeforeRender`, which a hidden mesh never reaches.

import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

/** The mirror's look: `strength` the share of the reflected light that is added, `depth` how far
 *  below the glass the mirror plane sits (the gap under a block is twice it), `soft` the mip the
 *  image is read at, `feather` the fraction of each side
 *  over which it fades out, `back` the same for the far end, where the floor itself dissolves. */
export const MIRROR_LOOK: Readonly<{
  strength: number; strengthPaper: number; spill: number; spillPaper: number; spillFloor: number;
  depth: number; soft: number; feather: number; back: number;
}> = {
  strength: 0.2, strengthPaper: 0.2,
  spill: 1.1, spillPaper: 0.8, // the soft pool's level, per ground (it is spread thin, so it reads above the image's number)
  // ONLY BRIGHT MARKS SPILL (dark). The spill is a blur, and a blur of every dim trail bar lay a
  // teal haze over the whole trail that read as "fuzzy blocks" (user, 2026-11-22; toggled live:
  // with the spill off the reflections were crisp). Light below this level lights no floor, so
  // the pool belongs to the lead bar and the sheets, and the trail keeps its sharp image alone.
  spillFloor: 0.3,
  depth: 0.3, soft: 0, feather: 0.08, back: 0.4,
};
/** THE MIRROR LAYER — membership in the floor's reflection. `joinMirror` only ENABLES the layer,
 *  so a member still draws on layer 0 exactly as before; the mirror's camera sees this layer alone. */
export const MIRROR_LAYER = 4;
export function joinMirror(o: THREE.Object3D): void {
  o.layers.enable(MIRROR_LAYER);
}

// 2048×1280 since the mirror draws its members alone (a cheap render): at 1024×640 the image was
// stretched ~2.5× onto a 2× screen and a block's reflection came out soft whatever mip it was read
// at (user, 2026-11-22: "the mirrored blocks look too fuzzy").
const MIRROR_RES = { w: 2048, h: 1280 } as const;

const MIRROR_SHADER = {
  name: "FloorMirror",
  uniforms: {
    color: { value: null }, // the Reflector writes it; this shader does not read it
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uOp: { value: 0 },
    uSpill: { value: 0 },
    uSpillFloor: { value: MIRROR_LOOK.spillFloor },
    uPaper: { value: 0 },
    uGround: { value: new THREE.Color() },
    uFeather: { value: new THREE.Vector2(MIRROR_LOOK.feather, MIRROR_LOOK.back) },
    uSoft: { value: MIRROR_LOOK.soft },
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
    uniform float uSpill;
    uniform float uSpillFloor;
    uniform float uPaper;
    uniform vec3 uGround;
    uniform vec2 uFeather;
    uniform float uSoft;
    varying vec4 vUv;
    varying vec2 vP;
    void main() {
      vec3 r = texture2DProj(tDiffuse, vUv, uSoft).rgb;
      // uv.x runs back -> front along the trail, uv.y across the lanes.
      float f = smoothstep(0.0, uFeather.y, vP.x) * smoothstep(0.0, uFeather.x, 1.0 - vP.x)
              * smoothstep(0.0, uFeather.x, vP.y) * smoothstep(0.0, uFeather.x, 1.0 - vP.y);
      // The spill: the same image at two coarse mips, a wide soft pool around each reflection.
      vec3 soft = 0.5 * (texture2DProj(tDiffuse, vUv, 3.0).rgb + texture2DProj(tDiffuse, vUv, 5.0).rgb);
      // Dark: light to add. Paper: a factor to multiply the floor by (1 = the bare page).
      vec3 g = max(uGround, vec3(1e-3));
      vec3 ink = mix(vec3(1.0), clamp(r / g, 0.0, 1.0), uOp * f)
               * mix(vec3(1.0), clamp(soft / g, 0.0, 1.0), uSpill * f);
      vec3 lit = max(soft - vec3(uSpillFloor), 0.0);
      gl_FragColor = vec4(mix((r * uOp + lit * uSpill) * f, ink, uPaper), 1.0);
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
    // Mips for the spill's coarse reads (three regenerates them after each mirror render).
    const tex = this.mesh.getRenderTarget().texture;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.transparent = true;
    mat.depthWrite = false;
    // Paper's multiply, spelled as factors (src × dst): three's own MultiplyBlending asks for a
    // premultiplied material, which this is not.
    mat.blendSrc = THREE.DstColorFactor;
    mat.blendDst = THREE.ZeroFactor;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(cx, y - MIRROR_LOOK.depth, 0);
    this.mesh.renderOrder = -1; // over the glass (-2), under everything that stands on it
    // The mirror's render sees the MEMBERS alone (see MIRROR_LAYER). The Reflector clones the
    // viewing camera once and keeps it, so the mask is re-stated on that clone each time: one
    // integer write.
    const mirrorRender = this.mesh.onBeforeRender;
    this.mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      this.mesh.getReflectionCamera(camera).layers.set(MIRROR_LAYER);
      mirrorRender.call(this.mesh, renderer, scene, camera, geometry, material, group);
    };
    parent.add(this.mesh);
    this.setGround(paper, ground);
  }

  /** The chamber's furniture alpha, per frame. At 0 the mesh hides, and its render with it. */
  setAlpha(a: number): void {
    const u = (this.mesh.material as THREE.ShaderMaterial).uniforms;
    u.uOp.value = a * (this._paper ? MIRROR_LOOK.strengthPaper : MIRROR_LOOK.strength);
    u.uSpill.value = a * (this._paper ? MIRROR_LOOK.spillPaper : MIRROR_LOOK.spill);
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
