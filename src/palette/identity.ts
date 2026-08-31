// Identity-lane colour map: ONE deterministic source of a metagraph's identity hue, resolved for
// each medium (HUD flat-on-glass vs the 3D scene under emissive+bloom). Built on the palette
// generator; precedence = brand hue > config colour > hash fallback (CLAUDE.md "Two colour lanes").
import { METAGRAPHS } from "@/src/net/current";
import { COLORS } from "@/src/engine/config";
import { assignPalette, oklchToHex } from "./palette";
import { hexToOklch } from "./brand";
import brandHues from "@/data/brand-hues.json";
import type { Theme } from "@/src/theme/resolve";

// Bloom-tuned L/C for the 3D lane — higher chroma / lower L than the HUD so an emissive+bloomed
// node keeps a distinct hue instead of blowing out to white. Visually tuned in Task 3. DARK-theme
// values — byte-identical, pinned by identity.test.ts's "theme-lane constants" — every existing
// caller (identityHudHex, identitySceneHex's default) depends on these never moving.
export const SCENE_L = 0.68;
export const SCENE_C = 0.20;
// HUD lane L/C. Lower L + higher C than the original 0.80/0.15 (which read washed-out / pale on the
// dark glass) — closer to the scene's vividness while staying light enough to be legible as a small
// dot/chip on the panel surface. Tuned visually. DARK-theme values.
export const HUD_L = 0.74;
export const HUD_C = 0.19;
// Scene lane L/C for the LIGHT theme (Task 6, spec §5) — lower L than dark so an identity mark
// reads as INK on the page instead of blowing out. The chroma goes the OTHER way (2026-08-21,
// user: "the colors can still pop"): on black a hue is light ADDED, and the bloom does half the
// saturating for it; on paper the same hue is pigment laid on a bright ground, where the eye
// reads far less of it, so the light lane needs MORE chroma than dark to carry the same identity.
// Not every hue can pay for it — a request past its own gamut is chroma-reduced per hue, which is
// exactly the behaviour that lets one pair serve all of them. The HUD lane needs no light pair:
// identityHudCss() defers L/C to the CSS tokens (--ident-l/--ident-c), which already carry both
// themes' values, so the HUD retints for free with zero re-renders.
export const SCENE_L_LIGHT = 0.57; // NOT 0.68 — that is SCENE_L's dark value, and a shared L makes gamut-capped hues chroma-reduce to identical hexes in both lanes (identity.test.ts pins that the lanes differ). ⚠️ ONE HOME: LIGHT_TUNE_DEFAULTS.laneL derives from THIS constant — bake a user's laneL export HERE (found 2026-08-30: the pair drifted, so a fresh load baked the lane at the old 0.70 and the shipped look only appeared after a slider touch). Settled 0.70 → 0.61 → 0.57 across the user's exports (2026-08-28/30).
export const SCENE_C_LIGHT = 0.28; // one home likewise — LIGHT_TUNE_DEFAULTS.laneC derives from this (0.25 → 0.28, user export 2026-08-28)

export interface IdentityHue {
  id: string;
  hueDeg: number;
  hudHex: string;
  hudOklch: string;
  sceneHex: string;
}

const numToHex = (n: number) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");
const CORE_HEX = numToHex(COLORS.core);

// sRGB 0xRRGGBB → OKLCH hue degree [0,360). Delegates to brand.ts's hexToOklch (DRY — same
// sRGB→linear→OKLab pipeline, Björn Ottosson). Inverse direction of palette.ts's OKLab→sRGB pipeline.
export function hexToHueDeg(rgb: number): number {
  return hexToOklch(rgb).h;
}

const CONFIG = METAGRAPHS as { id: string; color: number }[];

let _pins: Record<string, number> | null = null;
export function configPins(): Record<string, number> {
  if (_pins) return _pins;
  const pins: Record<string, number> = {};
  // color: 0 is the "no seed" sentinel (dev-network catalog rows all carry it): skip, so
  // those metagraphs resolve through their baked brand pin or the hash fallback — 23 rows
  // sharing one seed would otherwise pin two whole networks to one hue. No mainnet row
  // carries 0 (DEFAULT_META_COLOR would NOT work as the sentinel — Common Crawl seeds it).
  for (const m of CONFIG) if (m.color !== 0) pins[m.id] = hexToHueDeg(m.color);
  _pins = Object.freeze(pins);
  return _pins;
}

// brand-hues.json shape: { [id: string]: { hueDeg: number; srcHex: string; source: string } } —
// baked by Task 3's extraction script. Empty ({}) until a bake runs, which keeps this whole
// overlay a no-op (identityPins() === configPins()).
let _brandPins: Record<string, number> | null = null;
export function brandPins(): Record<string, number> {
  if (_brandPins) return _brandPins;
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(brandHues as Record<string, { hueDeg: number }>)) out[id] = v.hueDeg;
  _brandPins = Object.freeze(out);
  return _brandPins;
}

// Config pins overlaid with baked brand pins — brand WINS when both define an id. This is the
// pin set every consumer should use; configPins() remains the fallback layer underneath it.
let _identityPins: Record<string, number> | null = null;
export function identityPins(): Record<string, number> {
  if (_identityPins) return _identityPins;
  _identityPins = Object.freeze({ ...configPins(), ...brandPins() });
  return _identityPins;
}

function toEntry(id: string, hueDeg: number): IdentityHue {
  return {
    id, hueDeg,
    hudHex: oklchToHex(HUD_L, HUD_C, hueDeg),
    hudOklch: `oklch(${HUD_L} ${HUD_C} ${hueDeg}deg)`,
    sceneHex: oklchToHex(SCENE_L, SCENE_C, hueDeg),
  };
}

export function identityMap(ids: string[]): Map<string, IdentityHue> {
  const palette = assignPalette(ids, identityPins());
  const out = new Map<string, IdentityHue>();
  for (const [id, e] of palette) out.set(id, toEntry(id, e.hueDeg));
  return out;
}

// Memoised map of the known config metagraphs (synchronous, no network).
let _known: Map<string, IdentityHue> | null = null;
function known(): Map<string, IdentityHue> {
  if (!_known) _known = identityMap(CONFIG.map((m) => m.id));
  return _known;
}

// Cache for ids resolved outside the known config set (an UNLISTED metagraph id, or "dag" — the
// DAG itself, which isn't in CONFIG) — without this, a repeated lookup for the same id would
// re-run assignPalette every time. Known ids stay on the `known()` memo above.
const _unknown = new Map<string, IdentityHue>();

// Resolve a single id. The DAG is itself a metagraph-shaped "core" (it has a logo, a site, its own
// validator nodes) and gets its own brand hue like any metagraph — resolved through identityPins()
// (brand-hues.json's "dag" entry, baked by scripts/bake-brand-hues.ts, wins; falls back to the hash
// tier if ever unbaked). The structural cyan used for the central core sphere / "All" filter comes
// from other paths (COLORS.core / filterAccent("all")), not from here — so this is safe. A known
// config metagraph hits the cache; an unknown id (incl. "dag") is resolved on the fly (de-collided
// against the pins) and memoised. A falsy id (a caller passed through an unset field) is not an
// error — it just falls back to core cyan below.
function resolve(id: string): IdentityHue | null {
  if (!id) return null;
  const knownHue = known().get(id);
  if (knownHue) return knownHue;
  const cached = _unknown.get(id);
  if (cached) return cached;
  const resolved = identityMap([...CONFIG.map((m) => m.id), id]).get(id) ?? null;
  if (resolved) _unknown.set(id, resolved);
  return resolved;
}

export function identityHudHex(id: string): string { return resolve(id)?.hudHex ?? CORE_HEX; }

// CSS-deferred HUD colour: the value never encodes L/C at all, so a theme switch retints every
// consumer for free (a CSS var write, zero React re-renders) instead of the resolve()-baked hex
// identityHudHex() returns. Every HUD caller that feeds a `style`/CSS custom property should use
// this over identityHudHex — see the identityHudHex holdout-grep migration in Task 6's report.
// Falsy id (resolve() returns null) falls back to the structural accent, not a baked hex, because
// there is no hue degree to defer at all.
export function identityHudCss(id: string): string {
  const r = resolve(id);
  if (!r) return "var(--primary)";
  return `oklch(var(--ident-l) var(--ident-c) ${r.hueDeg}deg)`;
}

// Cache for the LIGHT-theme scene hex, keyed by id, beside the existing dark-lane memo (known()'s
// entries + _unknown already carry the dark sceneHex baked in toEntry()). Kept separate rather than
// widening IdentityHue with a second sceneHex field, so the dark path stays byte-identical to what
// toEntry() has always produced.
const _sceneLight = new Map<string, string>();
// The LIVE light-lane L/C — the exported consts are the shipped defaults (what tests read); the
// `?tune` panel drives these through setSceneLaneLight so a dial edit rebuilds the light memo
// without touching the dark path.
let _laneL = SCENE_L_LIGHT;
let _laneC = SCENE_C_LIGHT;
export function setSceneLaneLight(l: number, c: number): void {
  _laneL = l;
  _laneC = c;
  _sceneLight.clear();
}
export function identitySceneHex(id: string, theme: Theme = "dark"): string {
  const r = resolve(id);
  if (theme === "dark") return r?.sceneHex ?? CORE_HEX;
  if (!r) return CORE_HEX;
  const cached = _sceneLight.get(id);
  if (cached) return cached;
  const hex = oklchToHex(_laneL, _laneC, r.hueDeg);
  _sceneLight.set(id, hex);
  return hex;
}
export function identityHudNumber(id: string): number { return parseInt(identityHudHex(id).slice(1), 16); }
export function identitySceneNumber(id: string): number { return parseInt(identitySceneHex(id).slice(1), 16); }
