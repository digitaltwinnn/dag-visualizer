// The shared GLASS FILL — the soft-rimmed, ROUNDED-CORNER surface every pane of glass in the
// anchoring chamber wears (user, 2026-08-07: the floors and the node containers use one fill
// language). A rounded-rectangle signed-distance field in the plane's LOCAL units: outside the
// rounded rect is clipped (the smooth corners), a rim band rises toward the edge over `uEdgeW`
// units, and `uInner` is the flat centre whisper. The look is driven per frame from the owner's
// FloorTune (LedgerView._applyFloorAlpha / NodeRails.update) — this module owns only the shader.
import * as THREE from "three";

export interface GlassFillUniforms {
  uColor: { value: THREE.Color };
  uOpacity: { value: number }; // the rim band's peak opacity
  uInner: { value: number };   // the flat centre fill
  uEdgeW: { value: number };   // rim width, in the same LOCAL units as uHalf
  uHalf: { value: THREE.Vector2 };  // the plane's half extents
  uRadius: { value: number };  // corner radius, LOCAL units
}

/** One glass-fill material for a plane of `halfW × halfH` half extents. The caller owns the
 *  uniforms (typed via `.uniforms as unknown as GlassFillUniforms`) and drives the opacities. */
export function makeGlassFill(colorHex: number, halfW: number, halfH: number, radius: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 0 },
      uInner: { value: 0 },
      uEdgeW: { value: 1 },
      uHalf: { value: new THREE.Vector2(halfW, halfH) },
      uRadius: { value: radius },
    },
    vertexShader: `
      varying vec2 vP;
      void main() { vP = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; uniform float uInner; uniform float uEdgeW;
      uniform vec2 uHalf; uniform float uRadius; varying vec2 vP;
      void main() {
        vec2 p = vP * uHalf;
        vec2 q = abs(p) - (uHalf - vec2(uRadius));
        float d = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - uRadius;
        if (d > 0.0) discard; // outside the rounded rectangle — the smooth corner clip
        float band = smoothstep(-uEdgeW, 0.0, d);
        float a = uOpacity * band + uInner;
        if (a <= 0.002) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
}
