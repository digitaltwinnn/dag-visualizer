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
});
