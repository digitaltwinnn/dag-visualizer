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
import { SCENE_L_LIGHT, SCENE_C_LIGHT } from "../palette/identity";

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
  fg: number; //      --foreground (full body ink — reached ONLY by `labelInk`'s "readout" weight,
  //                               for in-scene text that states a reading rather than a name)
}

export type SceneColorVar = "--primary" | "--core" | "--background" | "--scene-ground" | "--border" | "--panel" | "--muted-foreground" | "--foreground";

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

/**
 * THE FURNITURE INK — the tone for in-scene TEXT (2026-08-28). Third member of the ground-question
 * family, and the one that is about the mark's HUE rather than its blend mode or its presence.
 *
 * Text is the one thing in the scene that is READ rather than looked at, so it answers the ground
 * differently from every glowing mark beside it. On the dark ground the accent IS the ink: a cyan
 * label is light added to black and reads at a glance. Point that same accent at a 0.93-L page and
 * it is pale teal on white — measured at the resting pose, the chamber's floor name ran 1.27:1 and
 * its ordinal column 1.33:1 against their own ground, which is not a quiet label, it is an absent
 * one. On paper the ink must be INK, so it takes `--muted-foreground`: the HUD's own tone for its
 * quietest words, which is exactly the register furniture text wants — legible at a glance, never
 * competing with the data.
 *
 * ONE home, because the callers are two families that would otherwise drift: the chamber's edge
 * labels tint a white canvas through a material `color` (a flip is one setHex), while geo's country
 * names bake their tone INTO the canvas (a flip is a redraw). Same question, same answer, two
 * mechanisms — which is precisely the shape that grows a second opinion if each site asks alone.
 *
 * TWO WEIGHTS, BECAUSE IN-SCENE TEXT IS TWO THINGS AND ONLY PAPER CAN TELL THEM APART. A `name`
 * is FURNITURE — the floor's "GLOBAL SNAPSHOTS", a lane's ticker, a hosting country — sparse by
 * review and never the subject; it takes `--muted-foreground`, the HUD's own tone for its quietest
 * words. A `readout` is the chamber's exact reading of what its geometry encodes — the ordinal
 * column for POSITION, the size column for WIDTH — and a readout you cannot read is not quiet, it
 * is missing; it takes `--foreground`.
 *
 * Measured rather than felt, at the resting pose against each mark's own ground: dark runs the
 * floor name at 4.64:1 and the ordinal column at 2.84:1, so dark already spends more on the
 * readout than its size suggests. On paper the accent gave 1.94:1 and 1.35:1; one muted ink lifted
 * them to 2.93:1 and 1.51:1 — the name arriving, the column still half of what dark gives it,
 * because a 5px glyph antialiases to about half coverage and no hue survives that at L* 34.8.
 * `--foreground` is what buys the column back, and pointing the NAME there too would take it past
 * dark's own 4.64:1 and make it compete with the snapshots lying on it. Same question, one home,
 * two answers — which is the shape that keeps a call site from inventing a third.
 *
 * Dark answers `c.core` to both, so it is byte-identical by construction whatever a caller asks.
 */
export function labelInk(c: SceneColors, weight: "name" | "readout" = "name"): number {
  if (!isLightGround(c)) return c.core;
  return weight === "readout" ? c.fg : c.muted;
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
 * A LERP IS AN ALPHA COMPOSITE, SO IT MUST NAME WHAT THE MARK ACTUALLY LIES ON (2026-08-28).
 * `lerp(ground, ink, s)` is exactly what compositing the ink at alpha `s` would paint — which is
 * why this is the honest stand-in for transparency at a site that cannot BE transparent. The
 * chamber's ground is what every one of these marks lies on, INCLUDING the ledger's lane tiles: a
 * pass that pointed those at `c.panel` instead, reasoning that a tile lies on a "near-white glass
 * PLANE", was measured wrong — sampled live the plane's channels land in the high 170s to low 190s
 * against `c.panel`'s 251, so a thinning tile arrived brighter than its own backdrop and read as a white
 * lozenge. The plane sits within ~12/255 of `c.bg`, so one target serves every site and there is no
 * per-caller backdrop to keep in step. Dark ignores the question — there the backdrop IS black,
 * which is what the multiply already lerps toward.
 *
 * A mark that loses its HUE on the way down is a different defect and takes a different fix: floor
 * the caller's own emphasis term (the tiles' `TileTune.ink`), never the target.
 *
 * The scratch is module-SCOPE, so this allocates nothing and is safe inside a frame body (rule 5,
 * noFrameAllocations): the ledger's lane tiles lerp per frame, while the ribbons and hyper's
 * tethers bake with it at event time. Presence carried by an OPACITY rather than a colour asks
 * the same question through `inkPresence` below.
 */
export function inkMix(out: THREE.Color, s: number, c: SceneColors): THREE.Color {
  if (!isLightGround(c)) return out.multiplyScalar(s);
  _ground.setHex(c.bg);
  out.r = _ground.r + (out.r - _ground.r) * s;
  out.g = _ground.g + (out.g - _ground.g) * s;
  out.b = _ground.b + (out.b - _ground.b) * s;
  return out;
}

/**
 * The ink-presence gamma. One number, tuned by looking at the chamber on paper (2026-08-21): low
 * enough to lift a resting band clear of the page, high enough that the focus boost still has
 * somewhere to go. See `inkPresence`.
 */
/** THE LIGHT-LOOK DIALS (the `?tune` "light look" group — tune.ts contract). Every field only
 *  reaches the LIGHT ground: the lane setter rewrites the light memo alone, the ground override
 *  keeps its dark face verbatim, and the Engine applies bloomMul/bloomFloor only while the theme
 *  is light. Defaults are the shipped look (2026-08-25's "extreme checkpoint", to be dialled in
 *  live); no test pins these — the dark look's pins live elsewhere and stay untouched. */
export interface LightTune {
  laneL: number; //   scene identity lane lightness (identity.ts consumes via setSceneLaneLight)
  laneC: number; //   scene identity lane chroma (chroma-reduction still caps per hue)
  groundL: number; // --scene-ground's light lightness (devTune writes the token override)
  inkGamma: number; // rest-presence curve: rest^gamma — lower = rest closer to full ink
  inkDimG: number; //  how hard a mark BELOW its resting weight drops (1 = proportional)
  inkLift: number; //  how much of the headroom above rest a focus claims
  bloomMul: number; // light bloom strength as a fraction of the view policy's
  bloomFloor: number; // minimum bloom threshold on light, so the ground never halos
  // The SELECTIVE bloom (scene/SceneContext.ts · BLOOM_LAYER). The whole-frame pass above cannot
  // select ink darker than its ground; these drive the layer that can. Read per frame, no callback.
  selBleed: number;  // how far the halo multiplies the ground toward the mark's own hue
  selGlow: number;   // the additive term beside it — light added at the mark's own core
  selRadius: number; // the halo's spread
  // The studio backdrop (scene/SceneContext.ts · paperBackdrop). Both are BAKED into a canvas at
  // event time, not read per frame — the "light look" group's onChange already ends in
  // refreshTheme(), which re-applies the background, so an edit rebuilds the texture for free.
  bgTint: number;  // how far the sweep settles into its cool hue — 1 is the shipped ramp, 0 grey
  bgGrid: number;  // the backdrop grid's peak ink — 0 is a plain lit wall, no grid drawn
}
export const LIGHT_TUNE_DEFAULTS: Readonly<LightTune> = Object.freeze({
  // Settled from the user's own EXPORT (2026-08-28, second round): with the inactive marks
  // thinned (inkDimG 1.1 → 1.35) the identity lane could come UP (laneL 0.51 → 0.61) —
  // brighter ink reads right once the de-emphasized field around it is genuinely thin.
  // ⚠️ laneL/laneC DERIVE from the palette's own SCENE_L_LIGHT/SCENE_C_LIGHT — one home
  // (src/palette/identity.ts, where the lane is actually baked at boot). Two literals drifted
  // once (found 2026-08-30: a fresh load baked the lane at a stale 0.70 and the shipped look
  // only appeared after a slider touch, which routes through setSceneLaneLight); deriving makes
  // boot and knob agree by construction. Bake a user's laneL/laneC export in identity.ts.
  laneL: SCENE_L_LIGHT, laneC: SCENE_C_LIGHT, groundL: 0.88, // groundL settled 0.72 → 0.78 → 0.80 → 0.81 → 0.88 across the wall iterations (user, 2026-08-29/30); keep globals.css --scene-ground AND devTune's override in sync
  inkGamma: 0.15, inkDimG: 1.35, inkLift: 0.6,
  // THE WHOLE-FRAME PASS IS OFF ON PAPER. It is a luminance highpass over the finished frame, and
  // on paper the marks are INK — darker than the ground they lie on — so no threshold selects them;
  // all it ever did was blow the one place light DID clear it (the lead bar, the ribbon foot) to
  // white. Engine's `bloom.enabled = _bloomMul > 0` skips the pass outright, so this is a look fix
  // and a full-res pass off the light path both. `bloomFloor` is inert while this is 0 — it shapes
  // that pass's threshold alone — and stays as the lever if the whole-frame look is ever wanted back.
  bloomMul: 0, bloomFloor: 0.5,
  // Raised from the 2026-08-28 settled 0.35/0.05/0.45: the rest-only chip calm and the
  // hubMatchBoost retirement (both 2026-08-30) fed this layer visibly less input, and the
  // resting halo starved — "we've lost the bloom effect, I'd still like a subtle bloom also in
  // light mode" (user, same day). The lift restores a resting glow WITHOUT the old fat tips:
  // the calm evened out the cap hotspots that used to concentrate the halo.
  // Re-balanced by the user live (2026-08-30, after the chip env landed): the bleed comes DOWN
  // (0.55 → 0.3) and the spread OUT — a wider, gentler halo now that the env sheen carries part
  // of the marks' presence on paper. Second export same day, alongside the quiet-tray glass:
  // glow UP (0.12 → 0.27) and spread further out (1 → 1.35) — with the trays' milky plates gone
  // the halo is the marks' main paper presence again, and it can afford more light. Fourth export
  // eased both a step back (bleed 0.3 → 0.2, glow 0.27 → 0.22) against the lighter 0.88 wall.
  // Fifth (same day, with the chamber's halo input lift landed): bleed back UP 0.2 → 0.35 — the
  // lift feeds the tint term real input from the snapshots, so the bleed now has ink to spend.
  selBleed: 0.35, selGlow: 0.22, selRadius: 1.35,
  // bgTint returned (0 → 0.5 → 1 across the user's exports, 2026-08-30): the ivory drift read
  // BROWN at the first shipped chroma and was zeroed the same day — re-picked at half and then
  // full strength as the quiet-tray glass, the brighter halo and the lighter wall (groundL 0.88)
  // changed what the tint sits over.
  bgTint: 1, bgGrid: 0.07,
});
export const LIGHT_TUNE: LightTune = { ...LIGHT_TUNE_DEFAULTS };
export const LIGHT_TUNE_SCHEMA: import("./tune").TuneSchema<LightTune> = {
  laneL: { min: 0.4, max: 0.85, step: 0.01, label: "lane L" },
  laneC: { min: 0.05, max: 0.3, step: 0.005, label: "lane C" },
  groundL: { min: 0.5, max: 0.95, step: 0.005, label: "ground L" },
  inkGamma: { min: 0.05, max: 1, step: 0.01, label: "ink gamma" },
  inkDimG: { min: 0.2, max: 2, step: 0.05, label: "ink dim curve" },
  inkLift: { min: 0.1, max: 4, step: 0.05, label: "ink focus lift" },
  bloomMul: { min: 0, max: 1.5, step: 0.05, label: "bloom ×" },
  bloomFloor: { min: 0.3, max: 1, step: 0.01, label: "bloom floor" },
  selBleed: { min: 0, max: 4, step: 0.05, label: "halo bleed" },
  selGlow: { min: 0, max: 2, step: 0.05, label: "halo glow" },
  selRadius: { min: 0.1, max: 1.5, step: 0.05, label: "halo spread" },
  bgTint: { min: 0, max: 2.5, step: 0.05, label: "backdrop tint" },
  bgGrid: { min: 0, max: 0.25, step: 0.005, label: "backdrop grid" },
};

/**
 * A mark's PRESENCE, translated for the ground it is painted on — the sibling of `inkMix` for the
 * sites where presence rides an OPACITY (the byte bar's bands, the glass planes' fill levels)
 * rather than a vertex colour.
 *
 * On the dark ground the resting levels ARE the look: a band at 0.12 opacity is a faint glow against
 * black and the bloom pass lifts the focused ones clear of it, so the whole emphasis span (roughly
 * 0.05 → 0.82) reads because the eye is measuring light added to nothing. Paint that same span as INK
 * on a 0.94-L page and the resting mark is 12% of a hue over white — a pastel, which is exactly the
 * wash this pass was opened to fix. ON PAPER, REST IS INK AND EMPHASIS IS WEIGHT.
 *
 * The translation is one order-preserving gamma: `s ** g` with g < 1 is strictly increasing and fixes
 * both 0 and 1, so it lifts the bunched-up bottom of the span into the page's usable ink range while
 * leaving the top where it is. dimTiers' pinned ORDER therefore survives untouched (the order is the
 * design, the numbers may move) and nothing that was invisible becomes visible. Dark returns `s`
 * unchanged — the dark look is byte-pinned.
 *
 * Apply it to the EMPHASIS term alone, never to the whole product. The factors a mark multiplies
 * afterwards — the horizon and front ramps, the furniture fade, the entry stagger — are geometry,
 * not weight, and gamma-stretching a ramp moves where a row appears to leave the chamber.
 *
 * ⚠️ THE CURVE IS RELATIVE TO THE MARK'S OWN RESTING WEIGHT, and that is what makes emphasis
 * survive it (user, 2026-08-26: *"the snapshot view has lost its focus color effect on the ribbons?
 * I hardly don't see any difference when filtering a metagraph"*). A bare `s ** 0.15` maps the
 * chamber's whole emphasis span onto 0.66 → 0.97 alpha — a 13.7× span compressed to 1.5×, measured
 * at ΔL* 5.3 on paper against 36.3 on dark — so the tiers were still ORDERED and no longer legible.
 * The gamma is not the mistake: it is the only reason a resting mark reads as ink at all, and the
 * vivid rest is the look. What was missing is that the gamma answers an ABSOLUTE opacity while
 * emphasis is a RATIO — and each instrument rests somewhere else (the bar's bands at 0.12, the
 * ribbons at 0.85), so no single absolute knee could serve them both. Pass `ref` — the resting base
 * `snapBright` was handed — and the curve pins that rest at exactly `ref ** gamma` (byte-identical
 * to before) and spends the rest of the range around it:
 *
 *   - BELOW rest the fall is proportional in the ratio (`inkDimG`), so an off-filter ribbon lands
 *     near half the resting ink instead of 95% of it. This is where the range lives on paper:
 *     **emphasis on a page is spent DOWNWARD.** Ink can only go to full ink, while the dark ground
 *     has emissive headroom plus a bloom pass above its resting glow. Focus here is expressed by
 *     what steps BACK, which is also why the boost side needs so little. It runs SUPER-proportional
 *     (> 1) for that reason (user, 2026-08-28: *"can you make the inactive ribbon and snapshots a
 *     bit more transparent"*): at 0.8 an inactive mark was held ABOVE its own ratio — a ribbon at
 *     half weight painted 57% of the resting ink — so the page's most crowded marks were the ones
 *     the filter had already answered. This branch is the ONE home for that, because `ref` is only
 *     ever passed by the three sites carrying a `snapBright` product (the ribbons, the byte bar's
 *     bands, the lane tiles) — exactly the marks a filter or a focus steps back, and nothing else.
 *   - ABOVE rest the lift saturates into whatever headroom is left (`inkLift`), so a boost still
 *     reads without the top two tiers collapsing onto full ink.
 *
 * Omitting `ref` defaults it to `s`, which is exactly the old `s ** gamma` — so every site whose
 * argument is a plain resting level (the seed, the ordinal labels, hyper's furniture) is unchanged
 * by construction, and only the three sites carrying a `snapBright` product pass one.
 *
 * Takes the ground as a BOOLEAN rather than the colours, so the per-frame call is plain arithmetic:
 * hoist `isLightGround(c)` into a field at event time (setColors), the same hoist rule the `?tune`
 * contract states for per-node loops.
 */
export function inkPresence(s: number, paper: boolean, ref = s): number {
  if (!paper || s <= 0 || s >= 1) return s;
  const restA = Math.pow(Math.min(ref, 1), LIGHT_TUNE.inkGamma);
  const r = ref > 0 ? s / ref : 1;
  if (r < 1) return restA * Math.pow(r, LIGHT_TUNE.inkDimG);
  // Saturating: contributes exactly 0 at r = 1, so the resting look is untouched by this branch.
  return restA + (1 - restA) * (1 - 1 / (1 + (r - 1) * LIGHT_TUNE.inkLift));
}

// Read the four structural tokens from globals.css. Called once by the Engine at construction.
export function readSceneColors(): SceneColors {
  return {
    core: readColorToken("--primary"),
    dagCore: readColorToken("--core"),
    bg: readColorToken("--scene-ground"), // the scene's OWN ground — silver in light, --background's dark verbatim in dark
    border: readColorToken("--border"),
    panel: readColorToken("--panel"),
    muted: readColorToken("--muted-foreground"),
    fg: readColorToken("--foreground"),
  };
}
