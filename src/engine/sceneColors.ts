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

export interface SceneColors {
  core: number; //    --primary   (accent cyan — the DAG spine, live/selected signals, the geo
  //                               hologram + ledger tiles rendered dim, key light)
  dagCore: number; // --core      (DAG hypergraph-core blue — the validator-node fallback hue + rim
  //                               light; ONE hue for the core, L0/L1 are NOT colour-distinguished)
  bg: number; //      --background (scene clear colour + fog + background depth)
}

export type SceneColorVar = "--primary" | "--core" | "--background";

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

// Read the four structural tokens from globals.css. Called once by the Engine at construction.
export function readSceneColors(): SceneColors {
  return {
    core: readColorToken("--primary"),
    dagCore: readColorToken("--core"),
    bg: readColorToken("--background"),
  };
}
