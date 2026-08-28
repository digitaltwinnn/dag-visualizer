// Three.js scene scaffolding: renderer, camera, orbit controls, bloom
// postprocessing, lighting and the procedural shader backdrop.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass, type BokehPassParameters } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { isLightGround, LIGHT_TUNE, type SceneColors } from "../sceneColors";

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
  resize(): void;
  /**
   * Re-point the scene's clear colour at a new `--background` (theme flip). The scene has no fog
   * (see createScene), so the background IS the whole backdrop and this one write is the entire
   * ground change. Plain data in — rule 1 untouched.
   */
  setClearColor(bg: number): void;
  setGround(light: boolean): void;
}

// Scene LIGHTING is a rendering technicality, NOT a palette concern: a light shades the (mostly
// emissive) materials for subtle dimensional form — it is not a surface, accent or identity hue, so
// it is deliberately NOT sourced from the CSS design tokens. These are dedicated, self-contained cool
// lighting literals (all allowlisted in noHardcodedColors.test.ts). Changing the palette must not
// change the lighting, and vice-versa.
const LIGHT_AMBIENT = 0x4a5a8c; // cool-grey fill (mostly carries the scene, materials being emissive)
const LIGHT_KEY = 0xccd6e6;     // neutral cool-white key light (top)
const LIGHT_RIM = 0x5a6f9c;     // muted cool rim light (back — edge separation)

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

  // Lighting — mostly ambient since materials are emissive; a couple of points add subtle
  // dimensional shading. All three are dedicated lighting literals (see LIGHT_* above), decoupled
  // from the palette — a light is a rendering technicality, not an accent/identity hue.
  scene.add(new THREE.AmbientLight(LIGHT_AMBIENT, 1.1));
  const key = new THREE.PointLight(LIGHT_KEY, 2.2, 220);
  key.position.set(0, 8, 0);
  scene.add(key);
  const rim = new THREE.PointLight(LIGHT_RIM, 1.4, 260);
  rim.position.set(40, -20, -30);
  scene.add(rim);

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
  composer.addPass(new OutputPass());

  // The caller (engine) owns the resize listener so it can be removed on dispose.
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
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
  // The drift vector above, applied per channel at strength k.
  const coolDrift = [1 - 0.026, 1, 1 + 0.049];
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
    // `m` is the level on the paper, `k` how far the stop has settled into its own hue.
    const hex = (m: number, k = 0) =>
      "#" + [(bg >> 16) & 255, (bg >> 8) & 255, bg & 255]
        .map((u, i) => Math.round(Math.min(255, u * m * (1 + (coolDrift[i] - 1) * k * LIGHT_TUNE.bgTint)))
          .toString(16).padStart(2, "0")).join("");

    // ⚠️ THE RANGE IS SPENT DOWNWARD, BECAUSE PAPER HAS ALMOST NO HEADROOM ABOVE IT. The paper
    // token's blue is already 243/255, so ANY composite over ~1.049 clips that channel alone and
    // swings the top of the frame off-hue — a ceiling the levels below are solved against, never
    // an aesthetic choice. (The same shape as this wave's ink curve: on paper, emphasis is
    // separation you take AWAY, not light you add.)
    //
    // The level is therefore anchored at MID-FRAME, not at the area mean: a cyclorama is lit for
    // the subject, and the instruments stand in the middle band. Composite there is 0.976 — the
    // ground level the user tuned — while the frame falls away below and to the corners.
    //
    // 1. The sweep. Measured on the flat-vignette cut (user: "I don't see it"): 1.5%/−6% over a
    // screen-stretched canvas lands under JPEG noise, so the range has to be this wide to read at
    // all. The knee sits at 0.72 because the instruments' own footprint starts around there.
    //
    // ⚠️ THE TOP STOP BUYS HUE WITH LEVEL, BECAUSE THE CEILING ALLOWS NOTHING ELSE (user,
    // 2026-08-26: "the gray looks boring"). The cool drift RAISES blue, so at the old 1.045 any
    // drift at all clipped — which is exactly why the brightest, largest part of the frame was
    // the one part with no hue in it, and why the whole thing read grey. Dropping the top to 1.02
    // opens room for k = 0.4 there; the eye reads the tint, not the 2% of level it cost. The two
    // MIDDLE stops keep their levels untouched — the mid-frame anchor above is measured through
    // them — and only their k rises, so the frame gains colour without moving the ground the user
    // tuned. The bottom is where the range is genuinely spent: deeper (0.82) and fully drifted, so
    // the lower third settles into depth instead of into grey.
    const sweep = g.createLinearGradient(0, 0, 0, S);
    sweep.addColorStop(0, hex(1.02, 0.4));
    sweep.addColorStop(0.40, hex(1, 0.55));
    sweep.addColorStop(0.72, hex(0.93, 0.9));
    sweep.addColorStop(1, hex(0.82, 1.35));
    g.fillStyle = sweep;
    g.fillRect(0, 0, S, S);

    // 2. The fall-off, multiplied so it only ever takes light away — the sweep alone owns the
    // levels, and a second additive pass would fight it for the top end. Centred high (y 0.332)
    // so the brightest point of the wall is where the key light lands, not the middle of the
    // frame. Greys are neutral on purpose: the hue is the sweep's business. The outer stop is
    // what makes the pass earn its place: at #ebebeb the corners sat 2 levels under mid-frame,
    // measured — a fall-off nobody could see is just a slower fill.
    const fall = g.createRadialGradient(S / 2, S * 0.332, S * 0.117, S / 2, S * 0.332, S * 0.977);
    fall.addColorStop(0, "#ffffff");
    fall.addColorStop(0.5, "#fbfbfb");
    fall.addColorStop(1, "#e0e0e0");
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

  return { scene, camera, renderer, controls, composer, dof, bloom, resize, setClearColor, setGround };
}
