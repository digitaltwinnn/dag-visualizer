// Three.js scene scaffolding: renderer, camera, orbit controls, bloom
// postprocessing, lighting and the procedural shader backdrop.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BokehPass, type BokehPassParameters } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { isLightGround, LIGHT_LOOK, type SceneColors } from "../sceneColors";

/**
 * THE SELECTIVE-BLOOM LAYER — the day look's answer to a glow pass that cannot select ink.
 *
 * UnrealBloomPass is a LUMINANCE HIGHPASS over the finished frame: it keeps what is brighter than
 * `threshold`, blurs it, adds it back. That works on the dark ground, where every mark is emissive
 * light against black. On paper the identity marks are INK — measured, the scene ground sits at
 * L 0.72 while a DOR band at the identity lane's own `laneL` (0.61) lands near 0.42 relative
 * luminance — so the marks are DARKER THAN WHAT THEY LIE ON and no threshold can pick them out.
 * Floor it low and the whole page halos (the wave that read "soft/washed"); floor it high and
 * nothing does at all (user, 2026-08-28: "bloom does not appear to work"). Both failures are the
 * same fact: a highpass cannot select the darker half of a frame.
 *
 * So the marks are selected by MEMBERSHIP instead of by brightness. Objects that join this layer
 * render a second time into a target that is black except for them; that target is blurred and
 * composited ADDITIVELY under the OutputPass. The bloom pass then thresholds against BLACK, where
 * ink is the bright thing — the highpass works again because the ground it measures against is one
 * we chose rather than one we inherited.
 *
 * Additive glow over paper is intrinsically faint, and that is accepted rather than worked around
 * (user, 2026-08-28: "most of the bloomed objects sit on a surface … so I'm ok if bloom is not very
 * present when its directly on the light background"). Over the chamber's own glass and around
 * saturated ink it reads as a warm halo bleeding outward; over the raw backdrop it reads as almost
 * nothing, which is the honest answer for light added to a near-white page.
 *
 * ⚠️ MEMBERSHIP IS PER-MESH, WHICH IS WHY THE BRIGHTNESS STILL DOES THE EMPHASIS. Almost every mark
 * here is an InstancedMesh (the lane tiles, the node chips), so a layer cannot name one tile — and
 * it does not have to: a member renders with its OWN per-instance colour and alpha, so what it
 * contributes to the bloom target is exactly its own presence. The committed band leads its
 * off-filter neighbours in the halo by the same ratio `inkPresence` already gave it on the page.
 * The emphasis system is untouched; this pass only gives it a second channel to spend.
 */
export const BLOOM_LAYER = 1;

/**
 * Put one mark in the selective-bloom set (convention 8: one home for the question). Called at
 * construction by the adapters that own a glowing mark — the byte bar's bands, the ledger's lane
 * tiles, the live edge, the node chips, hyper's core and hub orbs. Deliberately NOT the glass, the
 * trays, the backdrop, the labels or the ribbons: a ribbon is a wide soft sheet that would dominate
 * the target and blur into a smear, and its ENDS are already lit by the band and the tile it runs
 * between — which is the halo the eye actually reads along it.
 *
 * Unconditional, not light-gated: `layers.enable` only ADDS a layer, so a member still matches the
 * default camera mask and the dark ground renders byte-identically. The gate is the pass, not the
 * membership.
 */
export function joinBloom(o: THREE.Object3D): void {
  o.layers.enable(BLOOM_LAYER);
}

/**
 * THE GLOW LAYER — the marks that bloom on the DARK ground only.
 *
 * Dark blooms by membership too (see `renderFrame`): the mark pass draws the bloom layer AND this
 * one. It holds the light that is not an identity mark but is the dark look's own glow — the coast
 * walls, the packets' trails, the anchor sheets — which paper's ink halo must never take (a wide
 * sheet in that target is a smear across the page; see `joinBloom`). Everything else the scene
 * draws — the text, the glass, the graticule, the land fill, the atmosphere — is in neither set and
 * stays as crisp as it was drawn.
 */
export const GLOW_LAYER = 3;
export function joinGlow(o: THREE.Object3D): void {
  o.layers.enable(GLOW_LAYER);
}

/**
 * THE OVERLAY LAYER — scene text that must NOT bloom (2026-09-28, user: "I don't want the text to
 * bloom", on the gather legend). On the dark ground the bloom is a whole-frame pass, so anything
 * the main chain draws above the threshold halos, text included. A member of this layer is left
 * out of every composer pass (`layers.set`, so it leaves layer 0) and drawn by `renderFrame` in one
 * plain render AFTER the composer, straight onto the finished frame: crisp on both grounds, still
 * a scene object that rides group transforms and material opacity. It draws over everything —
 * right for a legend above the staging grids, and the reason membership is opt-in, one mark at a
 * time. Members should set `toneMapped = false`: the composer's OutputPass tone-maps the scene,
 * and this render goes around it.
 */
const OVERLAY_LAYER = 2;
// The members, so the pass can skip itself when none is showing (the legend is visible only
// through a gather) — a full-scene render every frame to draw nothing is the cost it avoids.
const overlayMembers = new Set<THREE.Object3D>();
export function joinOverlay(o: THREE.Object3D): void {
  o.layers.set(OVERLAY_LAYER);
  overlayMembers.add(o);
}
export function leaveOverlay(o: THREE.Object3D): void {
  overlayMembers.delete(o);
}
function overlayShowing(): boolean {
  for (const o of overlayMembers) {
    let n: THREE.Object3D | null = o;
    while (n && n.visible) n = n.parent;
    if (n === null) return true; // every ancestor up to the root is visible
  }
  return false;
}

// True only while the PAPER mark pass is rendering (see renderFrame; dark's mark pass leaves it
// false — its members go in at their true light). A member
// whose main-pass ink is too dark to halo — the chamber's bands and tiles are ink on paper, where
// geo's chips get free sub-pass brightness from their env sheen — checks this in onBeforeRender
// and raises its own contribution for that render alone (restored in onAfterRender), so the
// visible frame never changes. One flag, owned here beside the pass that defines it.
let markPass = false;
export const inMarkPass = (): boolean => markPass;

// The bloom target runs at half resolution. Standard for a blur pyramid (the pass mips down from
// here anyway) and it is what keeps the second scene render off the frame budget.
const SEL_SCALE = 0.5;

/**
 * The composite — TWO terms, because a halo on paper cannot be made of light alone.
 *
 * ⚠️ ADDITIVE GLOW IS INVISIBLE ON THIS GROUND, AND THE MEASUREMENT SAYS SO. The paper sits at
 * L 0.72 and the chamber's own glass lands within ~12/255 of it (measured in wave 5, which is why
 * `inkMix` points every site at `c.bg`) — so the surfaces the user expects the halo to read over
 * are as bright as the page. Light added there clips to white: the "glow" is a bleach, which is
 * precisely the blowout the day look already had. The backdrop's own header states the rule this
 * wave keeps running into — on paper, emphasis is separation you take AWAY, not light you add.
 *
 * So the primary term is a BLEED: the ground multiplied toward the mark's own hue, weighted by the
 * blur's magnitude. `base * mix(vec3(1), ink, a)` is a pure multiply, so it can only ever darken
 * and tint — it cannot blow out, it keeps the ground's own level and vignette underneath, and it
 * reads as the mark's ink spreading into the paper around it. That is what a saturated mark does
 * on a real page, and it is visible over the glass, over the backdrop and over another mark alike.
 *
 * The `glow` term is the ordinary additive composite kept alongside it at a low weight: right at
 * the mark's core, where the bleed has nothing left to darken, a little added light is what keeps
 * a bright mark from reading as a smudge. Two weights rather than one because they act in opposite
 * directions and the balance between them is exactly what there was to tune.
 *
 * `ink` normalises the blurred colour to its own hue, so the tail carries full saturation at tiny
 * coverage instead of desaturating toward grey as it fades — the same reason wave 5's tiles needed
 * a hue floor. The magnitude does the falling off; the hue does not.
 */
const SEL_MIX_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    bloomTexture: { value: null as THREE.Texture | null },
    bleed: { value: 1 },
    glow: { value: 0.25 },
    cap: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D bloomTexture;
    uniform float bleed;
    uniform float glow;
    uniform float cap;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 b = texture2D(bloomTexture, vUv).rgb;
      float m = max(b.r, max(b.g, b.b));
      vec3 ink = b / max(m, 1e-4);
      float a = clamp(bleed * m, 0.0, 1.0);
      // The glow input is CAPPED like the bleed's: the mark-pass input lifts (BarLook/TileLook
      // .halo) push b past 1 at a boosted lead, and an uncapped add there climbs to white — the
      // one thing paper emphasis must never do. Below 1 the term is byte-identical to before.
      // (cap is 1 on paper; dark lifts it out of the way — there the term is plain added light,
      // and the tone map that follows is what rolls it off.)
      vec3 rgb = base.rgb * mix(vec3(1.0), ink, a) + glow * min(b, vec3(cap));
      gl_FragColor = vec4(rgb, base.a);
    }
  `,
};

/**
 * THE FINISH — two things every frame gets last, after the tone map and the sRGB encode.
 *
 * THE POOL. The dark ground is one flat near-black, so the subject hung in a void with nothing
 * behind it to say where the stage is. The pool is a soft radial lift toward the HUD's own panel
 * navy (`SceneColors.panel`), centred on the canvas, SCREEN-blended: it lifts the ground most and a
 * lit mark least, which over a scene made of additive light is the same picture as a lit backdrop
 * behind it. It is screen-space, so it never changes with the camera's distance — the fault the
 * old scene fog was removed for (see createScene).
 *
 * THE DITHER. Soft halos over near-black quantise into visible rings at 8 bits. One LSB of
 * triangular noise (two interleaved-gradient samples) trades the rings for grain below the
 * threshold of sight. It has to come after the encode, which is why this is its own pass and not
 * a term in the composite.
 */
export const BACKDROP_LOOK: Readonly<{ pool: number; reach: number }> = {
  pool: 0.7, // the pool's peak, as a fraction of the panel token's own display value
  reach: 0.95, // its radius, in canvas heights
};
const FINISH_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uPool: { value: new THREE.Vector3() },
    uReach: { value: 0.95 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uPool;
    uniform float uReach;
    uniform float uAspect;
    varying vec2 vUv;
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
      float f = 1.0 - smoothstep(0.0, uReach, length(p));
      vec3 rgb = 1.0 - (1.0 - base.rgb) * (1.0 - uPool * f * f);
      float n = ign(gl_FragCoord.xy) + ign(gl_FragCoord.xy + vec2(47.0, 17.0)) - 1.0;
      gl_FragColor = vec4(rgb + n / 255.0, base.a);
    }
  `,
};

// @types/three types BokehPass.uniforms as a bare `object`; the engine reads
// uniforms.focus/maxblur .value, so refine just those.
type DofPass = BokehPass & {
  uniforms: Record<"focus" | "maxblur", { value: number }>;
};

export interface BloomKnobs { strength: number; radius: number; threshold: number; enabled: boolean }

// js/scene.js createScene() return.
export interface SceneCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  composer: EffectComposer;
  dof: DofPass;
  /** The bloom's knobs — per-view strength/radius/threshold, driven by the Engine from ViewPolicy
   *  each frame. Plain numbers: `renderFrame` hands them to the mark pass's blur (dark). */
  bloom: BloomKnobs;
  /**
   * Draw one frame. The ONE home for the ground question in the render chain: dark runs the
   * original composer alone, paper runs the selective-bloom sub-pipeline first (see BLOOM_LAYER).
   * The Engine calls this instead of `composer.render()` so it never has to know which.
   */
  renderFrame(): void;
  resize(): void;
  /**
   * Re-point the scene's clear colour at a new `--background` (theme flip). The scene has no fog
   * (see createScene), so the background IS the whole backdrop and this one write is the entire
   * ground change. Plain data in — rule 1 untouched.
   */
  setClearColor(bg: number): void;
  setGround(light: boolean): void;
  /**
   * The shared chip environment texture (built lazily on first ask — PMREM needs the renderer).
   * The Engine hands it to NodeFabric.setNodeEnv once at construction; see the note at the
   * builder for the physics (a flat cap only answers a top-down camera by reflection).
   */
  nodeEnv(): THREE.Texture;
  /** Tear down both composers and every render target either of them allocated. */
  dispose(): void;
}

// Scene LIGHTING lives in the RIG (domain/sceneRig.ts + scene/objects/SceneRig.ts), not here. It
// used to be three fixed literals constructed at this point — an ambient plus two point lights —
// and the move is not a relocation: a point light inside the field gave every node its own lighting
// direction, so the population never resolved into one lit scene. The rig is directional, per-view
// and camera-relative, and it carries its colours as TEMPERATURES rather than hexes, which is why
// this file no longer holds a single lighting literal (nor an allowlist entry for one). Lighting is
// still a rendering technicality, deliberately decoupled from the palette both ways — that rule did
// not change, only where it is stated.

export function createScene(canvas: HTMLCanvasElement, colors: SceneColors): SceneCtx {
  const scene = new THREE.Scene();
  const bgColor = new THREE.Color(colors.bg);
  scene.background = bgColor;
  // Deliberately NO scene fog (removed 2026-07-11, user): the FogExp2 depth cue darkened the
  // whole scene as the camera pulled back — the scene must stay clear and coloured at every
  // zoom. Depth reads through DoF (hyper focus), the facing dims, and the closeness uniform;
  // darkening is never a zoom side-effect.

  // ⚠️ SIZE FROM THE CANVAS'S OWN BOX, NEVER THE WINDOW (2026-09-11 — user's tablet: "the
  // globe is not as round as on my PC"). `.scene-canvas` sizes itself in vh units, and
  // mobile browsers resolve vh against the LARGE viewport (URL bar collapsed) while
  // window.innerHeight is the CURRENT one — with browser chrome visible the CSS box runs
  // ~5% taller than a window-derived buffer, and that stretch renders every circle as an
  // egg. The box is the one truth (globals.css: "CSS owns this box"), so the buffer, the
  // camera aspect and every pass target measure IT; the window is only the pre-layout
  // fallback (a 0-sized box must never seed a NaN aspect). clientWidth/Height are
  // integers, which keeps the buffer integer-sized exactly as setSize(…, false) expects.
  const boxOf = () => ({
    w: canvas.clientWidth || window.innerWidth,
    h: canvas.clientHeight || window.innerHeight,
  });
  const box0 = boxOf();

  const camera = new THREE.PerspectiveCamera(
    55, box0.w / box0.h, 0.1, 2000
  );
  camera.position.set(0, 14, 54);

  const renderer = new THREE.WebGLRenderer({
    // antialias:false ON PURPOSE — an EffectComposer renders the scene into offscreen targets and
    // only the final full-screen OutputPass quad reaches the default framebuffer (no geometry edges
    // there to multisample), so renderer MSAA is pure wasted allocation. The antialiasing lives on
    // the composer's own scene target instead (see `msaa` below). stencil is never used, so drop
    // it too.
    canvas, antialias: false, stencil: false, powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // updateStyle=false: `.scene-canvas` (globals.css) owns the display box at 100vw/100vh. three's
  // default writes INTEGER inline px, which beats the class — and at a fractional-DPR viewport
  // (e.g. 606.29 CSS px tall) that left a sub-pixel sliver of page background visible below the
  // canvas: invisible on the dark ground, a light hairline under the scene in light mode (user,
  // 2026-09-04 — "1 pixel more than the scene at the bottom"). The buffer stays integer-sized;
  // CSS stretches it by <1px, which no pick math notices (NDC is derived from the live rect).
  renderer.setSize(box0.w, box0.h, false);
  // Tone mapping — ACESFilmicToneMapping. (Applies via the OutputPass; an EffectComposer bypasses
  // the renderer's direct-to-screen output, so without OutputPass this would be a no-op.) Switched
  // from NeutralToneMapping (user, on-device): Khronos Neutral does a min-channel `color -= offset`
  // desaturation that DARKENS the desaturated boundary between a saturated COLOURED node (e.g.
  // orange) and the cyan globe — the visible "black halo" around colored geo nodes, worst on
  // OLED/HDR. ACES has no such subtraction (a smooth per-channel filmic curve), so the boundary
  // ring is gone. The earlier A/B that preferred Neutral was run on the OLD hot bloom (strength
  // 0.9) where ACES hazed blown cores; with the now-calm per-view bloom that haze is a non-issue.
  // Trade accepted (user): ACES desaturates very bright hub/core CENTRES slightly toward white.
  // ⚠️ ACES is a GLOW-look device, and the day look declines it exactly as it declines bloom
  // (user, 2026-08-25: filmic mapping turned mid-lightness identity ink muddy — DOR's orange
  // chips read BROWN next to the HUD's chip at the same oklch). Ink wants colorimetric
  // fidelity: on paper the scene runs NoToneMapping at exposure 1, so a node's rendered sRGB
  // tracks the CSS token lane. Both pairs re-apply on a theme flip via setGround below.
  renderer.toneMapping = isLightGround(colors) ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  // Exposure is the master brightness dial (a single multiplier applied to the whole frame at
  // the OutputPass). Kept below 1 on purpose: the scene otherwise read too hot overall — most
  // visible in hyper/geo, where many emissive nodes each contribute a bit of ADDITIVE bloom that
  // accumulates into a general glow. Nudged 0.7 → 0.82 (user) after the large bright objects were
  // downsized and ACES gave more highlight headroom — the scene has room to sit a touch brighter.
  renderer.toneMappingExposure = isLightGround(colors) ? 1 : 0.82;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 12;
  controls.maxDistance = 140;
  // Globe-UX convention (Google Earth/Mapbox): the camera never crosses the poles — clamping
  // the polar angle short of ±90° keeps "over the top" flips impossible, so combined with
  // OrbitControls' no-roll orbiting, north can never point down on screen. Applies in every
  // view (nothing frames from directly above/below).
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI - 0.25;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;

  // Lighting is the SceneRig's (constructed by the Engine alongside the StageLight, so this file
  // stays the render pipeline's home and nothing else) — see the note above the imports.

  // Postprocessing — depth of field then bloom.
  //
  // THE SCENE TARGET IS MULTISAMPLED (2026-11-22, user: "make it look more refined", lifting the
  // earlier no-MSAA decision). Measured live at 2540×1628: the coast walls, the chips' and tiles'
  // edges and every 1px GL line (hyper's tethers and hoops, the graticule, the borders) stair-step
  // without it, and the bloom haloes each step into a fringe. The composer's own targets carry the
  // samples — renderer `antialias` stays false, since only the final quad reaches the default
  // framebuffer. FOUR samples at a low pixel ratio, where a step is a whole CSS pixel; TWO at 2×,
  // where the buffer already holds four device pixels per CSS pixel. `clone()` (the composer's
  // second target) and `setSize` both keep the count.
  const msaa = renderer.getPixelRatio() <= 1.5 ? 4 : 2;
  const pr0 = renderer.getPixelRatio();
  const sceneTarget = new THREE.WebGLRenderTarget(box0.w * pr0, box0.h * pr0, {
    type: THREE.HalfFloatType, samples: msaa,
  });
  const composer = new EffectComposer(renderer, sceneTarget);
  // Handed a target, the composer reads its logical size off the target's DEVICE size; say the
  // CSS size, as `resize` does, so every pass added below is sized once and correctly.
  composer.setSize(box0.w, box0.h);
  composer.addPass(new RenderPass(scene, camera));

  // Depth of field: keeps whatever the camera is looking at (the selection) crisp
  // and softly blurs everything at other depths. `focus` (distance to the focal
  // plane) is driven each frame from camera→target; only enabled in the Hypergraph
  // view (main.js) — the globe doesn't need it and it halves the cost.
  // aperture sets how aggressively off-focus depths blur — a larger value gives a SHALLOW focus
  // so the background nodes/hubs fall off sharply (the in-focus selection stays crisp). maxblur is
  // re-driven per frame in the engine. Kept low on purpose: the selected hub's own shells span a
  // few units of depth around the focal plane, so a shallow aperture smeared THEM too; this widens
  // the sharp zone to cover the whole selected cluster while distant objects (the core, the other
  // hubs) are far enough out to still saturate to maxblur — strong background blur, crisp selection.
  // BokehPassParameters' types only declare focus/aspect/aperture/maxblur, but the JS
  // constructor accepts (and ignores) width/height too — kept for parity with the
  // original call.
  const dofParams: BokehPassParameters & { width: number; height: number } = {
    focus: 54, aperture: 0.00028, maxblur: 0.01,
    width: box0.w, height: box0.h,
  };
  const dof = new BokehPass(scene, camera, dofParams) as DofPass;
  dof.enabled = false;
  composer.addPass(dof);

  // BLOOM IS BY MEMBERSHIP ON BOTH GROUNDS (dark since 2026-11-22; see `renderFrame`), so no
  // whole-frame pass sits in this chain. These are its knobs, written per frame by the Engine
  // from ViewPolicy: strength is the dominant lever (the halo vanishes with it), radius the
  // spread, and threshold stays low so every identity HUE clears it — it reads luminance, and a
  // low-luma blue or green would be cut out at a higher value.
  const bloom: BloomKnobs = { strength: 0.3, radius: 0.35, threshold: 0.13, enabled: true };

  // Terminal pass: applies the renderer's toneMapping + exposure and the sRGB output
  // conversion to the composited result. Without it an EffectComposer bypasses the renderer's
  // output step, so `toneMapping` above was effectively a no-op (three r150+ standardised on
  // OutputPass as the correct chain end).
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // The FINISH — the frame's last pass, in display space (see FINISH_SHADER).
  const finish = new ShaderPass(FINISH_SHADER);
  composer.addPass(finish);
  function applyFinish(light: boolean) {
    // The pool is the dark ground's alone: the Print plate is one flat colour by design, and a
    // screen blend over a near-white page would do nothing but bleach it.
    // The token's own BYTES, not a THREE.Color: the pass runs after the sRGB encode, and a Color
    // would hand back the linear value — a third of the level, measured.
    const k = (light ? 0 : BACKDROP_LOOK.pool) / 255;
    const hex = colors.panel;
    finish.uniforms.uPool.value.set(((hex >> 16) & 255) * k, ((hex >> 8) & 255) * k, (hex & 255) * k);
    finish.uniforms.uReach.value = BACKDROP_LOOK.reach;
  }

  // ── The selective-bloom sub-pipeline (see BLOOM_LAYER above) ────────────────────────────────
  //
  // Built on the first frame that blooms. The mix pass sits BEFORE the OutputPass so the composite
  // happens in linear space, on the same numbers the tone map and the sRGB encode are about to
  // read. Its target is multisampled: the marks are drawn at half resolution, and an aliased edge
  // going into a blur comes out as a halo that crawls.
  let sel: {
    composer: EffectComposer;
    render: RenderPass;
    bloom: UnrealBloomPass;
    mix: ShaderPass;
  } | null = null;

  function ensureSel() {
    if (sel) return;
    const box = boxOf();
    const w = Math.max(1, Math.round(box.w * SEL_SCALE));
    const h = Math.max(1, Math.round(box.h * SEL_SCALE));
    const c = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 }));
    c.renderToScreen = false;
    const rp = new RenderPass(scene, camera);
    rp.clearColor = new THREE.Color(0x000000);
    rp.clearAlpha = 1;
    c.addPass(rp);
    // threshold 0: the target is BLACK except the members, so there is nothing to reject — every
    // mark is above the floor by construction. This is the whole point of the layer (see above).
    const bp = new UnrealBloomPass(new THREE.Vector2(w, h), 1, LIGHT_LOOK.selRadius, 0);
    c.addPass(bp);
    c.setSize(w, h);
    const mx = new ShaderPass(SEL_MIX_SHADER); // its texture is pointed per frame, by ground
    composer.insertPass(mx, composer.passes.indexOf(outputPass));
    sel = { composer: c, render: rp, bloom: bp, mix: mx };
  }

  /**
   * ONE render call for the frame, so the ground question is asked in exactly one place.
   *
   * Both grounds bloom by MEMBERSHIP: the members are rendered first into their own black target
   * at half resolution, blurred, and mixed in before the OutputPass. Paper reads the result as a
   * bleed (the ink halo, BLOOM_LAYER's note); dark reads the blur as added light, thresholded and
   * weighted by the view's own knobs. Dark came off the whole-frame highpass on 2026-11-22: that
   * pass haloed whatever was bright — the text, the glass rims, the globe's atmosphere — and ran
   * its five blurs at full resolution. Selected, the halo belongs to the marks alone.
   *
   * Three saves make the mark pass safe, and each is load-bearing: the BACKGROUND is nulled (it
   * would otherwise fill the target and, on paper, every pixel would clear the threshold); the
   * camera LAYER MASK is narrowed to the member layers (`layers.set`, not `enable`, so layer 0
   * is excluded and the target holds the marks and only the marks); and the AUTOCLEAR is left
   * to the RenderPass's own black clear. All three are restored before the main chain runs, so
   * the visible frame is drawn from exactly the state the rest of the engine set up.
   */
  function renderFrame() {
    // Off must cost nothing — the mark pass is a whole extra scene render plus a blur, so
    // disabling only the mix pass would leave the expensive half running to feed a texture
    // nobody samples. Skip, don't neutralise.
    const on = isPaper
      ? LIGHT_LOOK.selBleed > 0 || LIGHT_LOOK.selGlow > 0
      : bloom.enabled && bloom.strength > 0;
    if (!on) {
      if (sel) sel.mix.enabled = false;
      composer.render();
      drawOverlay();
      return;
    }
    ensureSel();
    const s = sel!;
    const u = s.mix.uniforms;
    if (isPaper) {
      // PAPER: every member is above the floor by construction (threshold 0), and the composite
      // is the bleed with a whisper of glow, reading the marks WITH their blur.
      s.bloom.strength = 1;
      s.bloom.threshold = 0;
      s.bloom.radius = LIGHT_LOOK.selRadius;
      u.bloomTexture.value = s.composer.renderTarget2.texture;
      u.bleed.value = LIGHT_LOOK.selBleed;
      u.glow.value = LIGHT_LOOK.selGlow;
      u.cap.value = 1;
    } else {
      // DARK: the view's own knobs, and the composite is plain added light. It reads the blur
      // ALONE (the pass's own composite target, strength already in it) — the marks themselves
      // are in the main frame at full resolution, and adding their half-res copy would double
      // them.
      s.bloom.strength = bloom.strength;
      s.bloom.threshold = bloom.threshold;
      s.bloom.radius = bloom.radius;
      u.bloomTexture.value = s.bloom.renderTargetsHorizontal[0].texture;
      u.bleed.value = 0;
      u.glow.value = 1;
      u.cap.value = 1e4;
    }
    s.mix.enabled = true;

    const bg = scene.background;
    const mask = camera.layers.mask;
    scene.background = null;
    camera.layers.set(BLOOM_LAYER);
    if (!isPaper) camera.layers.enable(GLOW_LAYER);
    markPass = isPaper;
    s.composer.render();
    markPass = false;
    camera.layers.mask = mask;
    scene.background = bg;

    composer.render();
    drawOverlay();
  }

  // The OVERLAY_LAYER's own render (see its note): one plain pass of that layer alone, onto the
  // composer's finished frame. No clear (the frame is what it draws over), depth cleared (the
  // composer's last quad is not scene depth), no background. Every saved field is restored, so
  // the next frame starts from exactly the state the engine set up.
  function drawOverlay() {
    if (!overlayShowing()) return;
    const mask = camera.layers.mask;
    const ac = renderer.autoClear;
    const bg = scene.background;
    renderer.autoClear = false;
    scene.background = null;
    camera.layers.set(OVERLAY_LAYER);
    renderer.setRenderTarget(null);
    renderer.clearDepth();
    renderer.render(scene, camera);
    camera.layers.mask = mask;
    scene.background = bg;
    renderer.autoClear = ac;
  }

  // The caller (engine) owns the resize listener so it can be removed on dispose.
  function resize() {
    const box = boxOf();
    camera.aspect = box.w / box.h;
    camera.updateProjectionMatrix();
    // updateStyle=false — same reason as construction: CSS owns the canvas box.
    renderer.setSize(box.w, box.h, false);
    composer.setSize(box.w, box.h);
    finish.uniforms.uAspect.value = box.w / box.h;
    if (sel) {
      sel.composer.setSize(
        Math.max(1, Math.round(box.w * SEL_SCALE)),
        Math.max(1, Math.round(box.h * SEL_SCALE)),
      );
    }
  }

  function dispose() {
    sel?.composer.dispose();
    sel?.bloom.dispose();
    composer.dispose();
    finish.dispose();
    nodeEnvTex?.dispose(); // the chips' PMREM studio env (null if no chip material ever built)
  }

  // The scene's ground is ONE flat colour on both grounds: the dark token verbatim, and on paper
  // the Print plate (`--scene-ground`, a step below the page). The lit-wall cyclorama that paper
  // carried from 2026-08-25 to 2026-10-09 — a baked sky-to-stage sweep, a lit pool, an engineering
  // grid, a warm/cool tint axis — was retired as the look (design direction A, "Print") and then
  // deleted (user, 2026-10-09: "clean dead code also"); git carries it.
  let isPaper = isLightGround(colors);
  function applyBackground() {
    scene.background = bgColor;
  }
  function setClearColor(bg: number) {
    bgColor.setHex(bg);
    applyBackground();
  }
  function setGround(light: boolean) {
    renderer.toneMapping = light ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = light ? 1 : 0.82;
    isPaper = light;
    applyBackground();
    applyFinish(light);
  }

  // THE NODE ENVIRONMENT — the stock three.js studio (RoomEnvironment) the chip materials mirror
  // (user, 2026-08-30: "from the side the light effect is nice, but viewed from the top the
  // surface does nothing"). The physics of the complaint: a flat cap has ONE normal, so a
  // directional key mirrors away from a top-down camera and diffuse is a single value — no
  // material PARAMETER can answer from above. A reflection can: the env lookup rides the
  // per-fragment view vector, so the cap carries a sheen that sweeps as the camera orbits, from
  // any angle. Deliberately the BUILT-IN room (user: "check the three.js capabilities … before
  // custom shaders, keep it simple") — its lit boxes are what the chips' sheen reveals, and the
  // material side stays plain envMap/envMapIntensity. Built lazily ONCE (PMREM
  // needs the renderer), shared by every chip material; the spheres skip it — hyper's orb look
  // is fresnel-carried and tuned.
  let nodeEnvTex: THREE.Texture | null = null;
  function nodeEnv(): THREE.Texture {
    if (nodeEnvTex) return nodeEnvTex;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    // Sigma SMEARS the room's discrete lamps into a soft top-lit gradient. At the stock 0.04 the
    // lamps survive as near-mirror hot spots, and a grazing view (the ledger seen from
    // bottom-front, the parked grid's top rows) catches one and BLOOMS it — a brightness spike at
    // poses users never take, proven by zeroing the env (2026-08-30). The sweep survives the blur;
    // the spikes don't.
    //
    // ⚠️ SIZE IS PART OF THE SIGMA. PMREM's blur cost is angular: it needs
    // `1 + floor(3 × sigma / radiansPerPixel)` taps and CLIPS at 20, and radiansPerPixel is
    // `π / (2 × (size − 1))` — so at the default size 256 this sigma asked for 171 taps and
    // three truncated the Gaussian to 20, warning on every boot. Truncation is not what was
    // tuned here: dropping sigma to fit 256 means ~0.04, which IS the stock value whose
    // surviving hot spots this line exists to kill. Shrinking the SOURCE instead keeps the
    // full 0.35 smear and lands at 11 taps — the whole, untruncated Gaussian, no warning.
    // 16px of cube face is ample for a texture whose entire job is to have no detail left.
    nodeEnvTex = pmrem.fromScene(room, 0.35, 0.1, 100, { size: 16 }).texture;
    pmrem.dispose();
    return nodeEnvTex;
  }

  applyBackground(); // construction honours the current ground (a light boot starts on the backdrop)
  finish.uniforms.uAspect.value = box0.w / box0.h;
  applyFinish(isPaper);

  return {
    scene, camera, renderer, controls, composer, dof, bloom,
    renderFrame, resize, setClearColor, setGround, nodeEnv, dispose,
  };
}
