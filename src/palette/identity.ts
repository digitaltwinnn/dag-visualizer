// Identity-lane colour map: ONE deterministic source of a metagraph's identity hue, resolved for
// each medium (HUD flat-on-glass vs the 3D scene under emissive+bloom). Built on the palette
// generator; precedence = brand hue > config colour > hash fallback (CLAUDE.md "Two colour lanes").
import { METAGRAPHS, COLORS } from "../../js/config.js";
import { assignPalette, oklchToHex } from "./palette";
import { hexToOklch } from "./brand";
import brandHues from "@/data/brand-hues.json";

// Bloom-tuned L/C for the 3D lane — higher chroma / lower L than the HUD so an emissive+bloomed
// node keeps a distinct hue instead of blowing out to white. Visually tuned in Task 3.
export const SCENE_L = 0.68;
export const SCENE_C = 0.20;
// HUD lane L/C. Lower L + higher C than the original 0.80/0.15 (which read washed-out / pale on the
// dark glass) — closer to the scene's vividness while staying light enough to be legible as a small
// dot/chip on the panel surface. Tuned visually.
export const HUD_L = 0.74;
export const HUD_C = 0.19;

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
  for (const m of CONFIG) pins[m.id] = hexToHueDeg(m.color);
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
export function identitySceneHex(id: string): string { return resolve(id)?.sceneHex ?? CORE_HEX; }
export function identityHudNumber(id: string): number { return parseInt(identityHudHex(id).slice(1), 16); }
export function identitySceneNumber(id: string): number { return parseInt(identitySceneHex(id).slice(1), 16); }
