import { describe, it, expect } from "vitest";
import { assignPalette, oklchToHex, IDENTITY_L, IDENTITY_C } from "./palette";

// The reserved structural hue centres and the ±16° guard band (spec).
const RESERVED = [25, 90, 165, 195, 265, 300];
const GUARD = 16;
function inGuardBand(h: number): boolean {
  return RESERVED.some((r) => {
    const d = Math.abs(((h - r + 180 + 360) % 360) - 180);
    return d < GUARD;
  });
}

const IDS = [
  "DAG0eQr94qUQSUhmYGNXt6CoBKWu5K6htvRMGC6M",
  "DAG7X5idd4aLfp4XC6WQdG1eDfR3LGPVEwtUUB2W",
  "DAG0S16WDgdAvh8VvroR6MWLdjmHYdzAF5S181xh",
  "DAG7Ghth1WhWK83SB3MtXnnHYZbCsmiRTwJrgaW1",
  "DAG06z64ifT2HzXoHfMexRfrcnpYFEwMqjFiPKze",
];

describe("assignPalette", () => {
  it("keeps every hue out of the reserved guard bands", () => {
    for (const e of assignPalette(IDS).values()) {
      expect(inGuardBand(e.hueDeg), `hue ${e.hueDeg} for ${e.id}`).toBe(false);
    }
  });

  it("is deterministic and order-independent", () => {
    const a = assignPalette(IDS);
    const b = assignPalette([...IDS].reverse());
    for (const id of IDS) {
      expect(b.get(id)!.hueDeg).toBe(a.get(id)!.hueDeg);
    }
  });

  it("gives distinct ids distinct hues (no collisions within budget)", () => {
    const hues = [...assignPalette(IDS).values()].map((e) => e.hueDeg);
    expect(new Set(hues).size).toBe(IDS.length);
  });

  it("honours a manual pin exactly", () => {
    const pinned = assignPalette(IDS, { [IDS[0]]: 220 });
    expect(pinned.get(IDS[0])!.hueDeg).toBe(220);
  });

  it("renders glow-tuned L/C in the oklch string", () => {
    const e = [...assignPalette(IDS).values()][0];
    expect(e.oklch).toBe(`oklch(${IDENTITY_L} ${IDENTITY_C} ${e.hueDeg}deg)`);
  });
});

describe("oklchToHex", () => {
  it("returns a 7-char #hex", () => {
    expect(oklchToHex(0.8, 0.15, 120)).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("maps distinct hues to distinct colours", () => {
    expect(oklchToHex(0.8, 0.15, 40)).not.toBe(oklchToHex(0.8, 0.15, 220));
  });

  // Inverse sRGB(#hex) → OKLCH hue, used only to verify oklchToHex doesn't shift hue
  // when it gamut-maps. Independent re-implementation (linear-sRGB → LMS → OKLab →
  // hue) so it doesn't share bugs with the module under test.
  function srgbHexToOklchHue(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    const r8 = (n >> 16) & 255;
    const g8 = (n >> 8) & 255;
    const b8 = n & 255;
    const inv = (u: number) => {
      u /= 255;
      return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
    };
    const r = inv(r8);
    const g = inv(g8);
    const b = inv(b8);

    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);

    const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
    const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

    let hue = (Math.atan2(bb, a) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    return hue;
  }

  function hueDelta(a: number, b: number): number {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  // Representative hues spanning the out-of-gamut zones at the fixed identity
  // L=0.80/C=0.15 (oranges ~41-65, blues ~211-243, reds ~348-4). Hard channel-
  // clamping shifts these hues by tens of degrees; gamut-mapping (reduce C, keep
  // L/hue) must not.
  it.each([45, 65, 219, 243, 348, 4])(
    "preserves hue %d° when gamut-mapping out-of-gamut chroma",
    (hueDeg) => {
      const hex = oklchToHex(IDENTITY_L, IDENTITY_C, hueDeg);
      const back = srgbHexToOklchHue(hex);
      expect(hueDelta(back, hueDeg)).toBeLessThan(4);
    },
  );
});
