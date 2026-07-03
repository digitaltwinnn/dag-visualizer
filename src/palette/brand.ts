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
const inZone = (h: number) => ALLOWED.some(([lo, hi]) => { const H = h < lo && hi > 360 ? h + 360 : h; return H >= lo && H < hi; });

// Keep an in-zone hue exactly; nudge a guard-band hue to the nearest allowed-zone edge.
export function snapToAllowedZone(hueDeg: number): number {
  const h = norm(hueDeg);
  if (inZone(h)) return h;
  const edges: number[] = [];
  for (const [lo, hi] of ALLOWED) { edges.push(norm(lo), norm(hi - 0.001)); }
  const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  let best = edges[0], bestD = Infinity;
  for (const e of edges) { const d = dist(h, e); if (d < bestD) { bestD = d; best = e; } }
  return best;
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
