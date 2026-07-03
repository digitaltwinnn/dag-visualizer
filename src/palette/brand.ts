// Pure brand-colour helpers for the offline brand-hue bake (scripts/bake-brand-hues.ts). No jimp,
// no fetch here — those are the bake script's side-effectful shell around these tested functions.
import { ALLOWED } from "./palette";

// sRGB 0xRRGGBB → OKLCH {L, C, h(deg)}. Standard sRGB→linear→OKLab (Björn Ottosson).
export function hexToOklch(rgb: number): { L: number; C: number; h: number } {
  const srgb = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255].map((v) => v / 255);
  const lin = srgb.map((u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)));
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  const h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { L, C, h };
}

// A colour is unusable as a brand hue if it's near-white / near-black / desaturated (grey).
export function isNeutral(rgb: number): boolean {
  const { L, C } = hexToOklch(rgb);
  return C < 0.04 || L > 0.93 || L < 0.08;
}

// The brand colour = the most (weight × chroma) prominent NON-neutral candidate. null if none.
export function pickBrandColor(cands: { rgb: number; weight: number }[]): number | null {
  let best: number | null = null;
  let bestScore = 0;
  for (const c of cands) {
    if (isNeutral(c.rgb)) continue;
    const score = c.weight * hexToOklch(c.rgb).C;
    if (score > bestScore) { bestScore = score; best = c.rgb; }
  }
  return best;
}

const norm = (h: number) => ((h % 360) + 360) % 360;

// Shared allowed-zone test (hue is inside ANY of the palette's ALLOWED bands). Normalises the
// input hue; handles zones that wrap past 360 (e.g. [316,369)).
export function inAllowedZone(hueDeg: number): boolean {
  const h = norm(hueDeg);
  return ALLOWED.some(([lo, hi]) => { const H = h < lo && hi > 360 ? h + 360 : h; return H >= lo && H < hi; });
}

const hueDist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

// Keep an in-zone hue exactly; nudge a guard-band hue to the nearest allowed-zone edge.
export function snapToAllowedZone(hueDeg: number): number {
  const h = norm(hueDeg);
  if (inAllowedZone(h)) return h;
  const edges: number[] = [];
  for (const [lo, hi] of ALLOWED) { edges.push(norm(lo), norm(hi - 0.001)); }
  let best = edges[0], bestD = Infinity;
  for (const e of edges) { const d = hueDist(h, e); if (d < bestD) { bestD = d; best = e; } }
  return best;
}

// Minimum perceptual gap (deg) enforced between any two de-collided brand hues.
const MIN_GAP = 8;
// Outward search step when hunting for a free hue near a desired one.
const SEARCH_STEP = 2;
// Safety bound: allowed zones total well under 360°/SEARCH_STEP steps; this is generous.
const MAX_K = 400;

// Greedily de-collide a set of {id, hueDeg} entries: process in a DETERMINISTIC order (sorted by
// id) so re-bakes are stable. Each entry starts at its own desired hue; if that hue is within
// MIN_GAP of any hue already assigned to an earlier entry, search outward (desired ± k*SEARCH_STEP,
// increasing k) for the nearest candidate that is BOTH >= MIN_GAP from every assigned hue AND
// inside an allowed zone. If a zone fills up, the search naturally spills into the next allowed
// zone (rare, acceptable). Returns id -> final hue.
export function spreadColliding(entries: { id: string; hueDeg: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const assigned: number[] = [];

  const farEnough = (h: number) => assigned.every((a) => hueDist(h, a) >= MIN_GAP);

  for (const e of [...entries].sort((a, b) => a.id.localeCompare(b.id))) {
    const desired = norm(e.hueDeg);
    let chosen: number | null = null;

    if (inAllowedZone(desired) && farEnough(desired)) {
      chosen = desired;
    } else {
      for (let k = 1; k <= MAX_K && chosen === null; k++) {
        for (const dir of [1, -1]) {
          const cand = norm(desired + dir * k * SEARCH_STEP);
          if (inAllowedZone(cand) && farEnough(cand)) { chosen = cand; break; }
        }
      }
      // Fallback: should be unreachable given the allowed-zone capacity, but keep it total.
      if (chosen === null) chosen = snapToAllowedZone(desired);
    }

    assigned.push(chosen);
    out.set(e.id, chosen);
  }

  return out;
}

// Extract candidate colours (as 0xRRGGBB) from an SVG's fill/stroke/stop-color (attr + inline style
// + CSS), normalising #rgb/#rrggbb/rgb(). Skips none/transparent/currentColor.
export function parseSvgFills(svg: string): number[] {
  const out: number[] = [];
  const re = /(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))/g;
  let mch: RegExpExecArray | null;
  while ((mch = re.exec(svg))) {
    const tok = mch[1];
    let n: number | null = null;
    if (tok[0] === "#") {
      let hexs = tok.slice(1);
      if (hexs.length === 3) hexs = hexs.split("").map((c) => c + c).join("");
      if (hexs.length >= 6) n = parseInt(hexs.slice(0, 6), 16);
    } else {
      const [r, g, b] = tok.replace(/[^\d,]/g, "").split(",").map(Number);
      n = ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
    }
    if (n !== null && !out.includes(n)) out.push(n);
  }
  return out;
}
