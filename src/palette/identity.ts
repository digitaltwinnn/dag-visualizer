// Identity-lane colour map: ONE deterministic source of a metagraph's identity hue, resolved for
// each medium (HUD flat-on-glass vs the 3D scene under emissive+bloom). Built on the palette
// generator. See docs/superpowers/specs/2026-07-03-engine-token-bridge-design.md.
import { METAGRAPHS, COLORS } from "../../js/config.js";
import { assignPalette, oklchToHex } from "./palette";

// Bloom-tuned L/C for the 3D lane — higher chroma / lower L than the HUD so an emissive+bloomed
// node keeps a distinct hue instead of blowing out to white. Visually tuned in Task 3.
export const SCENE_L = 0.68;
export const SCENE_C = 0.20;
const HUD_L = 0.8;
const HUD_C = 0.15;

export interface IdentityHue {
  id: string;
  hueDeg: number;
  hudHex: string;
  hudOklch: string;
  sceneHex: string;
}

const numToHex = (n: number) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");
const CORE_HEX = numToHex(COLORS.core);

// sRGB 0xRRGGBB → OKLCH hue degree [0,360). Standard sRGB→linear→OKLab (Björn Ottosson), then the
// hue angle. Inverse direction of palette.ts's OKLab→sRGB pipeline.
export function hexToHueDeg(rgb: number): number {
  const srgb = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255].map((v) => v / 255);
  const lin = srgb.map((u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)));
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
}

const CONFIG = METAGRAPHS as { id: string; color: number }[];

let _pins: Record<string, number> | null = null;
export function configPins(): Record<string, number> {
  if (_pins) return _pins;
  _pins = {};
  for (const m of CONFIG) _pins[m.id] = hexToHueDeg(m.color);
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

// Resolve a single id. `dag` is structural cyan in both lanes. A known metagraph hits the cache;
// an unknown id is resolved on the fly (de-collided against the pins).
function resolve(id: string): IdentityHue | null {
  if (id === "dag") return { id, hueDeg: hexToHueDeg(COLORS.core), hudHex: CORE_HEX, hudOklch: "", sceneHex: CORE_HEX };
  return known().get(id) ?? identityMap([...CONFIG.map((m) => m.id), id]).get(id) ?? null;
}

export function identityHudHex(id: string): string { return resolve(id)?.hudHex ?? CORE_HEX; }
export function identitySceneHex(id: string): string { return resolve(id)?.sceneHex ?? CORE_HEX; }
export function identityHudNumber(id: string): number { return parseInt(identityHudHex(id).slice(1), 16); }
export function identitySceneNumber(id: string): number { return parseInt(identitySceneHex(id).slice(1), 16); }
