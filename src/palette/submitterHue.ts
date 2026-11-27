// Organisation identity hues (DED submitters): the network identity API's sibling. An id hashes
// into the palette's allowed-zone hues that sit at least MIN_HUE_GAP degrees from every network
// hue, so an organisation never reads as a network. Deterministic: the same id is the same hue
// everywhere, every session.
import { oklchToHex } from "./palette";
import { inAllowedZone, snapToAllowedZone } from "./brand";
import { networkHueDegs, SCENE_L, SCENE_C, SCENE_L_LIGHT, SCENE_C_LIGHT } from "./identity";
import type { Theme } from "@/src/theme/resolve";

export const MIN_HUE_GAP = 18;

const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// The hues an organisation may take: every whole degree inside the palette's allowed zones and
// at least MIN_HUE_GAP from every network hue. Hashing into this list (rather than hashing a hue
// and snapping it) keeps ids spread: a guard-band hash would otherwise collapse onto a zone edge.
let _clear: number[] | null = null;
function clearHues(): number[] {
  if (_clear) return _clear;
  const nets = networkHueDegs();
  const out: number[] = [];
  for (let h = 0; h < 360; h++) {
    if (inAllowedZone(h) && nets.every((n) => dist(h, n) >= MIN_HUE_GAP)) out.push(h);
  }
  // Never empty in practice; if the catalog ever fills the zones, fall back to the nearest allowed hue.
  _clear = out.length ? out : [snapToAllowedZone(0)];
  return _clear;
}

const _hue = new Map<string, number>();
export function submitterHue(id: string): number {
  const hit = _hue.get(id);
  if (hit !== undefined) return hit;
  const list = clearHues();
  const out = list[hash(id) % list.length];
  _hue.set(id, out);
  return out;
}

/** Theme-deferred HUD colour, identityHudCss's form. */
export function submitterHudCss(id: string): string {
  return `oklch(var(--ident-l) var(--ident-c) ${submitterHue(id)}deg)`;
}

const _scene = new Map<string, string>();
export function submitterSceneHex(id: string, theme: Theme = "dark"): string {
  const key = `${theme}:${id}`;
  const hit = _scene.get(key);
  if (hit) return hit;
  const h = submitterHue(id);
  const hex = theme === "dark" ? oklchToHex(SCENE_L, SCENE_C, h) : oklchToHex(SCENE_L_LIGHT, SCENE_C_LIGHT, h);
  _scene.set(key, hex);
  return hex;
}
