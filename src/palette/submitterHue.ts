// Organisation identity hues (DED submitters): the network identity API's sibling. Ruling R14:
// organisations are only drawn beside DED and Dor, so a hue keeps MIN_HUE_GAP degrees from THOSE two
// networks' hues alone (the catalog's other hues leave only ~17 free degrees), inside the palette's
// allowed zones. The KNOWN (named) organisations are additionally spread ORG_HUE_GAP apart: slots
// packed along the clear runs (a hash-and-search greedy, brand.ts's spreadColliding pattern, left
// the zones too fragmented to seat seven) taken in hash order. Any other id takes its hashed hue
// from the clear set. Deterministic: the same ids give the same hues, in any input order.
import { oklchToHex } from "./palette";
import { inAllowedZone } from "./brand";
import { identityHueDeg, SCENE_L, SCENE_C, SCENE_L_LIGHT, SCENE_C_LIGHT } from "./identity";
import { DED_ID, DOR_ID } from "@/src/data/submitters";
import type { Theme } from "@/src/theme/resolve";

export const MIN_HUE_GAP = 18;
export const ORG_HUE_GAP = 24;

const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Whole degrees inside the allowed zones and MIN_HUE_GAP clear of DED's and Dor's hues. Hashing into
// this list (not hashing a hue and snapping) keeps ids spread: a guard-band hash would collapse
// onto a zone edge.
let _clear: number[] | null = null;
function clearHues(): number[] {
  if (_clear) return _clear;
  const nets = [DED_ID, DOR_ID].map(identityHueDeg).filter((h): h is number => h != null);
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
/** The named organisations' hues, pairwise at least ORG_HUE_GAP apart while the clear set holds
 *  that many slots (a crowd beyond it relaxes the gap a degree at a time, never fails). Ids take
 *  slots in hash order, so the assignment looks arbitrary but depends only on the set. Memoised. */
export function submitterHues(named: readonly string[]): Map<string, number> {
  const ids = [...new Set(named)].sort((a, b) => hash(a) - hash(b) || (a < b ? -1 : 1));
  const key = [...ids].sort().join(",");
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

export function submitterHue(id: string, named: readonly string[] = []): number {
  const spread = named.includes(id) ? submitterHues(named).get(id) : undefined;
  if (spread !== undefined) return spread;
  const list = clearHues();
  return list[hash(id) % list.length];
}

/** Theme-deferred HUD colour, identityHudCss's form. */
export function submitterHudCss(id: string, named: readonly string[] = []): string {
  return `oklch(var(--ident-l) var(--ident-c) ${submitterHue(id, named)}deg)`;
}

const _scene = new Map<string, string>();
export function submitterSceneHex(id: string, named: readonly string[] = [], theme: Theme = "dark"): string {
  const h = submitterHue(id, named);
  const key = `${theme}:${h}`;
  const hit = _scene.get(key);
  if (hit) return hit;
  const hex = theme === "dark" ? oklchToHex(SCENE_L, SCENE_C, h) : oklchToHex(SCENE_L_LIGHT, SCENE_C_LIGHT, h);
  _scene.set(key, hex);
  return hex;
}
