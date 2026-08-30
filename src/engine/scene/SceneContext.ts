// Three.js scene scaffolding: renderer, camera, orbit controls, bloom
// postprocessing, lighting and the procedural shader backdrop.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass, type BokehPassParameters } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { isLightGround, LIGHT_TUNE, type SceneColors } from "../sceneColors";

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
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 b = texture2D(bloomTexture, vUv).rgb;
      float m = max(b.r, max(b.g, b.b));
      vec3 ink = b / max(m, 1e-4);
      float a = clamp(bleed * m, 0.0, 1.0);
      vec3 rgb = base.rgb * mix(vec3(1.0), ink, a) + glow * b;
      gl_FragColor = vec4(rgb, base.a);
    }
  `,
};

// @types/three types BokehPass.uniforms as a bare `object`; the engine reads
// uniforms.focus/maxblur .value, so refine just those.
export type DofPass = BokehPass & {
  uniforms: Record<"focus" | "maxblur", { value: number }>;
};

// js/scene.js createScene() return.
export interface SceneCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  composer: EffectComposer;
  dof: DofPass;
  bloom: UnrealBloomPass; // per-view strength/radius/threshold, driven by the Engine from ViewPolicy
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

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 2000
  );
  camera.position.set(0, 14, 54);

  const renderer = new THREE.WebGLRenderer({
    // antialias:false ON PURPOSE — an EffectComposer renders the scene into offscreen targets and
    // only the final full-screen OutputPass quad reaches the default framebuffer (no geometry edges
    // there to multisample), so renderer MSAA was pure wasted allocation. Composer-target MSAA was
    // tried and reverted (a real perf hit for little gain on this bloom-heavy scene — user). stencil
    // is never used, so drop it too.
    canvas, antialias: false, stencil: false, powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  const composer = new EffectComposer(renderer);
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
    width: window.innerWidth, height: window.innerHeight,
  };
  const dof = new BokehPass(scene, camera, dofParams) as DofPass;
  dof.enabled = false;
  composer.addPass(dof);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.30,  // strength — the dominant "overpowering" lever; well down from the r0.161 default. The
           // whole-scene glow, the geo node "dark halo" (a bloom mip/tonemap ring, not a radius
           // artifact — it survives radius cuts but vanishes with strength), and the fuzzy selected
           // hub all trace back to over-strong bloom.
    0.35,  // radius — tight halos: keeps hubs/core crisp discs (not overpowering washes) and
           // shrinks the bloom-mip "dark ring" that saturated hues cast on the dimmed globe
    0.13   // threshold — low so every identity HUE clears it (bloom thresholds on luminance, and
           // low-luma hues like the blue/green metagraphs would be cut out at a higher value; the
           // node/structure separation comes from the emissive gap, not the threshold)
  );
  composer.addPass(bloom);

  // Terminal pass: applies the renderer's toneMapping + exposure and the sRGB output
  // conversion to the composited result. Without it an EffectComposer bypasses the renderer's
  // output step, so `toneMapping` above was effectively a no-op (three r150+ standardised on
  // OutputPass as the correct chain end).
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // ── The selective-bloom sub-pipeline (see BLOOM_LAYER above) ────────────────────────────────
  //
  // Built LAZILY on the first paper frame, so the dark ground allocates no second composer and no
  // extra render targets — it pays literally nothing for a feature it does not use. The mix pass
  // sits BEFORE the OutputPass so the composite happens in linear space, on the same numbers the
  // tone map and the sRGB encode are about to read.
  let sel: {
    composer: EffectComposer;
    render: RenderPass;
    bloom: UnrealBloomPass;
    mix: ShaderPass;
  } | null = null;

  function ensureSel() {
    if (sel) return;
    const w = Math.max(1, Math.round(window.innerWidth * SEL_SCALE));
    const h = Math.max(1, Math.round(window.innerHeight * SEL_SCALE));
    const c = new EffectComposer(renderer);
    c.renderToScreen = false;
    const rp = new RenderPass(scene, camera);
    rp.clearColor = new THREE.Color(0x000000);
    rp.clearAlpha = 1;
    c.addPass(rp);
    // threshold 0: the target is BLACK except the members, so there is nothing to reject — every
    // mark is above the floor by construction. This is the whole point of the layer (see above).
    const bp = new UnrealBloomPass(new THREE.Vector2(w, h), 1, LIGHT_TUNE.selRadius, 0);
    c.addPass(bp);
    c.setSize(w, h);
    const mx = new ShaderPass(SEL_MIX_SHADER);
    mx.uniforms.bloomTexture.value = c.renderTarget2.texture;
    composer.insertPass(mx, composer.passes.indexOf(outputPass));
    sel = { composer: c, render: rp, bloom: bp, mix: mx };
  }

  /**
   * ONE render call for the frame, so the ground question is asked in exactly one place.
   *
   * On dark this is `composer.render()` and nothing else — the mix pass does not exist, so the
   * chain is the same four passes it has always been and the output is byte-identical.
   *
   * On paper the members are rendered first into their own black target. Three saves make that
   * safe, and each is load-bearing: the BACKGROUND is nulled (the studio backdrop would otherwise
   * fill the target and every pixel would clear the threshold — the layer would select nothing);
   * the camera LAYER MASK is narrowed to the bloom layer alone (`layers.set`, not `enable`, so
   * layer 0 is excluded and the target holds the marks and only the marks); and the AUTOCLEAR is
   * left to the RenderPass's own black clear. All three are restored before the main chain runs,
   * so the visible frame is drawn from exactly the state the rest of the engine set up.
   */
  function renderFrame() {
    // Both knobs at zero IS off, and off must cost nothing — the mark pass is a whole extra scene
    // render plus a blur, so disabling only the mix pass would leave the expensive half running to
    // feed a texture nobody samples. Same shape as the dark path below: skip, don't neutralise.
    const on = isPaper && (LIGHT_TUNE.selBleed > 0 || LIGHT_TUNE.selGlow > 0);
    if (!on) {
      if (sel) sel.mix.enabled = false;
      composer.render();
      return;
    }
    ensureSel();
    const s = sel!;
    s.bloom.radius = LIGHT_TUNE.selRadius;
    s.mix.uniforms.bleed.value = LIGHT_TUNE.selBleed;
    s.mix.uniforms.glow.value = LIGHT_TUNE.selGlow;
    s.mix.enabled = true;

    const bg = scene.background;
    const mask = camera.layers.mask;
    scene.background = null;
    camera.layers.set(BLOOM_LAYER);
    s.composer.render();
    camera.layers.mask = mask;
    scene.background = bg;

    composer.render();
  }

  // The caller (engine) owns the resize listener so it can be removed on dispose.
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    if (sel) {
      sel.composer.setSize(
        Math.max(1, Math.round(window.innerWidth * SEL_SCALE)),
        Math.max(1, Math.round(window.innerHeight * SEL_SCALE)),
      );
      // setSize rebuilds the composer's targets, so the mix pass's captured texture is stale.
      sel.mix.uniforms.bloomTexture.value = sel.composer.renderTarget2.texture;
    }
  }

  function dispose() {
    sel?.composer.dispose();
    sel?.bloom.dispose();
    composer.dispose();
    backdrop?.dispose(); // the paper cyclorama's CanvasTexture (null on a dark-only session)
  }

  // The clear colour is the one construction-time capture of a threaded token in this module
  // (`scene.background`), so it is the one thing a theme flip has to re-apply here — plus the
  // tone-mapping pair above, which keys on the same ground question (the OutputPass reads
  // renderer.toneMapping per render, so no material invalidation is needed).
  //
  // On PAPER the ground is a STUDIO BACKDROP, not a flat fill (user, 2026-08-25: "this dull
  // white background"; 2026-08-26: "gray background looks ugly/boring too"). A flat wall plus a
  // symmetric vignette is a photograph of nothing; a cyclorama is lit from ABOVE and sweeps
  // into depth below, which is what makes a product sit ON something instead of floating in
  // grey. So two composed passes, in this order:
  //
  //   1. a VERTICAL sweep — near-white high, settling through the lower third where the
  //      instruments stand, and gaining CHROMA as it settles;
  //   2. a radial fall-off MULTIPLIED over it, its hot spot high rather than centred, so the
  //      key light and the vignette agree about where the light comes from.
  //
  // The depth colour is not a new hue: `--background` is already oklch(… 265), the same
  // blue-grey family the HUD's own depth tokens live in, so the sweep just stops washing it
  // out. Probed at fixed L, chroma 0.012 → 0.030 moves the sRGB bytes R ×0.974, G ×1.0,
  // B ×1.049 — that vector IS `coolDrift`, which is why the drift is a per-channel bias here
  // rather than an oklch round-trip.
  //
  // A CanvasTexture as scene.background renders screen-stretched (flipY puts the canvas's
  // bottom row at the screen's bottom, so the canvas is in screen orientation). Built at event
  // time only (theme flip / token re-read); the dark ground stays the flat Color it always
  // was — byte-identical.
  let backdrop: THREE.CanvasTexture | null = null;
  let isPaper = isLightGround(colors);
  /**
   * The tint axis, and it is SIGNED: +k drifts the stop toward the blue depth, −k back the other
   * way into a warm cream. One vector, two directions, because a cyclorama's whole colour story is
   * a single warm/cool axis — the sky end and the lit end are not two unrelated hues, they are the
   * two ends of where the light came from.
   *
   * Widened from the ±(2.6%, 0, 4.9%) this started at (user, 2026-08-29: the ground "is a dull gray
   * currently … make it lighter or more colourful"). At the old width the whole frame sat inside one
   * grey-blue, which is exactly the complaint: a drift you have to be told about is not colour.
   */
  // WARM GREIGE, not blue (user, 2026-08-29: "blue... is a bit of a cold color"): the drift
  // axis now runs toward ivory (+R, −B) high on the wall — the gallery-wall answer, and the
  // cool instruments pop by complement. Signed use unchanged (+k warm, −k cool at the stage).
  // ⚠️ SHIPPED INERT since 2026-08-30: even halved, the ivory read BROWN across the lower wall
  // (measured R−B +18 at the floor) — `bgTint` now defaults 0 and the cool-silver token carries
  // the wall's colour alone. The vector stays as the knob's axis, not the shipped look.
  const coolDrift = [1 + 0.028, 1 + 0.006, 1 - 0.030]; // halved: full ivory read DIRTY at wall lightness — a whisper of warmth is the ceiling (user, 2026-08-29)
  // The multiply pass's base — white is a multiply's identity, so its stops read as fractions of
  // whatever the sweep already laid down. Grayscale, so rule 3 has nothing to say about it.
  const WHITE_BYTES = [255, 255, 255];
  function paperBackdrop(bg: number): THREE.CanvasTexture {
    // 1024, not the 512 this started at: the GRID below is a ONE-TEXEL line and the backdrop
    // renders screen-stretched, so the texel size IS the line weight. At 512 a hairline arrives
    // ~6px wide on a 1600px frame, which is a drawn rule rather than paper.
    const S = 1024;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d")!;
    // Scale the sRGB BYTES, not THREE.Color channels — those are linear, and a linear value
    // drawn into a 2D canvas as if it were sRGB shifts the paper's near-neutral hue visibly
    // (first cut of this read lavender).
    // `m` is the level on the stop's base, `k` how far it has drifted along the warm/cool axis
    // (see coolDrift: +k cool, −k warm).
    const tint = (base: readonly number[], m: number, k: number) =>
      "#" + base
        .map((u, i) => Math.round(Math.min(255, u * m * (1 + (coolDrift[i] - 1) * k * LIGHT_TUNE.bgTint)))
          .toString(16).padStart(2, "0")).join("");
    // The two passes' bases: the sweep paints the GROUND itself, the fall-off MULTIPLIES over it,
    // so its base is white (a multiply's identity) and its levels read as fractions of what the
    // sweep already laid down. Sharing `tint` is what keeps both passes on the ONE warm/cool axis
    // — and it is why the vignette needs no colour literal of its own (rule 3: the hue comes from
    // the token, the drift from the one vector, and `bgTint` 0 still returns the whole frame to
    // neutral grey in BOTH passes).
    const bgBytes = [(bg >> 16) & 255, (bg >> 8) & 255, bg & 255];
    const hex = (m: number, k = 0) => tint(bgBytes, m, k);
    const grey = (m: number, k = 0) => tint(WHITE_BYTES, m, k);

    // ⚠️ THE CEILING THAT SHAPED THIS SWEEP WAS THE PAGE'S, NOT THIS GROUND'S (measured
    // 2026-08-29). The rule here used to read "the paper token's blue is already 243/255, so ANY
    // composite over ~1.049 clips" — and every level below was solved downward against it. That
    // 243 is `--background`, the HUD's paper. This backdrop is built from `--scene-ground`, which
    // design fork C turned to SILVER: probed live it is [176,184,198], so the blue has ~57 bytes
    // of headroom and the sweep can spend range UPWARD as well as down. The old ceiling was real
    // when it was written and simply stopped being about this texture; it is why the wall kept
    // being asked to buy hue with level, and why it kept coming back grey.
    //
    // The level is still anchored where the INSTRUMENTS stand — a cyclorama is lit for the
    // subject, and they occupy the middle band — but the anchor itself moved up with the token
    // (user, 2026-08-29: "make the background of the scene lighter"). Both halves of "lighter"
    // are spent: the token carries the ground, this carries the light on it.
    //
    // 1. The sweep — a SKY-TO-STAGE ramp, not a grey fade. Bright and cool at the top where a
    // studio wall catches the most light, easing through the lit band, then falling into a deep
    // saturated blue at the bottom: the floor of the cyclorama, where the light has run out and
    // the hue is all that is left. The k column is what makes it a colour ramp rather than a
    // brightness ramp — it climbs the whole way down, so the frame gets BLUER as it gets darker,
    // which is what depth actually looks like and what a uniform grey-blue never says.
    // ⚠️ DEPTH IS BOUGHT WITH CHROMA HERE, NOT WITH LEVEL — the ask was "lighter" and a cyclorama's
    // floor is the one part that naturally wants to go dark, so the two pull against each other.
    // Measured at the first cut (m 0.9 / 0.76 down the bottom): the corners composited to
    // [105,121,155], DARKER than the flat ground this replaced — the frame read lighter overall and
    // still had a heavy floor. The levels below are lifted and the k column left climbing, so the
    // bottom settles by getting BLUER rather than by getting dimmer.
    const sweep = g.createLinearGradient(0, 0, 0, S);
    // Top pair lifted 1.13/1.09 -> 1.20/1.14 (user, 2026-08-29: "a bit lighter at the top") —
    // still inside the byte headroom the ceiling note above measured; the stage band down is
    // untouched, so the instruments' anchor holds and only the sky end brightens.
    sweep.addColorStop(0, hex(1.2, 0.5));
    sweep.addColorStop(0.28, hex(1.14, 0.35));
    sweep.addColorStop(0.55, hex(1.02, 0.6));
    sweep.addColorStop(0.78, hex(0.96, 1.05));
    sweep.addColorStop(1, hex(0.87, 1.6));
    g.fillStyle = sweep;
    g.fillRect(0, 0, S, S);

    // 2. The fall-off, multiplied so it only ever takes light away — the sweep alone owns the
    // levels, and a second additive pass would fight it for the top end. Centred high (y 0.332)
    // so the brightest point of the wall is where the key light lands, not the middle of the
    // frame.
    //
    // ⚠️ THIS PASS IS NOW THE WARM POOL, AND THAT IS THE OTHER HALF OF THE COLOUR (2026-08-29).
    // Its stops used to be neutral greys, on the rule that "the hue is the sweep's business" —
    // which left one axis doing all the work and the result reading as one tinted grey. A key
    // light is WARM and it lands in a SPOT, so the warmth belongs to the radial pass, not to a
    // horizontal band of the vertical one. Multiply can only darken, so warm is expressed by
    // taking blue away at the centre and taking red away at the rim: the pool goes cream, the
    // corners go cool and deep, and the two passes now cross rather than stack. That crossing is
    // what makes it read as a lit room instead of a gradient.
    const fall = g.createRadialGradient(S / 2, S * 0.332, S * 0.117, S / 2, S * 0.332, S * 0.977);
    fall.addColorStop(0, grey(1, -0.55));
    fall.addColorStop(0.5, grey(0.98, -0.2));
    fall.addColorStop(1, grey(0.89, 0.7));
    g.globalCompositeOperation = "multiply";
    g.fillStyle = fall;
    g.fillRect(0, 0, S, S);

    // 3. THE ENGINEERING-PAPER GRID — the app's own blueprint idiom (components/Blueprint.tsx)
    // brought to the backdrop, because a lit wall with no structure in it is still a wall you
    // look THROUGH rather than a surface the instruments stand on. Three rules keep it from
    // becoming a pattern you look AT:
    //   - it is a MULTIPLY at a few percent, so it can only ever take light away and the sweep
    //     keeps owning the levels;
    //   - it is masked to an ANNULUS around the subject: transparent under the middle, where the
    //     instruments stand and where it must never fight the trail's own dotted label columns,
    //     and gone again before the corners, where the fall-off has already taken the ground —
    //     so the grid is only ever visible on the empty wall between the two;
    //   - the cell is square ON SCREEN, not on the canvas. The backdrop stretches to fill, so a
    //     square canvas cell arrives as a widescreen one; the horizontal pitch carries the live
    //     aspect to cancel that. (It is baked, so a later window resize skews the cells until the
    //     next theme flip — the same approximation the vignette's own circle already makes.)
    if (LIGHT_TUNE.bgGrid > 0) {
      const grid = document.createElement("canvas");
      grid.width = grid.height = S;
      const gg = grid.getContext("2d")!;
      const aspect = Math.min(3, Math.max(0.5, window.innerWidth / Math.max(1, window.innerHeight)));
      const pitchY = S / 9;
      const pitchX = pitchY / aspect;
      gg.strokeStyle = "#000";
      gg.lineWidth = 1;
      gg.beginPath();
      // The half-texel offset is what keeps a 1px stroke ON one texel instead of split across two.
      for (let x = pitchX; x < S; x += pitchX) { gg.moveTo(Math.round(x) + 0.5, 0); gg.lineTo(Math.round(x) + 0.5, S); }
      for (let y = pitchY; y < S; y += pitchY) { gg.moveTo(0, Math.round(y) + 0.5); gg.lineTo(S, Math.round(y) + 0.5); }
      gg.stroke();
      const a = LIGHT_TUNE.bgGrid;
      const ring = gg.createRadialGradient(S / 2, S * 0.52, 0, S / 2, S * 0.52, S * 0.62);
      ring.addColorStop(0, "rgba(0,0,0,0)");
      ring.addColorStop(0.42, `rgba(0,0,0,${a})`);
      ring.addColorStop(0.74, `rgba(0,0,0,${a})`);
      ring.addColorStop(1, "rgba(0,0,0,0)");
      gg.globalCompositeOperation = "destination-in"; // dest alpha *= source alpha — the mask
      gg.fillStyle = ring;
      gg.fillRect(0, 0, S, S);
      g.globalCompositeOperation = "multiply";
      g.drawImage(grid, 0, 0);
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function applyBackground() {
    if (isPaper) {
      backdrop?.dispose();
      backdrop = paperBackdrop(bgColor.getHex());
      scene.background = backdrop;
    } else {
      scene.background = bgColor;
    }
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
  }

  applyBackground(); // construction honours the current ground (a light boot starts on the backdrop)

  return {
    scene, camera, renderer, controls, composer, dof, bloom,
    renderFrame, resize, setClearColor, setGround, dispose,
  };
}
