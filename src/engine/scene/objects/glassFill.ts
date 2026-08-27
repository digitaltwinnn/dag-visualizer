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
  // ── THE DAY GLASS (light ground only; `uPaper` selects the branch) ────────────────────────────
  // The dark look's two channels above are FLAT — an additive whisper over black needs no shading,
  // because the black itself is the contrast. On paper a flat fill is a sheet of card, which is
  // exactly what the user saw ("the snapshot page panels look really ugly in light mode"). These
  // drive the light branch's view-dependent terms instead; SnapshotPlane owns their levels.
  uPaper: { value: number };    // 0 = the pinned dark branch, 1 = the day glass
  uBody: { value: number };     // the pane's own tint alpha (what the glass itself costs the ground)
  uSky: { value: number };      // how far the reflected room lifts the pane's COLOUR toward white
  uRim: { value: number };      // the Fresnel reflectance — the day glass's one alpha gradient
  uSpec: { value: number };     // the reflected light source ("the window")
  uSpecPow: { value: number };  // its tightness
  uEdgeA: { value: number };    // the polished edge
  uLightDir: { value: THREE.Vector3 }; // the virtual window's WORLD direction (see makeGlassFill)
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

/** The virtual window the day glass reflects — a WORLD direction, up and toward the camera side of
 *  the chamber, so the floor's specular lands as a band across the trail and sweeps as you orbit.
 *  It is not the StageLight and not a THREE.Light at all: a ShaderMaterial is unlit, so the light a
 *  glass pane needs is the one it REFLECTS, and that is a direction, not a lamp. Shared by every
 *  pane so the whole chamber is lit from one place. */
const WINDOW_DIR = new THREE.Vector3(0.42, 0.82, 0.39).normalize();

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
      uSky: { value: 0 },
      uRim: { value: 0 },
      uSpec: { value: 0 },
      uSpecPow: { value: 12 },
      uEdgeA: { value: 0 },
      uLightDir: { value: WINDOW_DIR },
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
        // WORLD normal (not three's view-space \`normalMatrix\`): the day glass reflects the room and
        // the window, both of which are world directions. The panes are rotated and scaled in-plane
        // only, so mat3(modelMatrix) is exact for a +Z face after normalize.
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; uniform float uInner; uniform float uEdgeW;
      uniform vec2 uHalf; uniform float uRadius; varying vec2 vP;
      uniform vec2 uFadeDir; uniform float uFadeAt; uniform float uFadeSpan;
      uniform float uPaper; uniform float uBody; uniform float uSky; uniform float uRim;
      uniform float uSpec; uniform float uSpecPow; uniform float uEdgeA; uniform vec3 uLightDir;
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

        // ── THE DAY GLASS ────────────────────────────────────────────────────────────────────────
        // A pane of glass over a light ground is not a tint, it is a REFLECTANCE that varies with
        // the angle you read it at: see-through where you look straight into it, a mirror where you
        // look along it. That one gradient is the whole effect, and it is the term two earlier
        // rounds got wrong — a flat body reads as card, and body + a separate sky lobe reads as an
        // opaque slab, because across a floor the room term and Fresnel are COMPLEMENTARY and their
        // sum is flat. So Fresnel alone carries how much pane you see; the room only says what COLOUR the
        // reflection is. No env map, no second pass, no light in the scene.
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N; // DoubleSide: the floors are read from above, the trays head-on
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fres = 0.06 + 0.94 * pow(1.0 - ndv, 5.0); // Schlick, glass's own R0 at normal incidence
        vec3 R = reflect(-V, N);
        // THE ROOM, and it has a FLOOR. A ray that reflects downward is not looking at black: this
        // chamber's own ground is paper, so the room is bright above the horizon and a lit silver
        // below it, never zero. Bottoming it out is what made the lane planes read from underneath
        // as an opaque dark wedge — physically a mirror, but a mirror of nothing.
        float room = mix(0.34, 1.0, smoothstep(-0.9, 0.85, R.y));
        float win = pow(max(dot(R, uLightDir), 0.0), uSpecPow);  // its window
        float pol = uEdgeA * band * band;                        // the polished rim

        // Reflectance is CAPPED below 1: real glass at grazing is a full mirror, and a full mirror
        // in the lane storey hides the tiles and ribbons the chamber exists to show. uRim is that
        // cap — the pane stays a pane you read the trail through.
        float a = clamp(uBody + uRim * fres + uSpec * win + pol, 0.0, 1.0) * fade;
        if (a <= 0.002) discard;
        // uColor is the muted ink: a ray that reflects nothing above the horizon costs the ground a
        // little, which is the transmission tint. Sky, window and rim lift it toward the room.
        vec3 col = mix(uColor, vec3(1.0), clamp(uSky * room + uSpec * win + pol, 0.0, 1.0));
        gl_FragColor = vec4(col, a);
      }`,
  });
  applyGlassTheme(mat, c);
  return mat;
}
