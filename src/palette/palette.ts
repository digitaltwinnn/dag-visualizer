// Identity-lane colour generator. Pure, deterministic. See
// docs/superpowers/specs/2026-07-01-identity-hue-generator-design.md.
// Phase 1 ships the hash-fallback tier + manual pins; brand extraction slots in
// later behind this same signature (an internal candidate source), no call-site change.

export const IDENTITY_L = 0.8;
export const IDENTITY_C = 0.15;

export interface PaletteEntry {
  id: string;
  hueDeg: number;
  oklch: string;
  hex: string;
}

// Allowed hue zones (deg): the gaps between the reserved structural guard-bands
// (red 25 · amber 90 · green 165 · cyan 195 · blue 265 · violet 300, ±16°).
// The 41–149 band is split by the amber guard into 41–74 and 106–149.
const ALLOWED: [number, number][] = [
  [41, 74],
  [106, 149],
  [211, 249],
  [316, 369], // wraps past 360; normalised on read
];

// Discrete slots stepped ~8° through the allowed zones (~20 distinct at fixed L/C).
const SLOT_STEP = 8;
const SLOTS: number[] = (() => {
  const out: number[] = [];
  for (const [lo, hi] of ALLOWED) {
    for (let h = lo; h < hi; h += SLOT_STEP) out.push(((h % 360) + 360) % 360);
  }
  return out;
})();

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
export function assignPalette(
  ids: string[],
  pins: Record<string, number> = {},
): Map<string, PaletteEntry> {
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
