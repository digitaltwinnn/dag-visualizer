// The ONE bridge from the app's CSS design tokens (app/globals.css `:root`) into the Three.js
// scene. This is the mechanism the rest of the engine goes through: NO scene module hardcodes a
// structural colour — the Engine calls readSceneColors() once at construction and threads the
// resolved `SceneColors` into every module. globals.css stays the single source of truth for the
// structural palette (the identity/metagraph hues have their own bridge: src/palette + the identity
// `sceneColors` map the Engine already feeds in).
//
// Why read the tokens instead of duplicating them as hex: the tokens are authored in oklch, and
// hand-transcribed hex drifts. The browser resolves oklch→sRGB for free — set a probe element's
// colour to `var(--token)` and read back its computed `rgb(...)`.
//
// Only the FOUR structural tokens are exposed. Everything a view needs "calmer" (the geo hologram,
// the ledger trail tiles, dimmed nodes) is the SAME token rendered dim/transparent — calm comes from
// OPACITY, not a bespoke hue. That keeps the scene on the agreed palette with no invented colours and
// makes cross-view consistency automatic (e.g. the geo hologram and the ledger tiles are both
// `--primary`, so they match by construction).

import * as THREE from "three";

export interface SceneColors {
  core: number; //    --primary   (accent cyan — the DAG spine, live/selected signals, the geo
  //                               hologram + ledger tiles rendered dim, key light)
  dagCore: number; // --core      (DAG hypergraph-core blue — the validator-node fallback hue + rim
  //                               light; ONE hue for the core, L0/L1 are NOT colour-distinguished)
  bg: number; //      --background (scene clear colour + fog + background depth)
  border: number; //  --border     (panel/pill hairline RGB, 90,140,255 — the scene's label chips
  //                               reuse it at the SAME alphas as the .role-chip pill: .22 / .05)
  panel: number; //   --panel      (translucent glass panel RGB, 12,16,32 — the label chips fill
  //                               with it so the badge reads as glass, not the disc behind it)
  muted: number; //   --muted-foreground (the muted text tone — the label-chip CODE text, matching
  //                               the React .role-chip pill's text-muted-foreground)
}

export type SceneColorVar = "--primary" | "--core" | "--background" | "--border" | "--panel" | "--muted-foreground";

// Resolve one CSS colour expression (e.g. "var(--primary)") to a packed 0xRRGGBB. Two steps, because
// the computed-colour STRING format varies by browser (a token authored in oklch resolves to
// `rgb(...)`, `color(srgb 0-1 …)`, or even `oklch(…)` depending on the engine): (1) a hidden probe
// element resolves the var()/oklch to whatever computed string the browser uses; (2) a 1×1 canvas
// normalises that string — canvas fillStyle accepts every colour syntax and getImageData always
// returns 0-255 sRGB bytes. Returns null only with no DOM.
let _probeCtx: CanvasRenderingContext2D | null = null;
function resolveCssColor(expr: string): number | null {
  if (typeof document === "undefined") return null;
  const el = document.createElement("span");
  el.style.cssText = `color:${expr};position:absolute;left:-9999px;visibility:hidden`;
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  el.remove();
  if (!computed) return null;
  if (!_probeCtx) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    _probeCtx = cv.getContext("2d", { willReadFrequently: true });
  }
  if (!_probeCtx) return null;
  _probeCtx.fillStyle = "#000";
  _probeCtx.fillStyle = computed; // invalid → stays #000; valid → normalised to sRGB
  _probeCtx.fillRect(0, 0, 1, 1);
  const d = _probeCtx.getImageData(0, 0, 1, 1).data;
  return (d[0] << 16) | (d[1] << 8) | d[2];
}

// Read one structural token as a 0xRRGGBB number. Exported so the Engine can spot-check drift
// against config.COLORS in dev (see Engine constructor). Client-only: the Engine (the sole caller)
// never constructs without a DOM + the applied stylesheet, so a null return is a genuine
// misconfiguration — it throws rather than silently substituting an off-palette colour.
export function readColorToken(name: SceneColorVar): number {
  const v = resolveCssColor(`var(${name})`);
  if (v == null) throw new Error(`sceneColors: CSS token ${name} did not resolve (is globals.css applied?)`);
  return v;
}

/**
 * Is the scene's GROUND paper rather than ink? Asked by the few scene modules whose BLEND MODE — not
 * their colour — has to change with the theme: the glass fill glows (additive) on a dark ground and
 * shades (normal blend, dark ink) on a light one. That is a fact about the BACKGROUND, not about a
 * theme name, so the scene asks the colours it was handed and never learns the word "light" (rule 1
 * keeps `scene/` free of store values; this keeps it free of the theme vocabulary too). ONE home for
 * the question, so two adapters can't disagree about which ground they are on.
 *
 * Rec. 709 relative luminance over the packed sRGB bytes, thresholded at the midpoint — the two
 * grounds this app ships sit at ~0.03 and ~0.95, so nothing rides on the exact cut.
 */
export function isLightGround(c: SceneColors): boolean {
  const r = (c.bg >> 16) & 0xff, g = (c.bg >> 8) & 0xff, b = c.bg & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}

/**
 * THE SCENE'S GLOW IDIOM IS ADDITIVE, AND ADDITIVE IS A NO-OP ON PAPER. Every piece of emissive
 * furniture in this app — the ribbons, the arcs, the hyper tethers and ring fills, the geo globe's
 * graticule/borders/coastal wall, the density glow — adds light to a black ground. Add that same
 * light to a 0.965-L ground and it saturates to white: the element is drawn, its tint is correct,
 * and it is invisible. So the blend mode THEMES alongside the colour, and on a light ground the
 * furniture paints its tint as INK (normal blend) instead of adding it as glow.
 *
 * One home, asked by every additive site (convention 8), because the failure is silent: a material
 * that forgets to ask still renders, still retints, and still cannot be seen. Found live on the geo
 * globe and again on the ledger's ribbons, which vanished entirely on paper.
 *
 * A material whose blend mode can change after construction must set `needsUpdate` when it does —
 * three caches the program per blending mode.
 */
export function glowBlend(c: SceneColors): THREE.Blending {
  return isLightGround(c) ? THREE.NormalBlending : THREE.AdditiveBlending;
}

const _ground = new THREE.Color();

/**
 * Scale a mark's PRESENCE for whichever ground it is painted on, in place (`out` arrives holding
 * the mark's own hue). Companion to `glowBlend`: the sites that bake presence into a VERTEX colour
 * rather than into a material `opacity` — the ledger's ribbons, hyper's tethers — need the same
 * ground question answered a second way.
 *
 * On the dark ground the mark is additive glow, so less presence is a straight multiply toward
 * black, which IS the ground. On paper the mark is normal-blended ink, and a multiply there drives
 * it toward BLACK instead — making the dimmest thing the most prominent thing on the page and
 * inverting every emphasis hierarchy in the app (dimTiers' order is the design). Presence on paper
 * is therefore a lerp toward the PAPER: same meaning, expressed for the ground it lands on.
 *
 * Dark keeps the pure multiply rather than lerping from `--background` too: the dark look is
 * byte-pinned, and a non-black ground would add a few percent of grey to every dimmed mark.
 *
 * Event-time only (colour bakes), so the module scratch never runs in a frame body.
 */
export function inkMix(out: THREE.Color, s: number, c: SceneColors): THREE.Color {
  if (!isLightGround(c)) return out.multiplyScalar(s);
  _ground.setHex(c.bg);
  out.r = _ground.r + (out.r - _ground.r) * s;
  out.g = _ground.g + (out.g - _ground.g) * s;
  out.b = _ground.b + (out.b - _ground.b) * s;
  return out;
}

// Read the four structural tokens from globals.css. Called once by the Engine at construction.
export function readSceneColors(): SceneColors {
  return {
    core: readColorToken("--primary"),
    dagCore: readColorToken("--core"),
    bg: readColorToken("--background"),
    border: readColorToken("--border"),
    panel: readColorToken("--panel"),
    muted: readColorToken("--muted-foreground"),
  };
}
