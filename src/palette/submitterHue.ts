// Organisation identity hues (DED submitters): the network identity API's sibling. Ruling R14:
// organisations are only drawn beside DED and Dor, so a hue keeps MIN_HUE_GAP degrees from THOSE two
// networks' hues alone (the catalog's other hues leave only ~17 free degrees), inside the palette's
// allowed zones; R17 adds the chamber's structural core cyan (COLORS.core, the trail's neutral) to
// the hues kept clear, so an organisation band never reads as the trail. Ruling R15: only a PALETTE of the busiest organisations (the read route's
// `palette`, up to seven, busiest of all time first) carries a hue; the zones seat seven at
// ORG_HUE_GAP apart, packed along the clear runs and assigned by palette ORDER, so the busiest
// takes the first slot and the assignment is stable while the ranking holds. Every other
// organisation has no hue (null) and reads neutral. Deterministic.
import { oklchToHex } from "./palette";
import { inAllowedZone } from "./brand";
import { COLORS } from "@/src/engine/config";
import { hexToHueDeg, identityHueDeg, SCENE_L, SCENE_C, SCENE_L_LIGHT, SCENE_C_LIGHT } from "./identity";
import { UNLISTED_SCENE_HEX_BY_THEME } from "@/src/data/unlisted";
import { DED_ID, DOR_ID } from "@/src/data/submitters";
import type { Theme } from "@/src/theme/resolve";

export const MIN_HUE_GAP = 18;
export const ORG_HUE_GAP = 24;

const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

// Whole degrees inside the allowed zones and MIN_HUE_GAP clear of DED's and Dor's hues. Hashing into
// this list (not hashing a hue and snapping) keeps ids spread: a guard-band hash would collapse
// onto a zone edge.
let _clear: number[] | null = null;
function clearHues(): number[] {
  if (_clear) return _clear;
  const nets = [DED_ID, DOR_ID].map(identityHueDeg).filter((h): h is number => h != null);
  nets.push(hexToHueDeg(COLORS.core));
  const out: number[] = [];
  for (let h = 0; h < 360; h++) {
    if (inAllowedZone(h) && nets.every((n) => dist(h, n) >= MIN_HUE_GAP)) out.push(h);
  }
  _clear = out;
  return out;
}

// The clear set as contiguous runs [start, length-1], the run across 359/0 merged (so a run may
// end past 360; reads wrap).
function clearRuns(): { start: number; span: number }[] {
  const set = new Set(clearHues());
  const runs: { start: number; span: number }[] = [];
  for (let h = 0; h < 360; h++) {
    if (!set.has(h) || set.has((h + 359) % 360)) continue;
    let span = 0;
    while (set.has((h + span + 1) % 360) && span < 359) span++;
    runs.push({ start: h, span });
  }
  return runs;
}

// Slots at `gap` degrees along every run, packed from each run's start: packing is what lets seven
// organisations fit zones that a hash-and-search greedy leaves too fragmented for.
function slots(gap: number): number[] {
  const out: number[] = [];
  for (const r of clearRuns()) for (let d = 0; d <= r.span; d += gap) out.push((r.start + d) % 360);
  return out;
}

const _spread = new Map<string, Map<string, number>>();
/** The palette's hues in palette order, pairwise at least ORG_HUE_GAP apart while the clear set
 *  holds that many slots (a longer palette relaxes the gap a degree at a time, never fails).
 *  Memoised per palette. */
export function submitterHues(palette: readonly string[]): Map<string, number> {
  const ids = [...new Set(palette)];
  const key = ids.join(",");
  const hit = _spread.get(key);
  if (hit) return hit;
  const out = new Map<string, number>();
  if (ids.length) {
    let gap = ORG_HUE_GAP, list = slots(gap);
    while (list.length < ids.length && gap > 1) list = slots(--gap);
    // Evenly spaced picks keep the chosen slots at least `gap` apart even when slots outnumber ids.
    ids.forEach((id, i) => out.set(id, list[Math.floor((i * list.length) / ids.length)]));
  }
  _spread.set(key, out);
  return out;
}

/** The organisation's hue, or null when it is outside the palette (it reads neutral). */
export function submitterHue(id: string, palette: readonly string[]): number | null {
  return submitterHues(palette).get(id) ?? null;
}

/** Theme-deferred HUD colour, identityHudCss's form; the muted ink outside the palette. */
export function submitterHudCss(id: string, palette: readonly string[]): string {
  const h = submitterHue(id, palette);
  return h === null ? "var(--muted-foreground)" : `oklch(var(--ident-l) var(--ident-c) ${h}deg)`;
}

const _scene = new Map<string, string>();
const hex6 = (n: number) => "#" + n.toString(16).padStart(6, "0");
/** The scene colour; the chamber's neutral (the unlisted network's) outside the palette. */
export function submitterSceneHex(id: string, palette: readonly string[], theme: Theme = "dark"): string {
  const h = submitterHue(id, palette);
  if (h === null) return hex6(UNLISTED_SCENE_HEX_BY_THEME[theme]);
  const key = `${theme}:${h}`;
  const hit = _scene.get(key);
  if (hit) return hit;
  const hex = theme === "dark" ? oklchToHex(SCENE_L, SCENE_C, h) : oklchToHex(SCENE_L_LIGHT, SCENE_C_LIGHT, h);
  _scene.set(key, hex);
  return hex;
}
