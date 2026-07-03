// Identity-lane colour map: ONE deterministic source of a metagraph's identity hue, resolved for
// each medium (HUD flat-on-glass vs the 3D scene under emissive+bloom). Built on the palette
// generator. See docs/superpowers/specs/2026-07-03-engine-token-bridge-design.md.
import { METAGRAPHS, COLORS } from "../../js/config.js";
import { assignPalette, oklchToHex } from "./palette";
import { hexToOklch } from "./brand";

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

function toEntry(id: string, hueDeg: number): IdentityHue {
  return {
    id, hueDeg,
    hudHex: oklchToHex(HUD_L, HUD_C, hueDeg),
    hudOklch: `oklch(${HUD_L} ${HUD_C} ${hueDeg}deg)`,
    sceneHex: oklchToHex(SCENE_L, SCENE_C, hueDeg),
  };
}

export function identityMap(ids: string[]): Map<string, IdentityHue> {
  const palette = assignPalette(ids, configPins());
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

// Cache for ids resolved outside the known config set (an UNLISTED metagraph id) — without this,
// a repeated lookup for the same unlisted id would re-run assignPalette every time. Known ids stay
// on the `known()` memo above; `dag` is a constant below. Only this unknown-id branch is cached.
const _unknown = new Map<string, IdentityHue>();

// Resolve a single id. `dag` is structural cyan in both lanes. A known metagraph hits the cache;
// an unknown id is resolved on the fly (de-collided against the pins) and memoised. A falsy id (a
// caller passed through an unset field) is not an error — it just falls back to core cyan below.
function resolve(id: string): IdentityHue | null {
  if (!id) return null;
  if (id === "dag") return { id, hueDeg: hexToHueDeg(COLORS.core), hudHex: CORE_HEX, hudOklch: "", sceneHex: CORE_HEX };
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
