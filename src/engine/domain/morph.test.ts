import { describe, it, expect } from "vitest";
import { discWeight, surfFade, extrasFade, hubFade, coreGrow, coreReveal, R_GLOBE, CORE_R } from "./morph";

// Each scalar is a one-liner lifted verbatim (with its comment) from js/globe.js /
// HyperFurniture.ts — these tests pin the exact endpoint values of each ease window.

describe("discWeight", () => {
  // js/globe.js:859 — smooth(clamp((m-0.82)/0.16, 0, 1))
  it("is 0 before the window starts (m=0)", () => {
    expect(discWeight(0)).toBe(0);
  });
  it("is 1 at m=1 (window closed)", () => {
    expect(discWeight(1)).toBe(1);
  });
  it("is 0 exactly at the window start (m=0.82)", () => {
    expect(discWeight(0.82)).toBe(0);
  });
});

describe("surfFade", () => {
  // js/globe.js:936 — smooth(clamp((m-0.35)/0.45, 0, 1))
  it("is 0 at the window start (m=0.35)", () => {
    expect(surfFade(0.35)).toBe(0);
  });
  it("is 1 at the window end (m=0.8)", () => {
    expect(surfFade(0.8)).toBe(1);
  });
  it("is 0 before the window (m=0)", () => {
    expect(surfFade(0)).toBe(0);
  });
});

describe("extrasFade", () => {
  // js/globe.js:937 — smooth(clamp((m-0.6)/0.4, 0, 1))
  it("is 0 at the window start (m=0.6)", () => {
    expect(extrasFade(0.6)).toBe(0);
  });
  it("is 1 at m=1", () => {
    expect(extrasFade(1)).toBe(1);
  });
});

describe("hubFade", () => {
  // HyperFurniture.ts update() — clamp(1 - morph/0.3, 0, 1)
  it("is 1 at m=0 (hubs fully lit)", () => {
    expect(hubFade(0)).toBe(1);
  });
  it("is 0 at m=0.3 (hubs fully gone)", () => {
    expect(hubFade(0.3)).toBe(0);
  });
  it("stays clamped at 0 beyond the window (m=1)", () => {
    expect(hubFade(1)).toBe(0);
  });
});

describe("coreGrow", () => {
  // HyperFurniture.ts update() — lerp(1, R_GLOBE/CORE_R, clamp(morph/0.5, 0, 1))
  it("is 1 at m=0 (core at its native radius)", () => {
    expect(coreGrow(0)).toBe(1);
  });
  it("reaches the full R_GLOBE/CORE_R ratio at m=0.5", () => {
    expect(coreGrow(0.5)).toBeCloseTo(R_GLOBE / CORE_R, 10);
  });
  it("stays clamped at the ratio beyond the window (m=1)", () => {
    expect(coreGrow(1)).toBeCloseTo(R_GLOBE / CORE_R, 10);
  });
});

describe("coreReveal", () => {
  // HyperFurniture.ts update() — 1 - clamp((morph-0.3)/0.35, 0, 1); window 0.3..0.65
  it("is 1 up to m=0.3", () => {
    expect(coreReveal(0)).toBe(1);
    expect(coreReveal(0.3)).toBe(1);
  });
  it("is 0 at m=0.65 (fully dissolved)", () => {
    expect(coreReveal(0.65)).toBe(0);
  });
  it("stays clamped at 0 beyond the window (m=1)", () => {
    expect(coreReveal(1)).toBe(0);
  });
});
