import { describe, it, expect } from "vitest";
import { hexToOklch, isNeutral, pickBrandColor, snapToAllowedZone, parseSvgFills, spreadColliding, inAllowedZone } from "./brand";

describe("hexToOklch", () => {
  it("gives red a mid L, high C, ~29deg hue", () => {
    const { L: _L, C, h } = hexToOklch(0xff0000);
    expect(h).toBeGreaterThan(15); expect(h).toBeLessThan(45);
    expect(C).toBeGreaterThan(0.15);
  });
});
describe("isNeutral", () => {
  it("rejects white/black/grey, keeps a saturated colour", () => {
    expect(isNeutral(0xffffff)).toBe(true);
    expect(isNeutral(0x000000)).toBe(true);
    expect(isNeutral(0x808080)).toBe(true);
    expect(isNeutral(0xff5a3c)).toBe(false);
  });
});
describe("pickBrandColor", () => {
  it("picks the most weighted saturated colour, ignoring neutrals", () => {
    const cands = [
      { rgb: 0xffffff, weight: 500 }, // neutral, dropped
      { rgb: 0x2a9df4, weight: 40 },  // blue
      { rgb: 0x36e29a, weight: 10 },  // green, less weight
    ];
    expect(pickBrandColor(cands)).toBe(0x2a9df4);
  });
  it("returns null when every candidate is neutral", () => {
    expect(pickBrandColor([{ rgb: 0xeeeeee, weight: 9 }, { rgb: 0x111111, weight: 9 }])).toBe(null);
  });
});
describe("snapToAllowedZone", () => {
  it("keeps a hue already in an allowed zone unchanged", () => {
    expect(snapToAllowedZone(120)).toBe(120); // inside [106,149]
    expect(snapToAllowedZone(230)).toBe(230); // inside [211,249]
  });
  it("nudges a guard-band hue to the nearest allowed edge", () => {
    // red guard ~25: a ~20deg hue snaps up to the [41,74] zone's near edge
    const s = snapToAllowedZone(20);
    const inZone = (s >= 41 && s <= 74) || (s >= 316 || s <= 9);
    expect(inZone).toBe(true);
  });
});
describe("spreadColliding", () => {
  const MIN_GAP = 8;
  const hueDist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

  it("leaves non-colliding hues unchanged", () => {
    const entries = [
      { id: "a", hueDeg: 60 },   // [41,74]
      { id: "b", hueDeg: 120 },  // [106,149]
      { id: "c", hueDeg: 230 },  // [211,249]
    ];
    const out = spreadColliding(entries);
    expect(out.get("a")).toBe(60);
    expect(out.get("b")).toBe(120);
    expect(out.get("c")).toBe(230);
  });

  it("spreads N identical hues pairwise >= MIN_GAP apart, all still in an allowed zone", () => {
    const entries = [
      { id: "ded", hueDeg: 249 },
      { id: "usdc", hueDeg: 249 },
      { id: "cmc", hueDeg: 249 },
      { id: "tbc", hueDeg: 249 },
    ];
    const out = spreadColliding(entries);
    const hues = [...out.values()];
    expect(hues.length).toBe(4);
    expect(new Set(out.keys())).toEqual(new Set(["ded", "usdc", "cmc", "tbc"]));
    for (const h of hues) expect(inAllowedZone(h)).toBe(true);
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        expect(hueDist(hues[i], hues[j])).toBeGreaterThanOrEqual(MIN_GAP - 1e-6);
      }
    }
  });

  it("is deterministic regardless of input array order (sorts by id internally)", () => {
    const a = [
      { id: "ded", hueDeg: 249 },
      { id: "usdc", hueDeg: 249 },
      { id: "cmc", hueDeg: 249 },
      { id: "tbc", hueDeg: 249 },
    ];
    const b = [a[3], a[1], a[0], a[2]]; // shuffled order
    const outA = spreadColliding(a);
    const outB = spreadColliding(b);
    expect([...outA.entries()].sort()).toEqual([...outB.entries()].sort());
  });
});

describe("parseSvgFills", () => {
  it("extracts hex + rgb() colours, skips none/currentColor", () => {
    const svg = `<svg><path fill="#ff5a3c"/><rect style="fill:#123456"/><stop stop-color="rgb(0,128,255)"/><path fill="none"/><path fill="currentColor"/></svg>`;
    const got = parseSvgFills(svg);
    expect(got).toContain(0xff5a3c);
    expect(got).toContain(0x123456);
    expect(got).toContain(0x0080ff);
    expect(got.length).toBe(3);
  });
});
