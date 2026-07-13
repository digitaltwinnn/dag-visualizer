// Three.js scene scaffolding: renderer, camera, orbit controls, bloom
// postprocessing, lighting and the procedural shader backdrop.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass, type BokehPassParameters } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { SceneColors } from "../sceneColors";

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
  scene.background = new THREE.Color(colors.bg);
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Exposure is the master brightness dial (a single multiplier applied to the whole frame at
  // the OutputPass). Kept below 1 on purpose: the scene otherwise read too hot overall — most
  // visible in hyper/geo, where many emissive nodes each contribute a bit of ADDITIVE bloom that
  // accumulates into a general glow. Nudged 0.7 → 0.82 (user) after the large bright objects were
  // downsized and ACES gave more highlight headroom — the scene has room to sit a touch brighter.
  renderer.toneMappingExposure = 0.82;

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
    focus: 54, aperture: 0.0002, maxblur: 0.01,
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

  return { scene, camera, renderer, controls, composer, dof, bloom, resize };
}
