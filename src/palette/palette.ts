// Identity-lane colour generator. Pure, deterministic: assigns each metagraph a
// non-colliding hue inside the palette's allowed zones (see CLAUDE.md "Two colour lanes").
// Ships the hash-fallback tier + manual pins; brand extraction feeds in behind this same
// signature (an internal candidate source), no call-site change.

export const IDENTITY_L = 0.8;
export const IDENTITY_C = 0.15;

export interface PaletteEntry {
  id: string;
  hueDeg: number;
  oklch: string;
  hex: string;
}

// The reserved structural hue centres, ±16° each — PER NETWORK (multi-network design §2).
// Five are guarded on EVERY network (red warn 25 · amber 90 · green ready 165 · --core blue
// 265 · violet 300); the sixth is the network's OWN accent — cyan 195 on mainnet, violet 300
// on integrationnet (already in the base five, so its guard list is just shorter), magenta
// 327 on testnet. ACCENT_HUE mirrors the --net-* tokens in app/globals.css: this module is
// Node-safe and cannot read CSS, so keep the two in sync by hand.
import { NET } from "@/src/net/current";
import type { NetworkId } from "@/src/engine/config";

const GUARD = 16;
const BASE_GUARDS = [25, 90, 165, 265, 300];
export const ACCENT_HUE: Record<NetworkId, number> = { mainnet: 195, integrationnet: 300, testnet: 327 };
export const SLOT_STEP = 8;

export function guardsFor(net: NetworkId): number[] {
  return [...new Set([...BASE_GUARDS, ACCENT_HUE[net]])].sort((a, b) => a - b);
}

// The allowed identity ranges are DERIVED: the gaps between consecutive guard bands (the
// last one wrapping past 360; normalised on read), dropping any gap narrower than one slot
// step. Derived-for-mainnet is pinned equal to the historical literal by palette.test.ts —
// [[41,74],[106,149],[211,249],[316,369]] — so mainnet's hue assignments are byte-identical
// to the single-network app (the 41–149 band split by the amber guard included).
export function allowedFor(net: NetworkId): [number, number][] {
  const g = guardsFor(net);
  const out: [number, number][] = [];
  for (let i = 0; i < g.length; i++) {
    const a = g[i] + GUARD;
    const b = (i === g.length - 1 ? g[0] + 360 : g[i + 1]) - GUARD;
    if (b - a >= SLOT_STEP) out.push([a, b]);
  }
  return out;
}
export const ALLOWED: [number, number][] = allowedFor(NET);

// Discrete slots stepped ~8° through the allowed zones (~20 distinct at fixed L/C).
function slotsOf(allowed: [number, number][]): number[] {
  const out: number[] = [];
  for (const [lo, hi] of allowed) {
    for (let h = lo; h < hi; h += SLOT_STEP) out.push(((h % 360) + 360) % 360);
  }
  return out;
}
const DEFAULT_SLOTS: number[] = slotsOf(ALLOWED);

// FNV-1a 32-bit — stable hash of a metagraph id.
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function entry(id: string, hueDeg: number): PaletteEntry {
  return {
    id,
    hueDeg,
    oklch: `oklch(${IDENTITY_L} ${IDENTITY_C} ${hueDeg}deg)`,
    hex: oklchToHex(IDENTITY_L, IDENTITY_C, hueDeg),
  };
}

// Deterministic assignment: process ids in a stable order (by id), each takes its
// hashed slot, or linear-probes to the next free slot (de-collision). Pins win outright.
// The optional `allowed` parameter exists for the SERVER: app/api/metagraphs/route.ts runs
// where NET is always mainnet, so it passes the REQUEST's ranges (allowedFor(net)) — or the
// server and the client would assign different hues to the same unpinned dev-network id.
export function assignPalette(
  ids: string[],
  pins: Record<string, number> = {},
  allowed: [number, number][] = ALLOWED,
): Map<string, PaletteEntry> {
  const SLOTS = allowed === ALLOWED ? DEFAULT_SLOTS : slotsOf(allowed);
  const out = new Map<string, PaletteEntry>();
  const taken = new Set<number>();

  for (const id of ids) {
    if (id in pins) taken.add(pins[id]); // reserve pinned hues so probing avoids them
  }

  for (const id of [...ids].sort()) {
    if (id in pins) {
      out.set(id, entry(id, pins[id]));
      continue;
    }
    const start = hash32(id) % SLOTS.length;
    let slotHue = SLOTS[start];
    for (let i = 0; i < SLOTS.length; i++) {
      const cand = SLOTS[(start + i) % SLOTS.length];
      if (!taken.has(cand)) {
        slotHue = cand;
        break;
      }
    }
    taken.add(slotHue);
    out.set(id, entry(id, slotHue));
  }
  return out;
}

// OKLab → linear sRGB, before gamma. Shared by the gamut test + the final conversion.
function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, bl];
}

const IN_GAMUT_EPS = 1e-7;
function inSrgbGamut(rgb: [number, number, number]): boolean {
  return rgb.every((u) => u >= -IN_GAMUT_EPS && u <= 1 + IN_GAMUT_EPS);
}

// OKLCH → sRGB hex. Standard OKLab → linear sRGB → gamma pipeline (Björn Ottosson).
// Out-of-gamut hues are handled by CHROMA-REDUCTION gamut mapping (CSS Color 4 style):
// L and hue are held fixed and C is stepped down until the linear-sRGB triple fits
// [0,1], THEN gamma+hex is applied. Hard-clamping the final channels instead would
// shift the perceived hue, so the returned hex would visually disagree with how the
// browser renders the matching `oklch(L C h)` CSS string (browsers gamut-map too).
export function oklchToHex(L: number, C: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const cosH = Math.cos(h);
  const sinH = Math.sin(h);

  let c = C;
  let rgb = oklabToLinearSrgb(L, c * cosH, c * sinH);
  if (!inSrgbGamut(rgb)) {
    const STEP = 0.005;
    // Coarse step down until in-gamut (or we hit 0 chroma, i.e. grey — always in-gamut).
    while (c > 0 && !inSrgbGamut(rgb)) {
      c = Math.max(0, c - STEP);
      rgb = oklabToLinearSrgb(L, c * cosH, c * sinH);
    }
    // Binary-search refine between [c, c+STEP] so we don't over-desaturate.
    let lo = c;
    let hi = Math.min(C, c + STEP);
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const trial = oklabToLinearSrgb(L, mid * cosH, mid * sinH);
      if (inSrgbGamut(trial)) {
        lo = mid;
        rgb = trial;
      } else {
        hi = mid;
      }
    }
    c = lo;
  }

  const [r, g, bl] = rgb;
  const gamma = (u: number) =>
    u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;
  const ch = (u: number) => {
    const v = Math.round(Math.min(1, Math.max(0, gamma(u))) * 255);
    return v.toString(16).padStart(2, "0");
  };
  return `#${ch(r)}${ch(g)}${ch(bl)}`;
}
