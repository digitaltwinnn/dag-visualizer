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
    canvas, antialias: true, powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Tone mapping — NeutralToneMapping (Khronos PBR Neutral). With the OutputPass added below it
  // now ACTUALLY applies (an EffectComposer bypasses the renderer's direct-to-screen output, so
  // this was a no-op before). Neutral was chosen over ACES + AgX in a live A/B on the
  // bloom-heavy scene: ACES + AgX both added a milky highlight haze and desaturated the neon
  // identity hues; Neutral tames the blown-out cores (the Global L0 core reads as a glowing cyan
  // orb, not a flat white disc) while keeping the vivid cyans/magentas the identity system needs.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

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
    0.6,   // strength (was 0.9 — the bloom read overpowered under the now-applied tone mapping)
    0.55,  // radius (was 0.7 — tighter halo)
    0.28   // threshold (was 0.18 — only genuinely bright cores/hubs bloom, not every midtone)
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

  return { scene, camera, renderer, controls, composer, dof, resize };
}
