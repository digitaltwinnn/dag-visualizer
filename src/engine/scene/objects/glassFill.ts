// The shared GLASS FILL — the soft-rimmed, ROUNDED-CORNER surface every pane of glass in the
// anchoring chamber wears (user, 2026-08-07: the floors and the node containers use one fill
// language). A rounded-rectangle signed-distance field in the plane's LOCAL units: outside the
// rounded rect is clipped (the smooth corners), a rim band rises toward the edge over `uEdgeW`
// units, and `uInner` is the flat centre whisper. The look is driven per frame from the owner's
// PlaneTune channel (SnapshotPlane.applyAlpha) — this module owns only the shader.
import * as THREE from "three";

export interface GlassFillUniforms {
  uColor: { value: THREE.Color };
  uOpacity: { value: number }; // the rim band's peak opacity
  uInner: { value: number };   // the flat centre fill
  uEdgeW: { value: number };   // rim width, in the same LOCAL units as uHalf
  uHalf: { value: THREE.Vector2 };  // the plane's half extents
  uRadius: { value: number };  // corner radius, LOCAL units
  // The HORIZON ramp (user, 2026-08-09: "the snapshot lanes logically go all the way to the back
  // since there will be many historic snapshots […] currently there is a hard edge"). The rim band
  // rises toward EVERY edge equally, so the edge the trail runs away into terminated in a bright
  // line — the chamber looked like it stopped rather than continued. This fades the whole surface
  // out before that edge is ever reached, so the glass has no visible end on that side. It is an
  // ALPHA ramp because the fill is additive with no depth write: dimming to zero IS its absence.
  uFadeDir: { value: THREE.Vector2 };  // LOCAL direction pointing AWAY from the horizon
  uFadeAt: { value: number };          // distance along uFadeDir where alpha reaches 0
  uFadeSpan: { value: number };        // ramp length; 0 disables the whole ramp
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
      uFadeDir: { value: new THREE.Vector2(1, 0) },
      uFadeAt: { value: 0 },
      uFadeSpan: { value: 0 },
    },
    vertexShader: `
      varying vec2 vP;
      void main() { vP = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; uniform float uInner; uniform float uEdgeW;
      uniform vec2 uHalf; uniform float uRadius; varying vec2 vP;
      uniform vec2 uFadeDir; uniform float uFadeAt; uniform float uFadeSpan;
      void main() {
        vec2 p = vP * uHalf;
        vec2 q = abs(p) - (uHalf - vec2(uRadius));
        float d = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - uRadius;
        if (d > 0.0) discard; // outside the rounded rectangle — the smooth corner clip
        float band = smoothstep(-uEdgeW, 0.0, d);
        float a = uOpacity * band + uInner;
        // The horizon ramp takes the rim with it, so the far edge dissolves instead of ending.
        if (uFadeSpan > 0.0) a *= smoothstep(uFadeAt, uFadeAt + uFadeSpan, dot(p, uFadeDir));
        if (a <= 0.002) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
}
