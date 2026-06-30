// Three.js scene scaffolding: renderer, camera, orbit controls, bloom
// postprocessing, lighting and the procedural shader backdrop.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { COLORS } from "./config.js";
import { createBackground } from "./background.js";

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.FogExp2(COLORS.bg, 0.012);

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 2000
  );
  camera.position.set(0, 14, 54);

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 12;
  controls.maxDistance = 140;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;

  // Lighting — mostly ambient since materials are emissive; a couple of
  // points add subtle dimensional shading.
  scene.add(new THREE.AmbientLight(0x4a5a8c, 1.1));
  const key = new THREE.PointLight(COLORS.core, 2.2, 220);
  key.position.set(0, 8, 0);
  scene.add(key);
  const rim = new THREE.PointLight(COLORS.l1, 1.4, 260);
  rim.position.set(40, -20, -30);
  scene.add(rim);

  const background = createBackground(scene);

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
  const dof = new BokehPass(scene, camera, {
    focus: 54, aperture: 0.0002, maxblur: 0.01,
    width: window.innerWidth, height: window.innerHeight,
  });
  dof.enabled = false;
  composer.addPass(dof);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.9,   // strength
    0.7,   // radius
    0.18   // threshold
  );
  composer.addPass(bloom);

  // The caller (engine) owns the resize listener so it can be removed on dispose.
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  }

  return { scene, camera, renderer, controls, composer, dof, background, resize };
}
