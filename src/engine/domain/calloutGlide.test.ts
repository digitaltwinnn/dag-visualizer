import { describe, it, expect } from "vitest";
import { CALLOUT_GLIDE_S, glideMix } from "./calloutGlide";

describe("glideMix — the callout's move to a new subject", () => {
  it("starts at the old anchor and lands on the new one at the glide's length", () => {
    expect(glideMix(0)).toBe(0);
    expect(glideMix(CALLOUT_GLIDE_S)).toBe(1);
    expect(glideMix(CALLOUT_GLIDE_S * 3)).toBe(1);
    expect(glideMix(-1)).toBe(0);
  });
  it("is halfway at half time and only ever moves forward", () => {
    expect(glideMix(CALLOUT_GLIDE_S / 2)).toBeCloseTo(0.5, 6);
    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const k = glideMix((CALLOUT_GLIDE_S * i) / 20);
      expect(k).toBeGreaterThanOrEqual(prev);
      prev = k;
    }
  });
  it("eases at both ends: slow to leave, slow to land", () => {
    const step = CALLOUT_GLIDE_S / 20;
    expect(glideMix(step)).toBeLessThan(0.05);
    expect(1 - glideMix(CALLOUT_GLIDE_S - step)).toBeLessThan(0.05);
  });
});
