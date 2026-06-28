// A procedural skydome shader behind both views. It reads `uMorph` (0 = Hypergraph,
// 1 = globe) and crossfades between two looks in the network's palette:
//   - Hypergraph (digital): a single flat deep colour — no animation, no gradient, no tint
//     (it was distracting).
//   - Geography (space): a sparse field of twinkling stars + faint nebula.
//
// Rendered on a large inward-facing sphere behind everything (no depth test),
// kept mostly below the bloom threshold so it stays subtle.

import * as THREE from "three";
import { COLORS } from "./config.js";

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform float uTime;
  uniform float uMorph;
  uniform vec3 uCyan;
  uniform vec3 uBlue;
  uniform vec3 uPurple;
  uniform vec3 uDeep;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.02; a *= 0.5; }
    return s;
  }

  // One layer of stars: a randomly-placed point per grid cell, with twinkle.
  float starLayer(vec3 dir, float density, float thresh) {
    vec3 p = dir * density;
    vec3 id = floor(p);
    vec3 gv = fract(p) - 0.5;
    float present = hash(id);
    if (present < thresh) return 0.0;
    vec3 off = vec3(hash(id + 1.3), hash(id + 2.7), hash(id + 4.1)) - 0.5;
    float d = length(gv - off * 0.75);
    float core = smoothstep(0.16, 0.0, d);
    float tw = 0.55 + 0.45 * sin(uTime * (1.5 + 2.5 * hash(id + 9.0)) + present * 6.2831);
    return core * tw;
  }

  const float PI = 3.14159265;

  // ---- Hypergraph background: a single flat colour (no animation, no gradient, no tint) ----
  vec3 digitalBg(vec3 dir) {
    return uDeep;
  }

  // ---- Geography background: deep space with twinkling stars ----
  // Sparser than before (higher thresholds = fewer cells get a star, and the fine dust
  // layer is dropped) so the field reads as a quiet backdrop — but each remaining star
  // keeps its per-star twinkle (the blink), so the sky still feels alive.
  vec3 spaceBg(vec3 dir) {
    float s = 0.0;
    s += starLayer(dir, 46.0, 0.91) * 1.0;
    s += starLayer(dir, 95.0, 0.945) * 0.55;
    s *= 0.82;
    float n = fbm(dir * 2.3 + vec3(0.0, uTime * 0.01, 0.0));
    float mask = smoothstep(0.5, 0.95, pow(n, 1.6));
    vec3 neb = mix(uBlue, uPurple, fbm(dir * 1.4 + 11.0));

    vec3 col = uDeep;
    col += uBlue * 0.025 * (dir.y * 0.5 + 0.5);
    col += neb * mask * 0.05;
    col += vec3(s) + s * 0.3 * uCyan;
    return col;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float m = smoothstep(0.0, 1.0, uMorph);
    vec3 col = mix(digitalBg(dir), spaceBg(dir), m);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createBackground(scene) {
  const uniforms = {
    uTime: { value: 0 },
    uMorph: { value: 0 },
    uCyan: { value: new THREE.Color(COLORS.core) },
    uBlue: { value: new THREE.Color(COLORS.l0) },
    uPurple: { value: new THREE.Color(COLORS.l1) },
    uDeep: { value: new THREE.Color(0x04050c) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    mesh,
    update(dt, morph) {
      uniforms.uTime.value += dt; // still drives the geo starfield twinkle
      uniforms.uMorph.value = morph;
    },
  };
}
