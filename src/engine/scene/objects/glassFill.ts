// The shared GLASS FILL — the soft-rimmed, ROUNDED-CORNER surface every pane of glass in the
// anchoring chamber wears (user, 2026-08-07: the floors and the node containers use one fill
// language). A rounded-rectangle signed-distance field in the plane's LOCAL units: outside the
// rounded rect is clipped (the smooth corners), a rim band rises toward the edge over `uEdgeW`
// units, and `uInner` is the flat centre whisper. The look is driven per frame from the owner's
// PlaneTune channel (SnapshotPlane.applyAlpha) — this module owns only the shader.
import * as THREE from "three";
import { isLightGround, type SceneColors } from "../../sceneColors";

export interface GlassFillUniforms {
  uColor: { value: THREE.Color };
  uOpacity: { value: number }; // the rim band's peak opacity
  uInner: { value: number };   // the flat centre fill
  uEdgeW: { value: number };   // rim width, in the same LOCAL units as uHalf
  uHalf: { value: THREE.Vector2 };  // the plane's half extents
  uRadius: { value: number };  // corner radius, LOCAL units
  // ── THE DAY SHEET (light ground only; `uPaper` selects the branch) ───────────────────────────
  // The dark look's two channels above are FLAT — an additive whisper over black needs no shading,
  // because the black itself is the contrast. On paper the pane is a MATTE SHEET of the furniture
  // ink (Print, 2026-10-09): a body tint, a whisper of Fresnel so a pane read along its plane firms
  // a little, and a hairline along the rim. (The reflected room, the window, the softboxes, the
  // polished lip and the lamp lobe of the 2026-08 day GLASS were retired with the lit wall and
  // deleted — user, 2026-10-09; git carries them.) SnapshotPlane owns the levels.
  uPaper: { value: number };    // 0 = the pinned dark branch, 1 = the day sheet
  uBody: { value: number };     // the pane's own tint alpha (what the sheet itself costs the ground)
  uRim: { value: number };      // the Fresnel reflectance — the sheet's one alpha gradient
  // THE PRINT HAIRLINE (2026-10-09): an INK line one or two pixels wide along the pane's rim, in
  // screen space (fwidth of the SDF), so every sheet is edged the way the HUD's cards are — a
  // hairline on paper rather than a polished white lip, which a white page cannot show. Paper only.
  uLine: { value: number };
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

/**
 * THEME — the glass is the one piece of chamber furniture whose BLEND MODE themes, not just its
 * colour. On the dark ground it GLOWS: additive cyan at a whisper alpha, which is why "calm comes
 * from opacity" works there. On paper additive is invisible — adding light to near-white is a no-op
 * — so the same whisper has to SHADE instead: normal blending with the muted ink tone. Same
 * uniforms, same tune knobs, opposite direction of travel, and no new colour literal either way
 * (spec §5: "glass planes shade DARK at low alpha instead of glowing").
 *
 * Keyed on the GROUND, not on a theme name — `scene/` never learns the word (see isLightGround).
 */
export function applyGlassTheme(mat: THREE.ShaderMaterial, c: SceneColors): void {
  const paper = isLightGround(c);
  mat.blending = paper ? THREE.NormalBlending : THREE.AdditiveBlending;
  (mat.uniforms.uColor.value as THREE.Color).setHex(paper ? c.muted : c.core);
  mat.uniforms.uPaper.value = paper ? 1 : 0;
  mat.needsUpdate = true; // blending is a program/state flag, not a uniform
}

/** One glass-fill material for a plane of `halfW × halfH` half extents. The caller owns the
 *  uniforms (typed via `.uniforms as unknown as GlassFillUniforms`) and drives the opacities.
 *  The theme half of the look is `applyGlassTheme`, called here and again on every flip. */
export function makeGlassFill(c: SceneColors, halfW: number, halfH: number, radius: number): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(c.core) },
      uOpacity: { value: 0 },
      uInner: { value: 0 },
      uEdgeW: { value: 1 },
      uHalf: { value: new THREE.Vector2(halfW, halfH) },
      uRadius: { value: radius },
      uPaper: { value: 0 },
      uBody: { value: 0 },
      uRim: { value: 0 },
      uLine: { value: 0 },
      uFadeDir: { value: new THREE.Vector2(1, 0) },
      uFadeAt: { value: 0 },
      uFadeSpan: { value: 0 },
    },
    vertexShader: `
      varying vec2 vP; varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vP = uv * 2.0 - 1.0;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        // WORLD normal (not three's view-space \`normalMatrix\`): the day sheet's Fresnel reads the
        // world view vector. The panes are rotated and scaled in-plane only, so mat3(modelMatrix)
        // is exact for a +Z face after normalize.
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; uniform float uInner; uniform float uEdgeW;
      uniform vec2 uHalf; uniform float uRadius; varying vec2 vP;
      uniform vec2 uFadeDir; uniform float uFadeAt; uniform float uFadeSpan;
      uniform float uPaper; uniform float uBody; uniform float uRim; uniform float uLine;
      varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vec2 p = vP * uHalf;
        vec2 q = abs(p) - (uHalf - vec2(uRadius));
        float d = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - uRadius;
        if (d > 0.0) discard; // outside the rounded rectangle — the smooth corner clip
        float band = smoothstep(-uEdgeW, 0.0, d);
        // The horizon ramp takes every channel with it, so the far edge dissolves instead of ending.
        float fade = 1.0;
        if (uFadeSpan > 0.0) fade = smoothstep(uFadeAt, uFadeAt + uFadeSpan, dot(p, uFadeDir));

        if (uPaper < 0.5) {
          float a = (uOpacity * band + uInner) * fade;
          if (a <= 0.002) discard;
          gl_FragColor = vec4(uColor, a);
          return;
        }

        // ── THE DAY SHEET ────────────────────────────────────────────────────────────────────────
        // A matte sheet of ink over a light ground: a flat body, a whisper of Fresnel (see-through
        // where you look straight into it, a little firmer where you look along it — the one
        // gradient that says "pane" without lifting anything toward white), and a hairline.
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N; // DoubleSide: the floors are read from above, the trays head-on
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fres = 0.06 + 0.94 * pow(1.0 - ndv, 5.0); // Schlick, glass's own R0 at normal incidence
        // The Print hairline: ~1.5px of ink just inside the rim, measured in screen space so it
        // is the same weight on the near floor and the far lane plane.
        float aa = max(fwidth(d), 1e-4);
        float line = uLine * (1.0 - smoothstep(0.8 * aa, 2.2 * aa, -d));
        // Reflectance is CAPPED below 1: a full mirror in the lane storey would hide the tiles and
        // ribbons the chamber exists to show. uRim is that cap.
        float a = max(clamp(uBody + uRim * fres, 0.0, 1.0), line) * fade;
        if (a <= 0.002) discard;
        gl_FragColor = vec4(uColor, a); // ink, never lifted
      }`,
  });
  applyGlassTheme(mat, c);
  return mat;
}
