import { describe, it, expect } from "vitest";
import {
  dimScale,
  dimTargetsFor,
  validatorDim,
  metaNodeDim,
  nodeEmissive,
  metaNodeEmissive,
  type DimContext,
  type DimState,
} from "./dimModel";

const ctx = (overrides: Partial<DimContext> = {}): DimContext => ({
  morph: 0,
  hoverFilterActive: false,
  ledger: false,
  countryFilter: null,
  countryMix: 0,
  hoverNodeId: null,
  selectedNodeId: null,
  filter: "all",
  ...overrides,
});

describe("dimScale", () => {
  // js/globe.js:830-833 verbatim
  it("is the hyper floor 0.32 at morph=0", () => {
    expect(dimScale(ctx({ morph: 0 }))).toBeCloseTo(0.32, 10);
  });

  it("ramps linearly to the geo ceiling 1.0 at morph=1", () => {
    expect(dimScale(ctx({ morph: 1 }))).toBeCloseTo(1.0, 10);
  });

  it("is 0.32 + 0.68*morph at a midpoint", () => {
    expect(dimScale(ctx({ morph: 0.5 }))).toBeCloseTo(0.32 + 0.68 * 0.5, 10);
  });

  it("hover-preview forces a strong 0.85 regardless of morph", () => {
    expect(dimScale(ctx({ hoverFilterActive: true, morph: 0 }))).toBe(0.85);
    expect(dimScale(ctx({ hoverFilterActive: true, morph: 1 }))).toBe(0.85);
  });
});

describe("dimTargetsFor", () => {
  // js/globe.js:665-670 (_applyDim) verbatim
  it("lights the dag (0) and every metagraph (0) when sel='all'", () => {
    const t = dimTargetsFor("all", ["dor", "ded"]);
    expect(t.dag).toBe(0);
    expect(t.meta.get("dor")).toBe(0);
    expect(t.meta.get("ded")).toBe(0);
  });

  it("lights the dag (0) and dims every metagraph (1) when sel='dag'", () => {
    const t = dimTargetsFor("dag", ["dor"]);
    expect(t.dag).toBe(0);
    expect(t.meta.get("dor")).toBe(1);
  });

  it("dims the dag (1) and lights only the selected metagraph (0) when sel is a metagraph id", () => {
    const t = dimTargetsFor("dor", ["dor", "ded"]);
    expect(t.dag).toBe(1);
    expect(t.meta.get("dor")).toBe(0);
    expect(t.meta.get("ded")).toBe(1);
  });
});

describe("validatorDim", () => {
  const s: DimState = { l0: 0.4, l1: 0.9 };

  it("picks the l0 dim level for layer='l0'", () => {
    const c = ctx({ morph: 0 });
    expect(validatorDim(c, s, "l0", null)).toBeCloseTo(0.4 * dimScale(c), 10);
  });

  it("picks the l1 (cl1) dim level for layer='cl1'", () => {
    const c = ctx({ morph: 0 });
    expect(validatorDim(c, s, "cl1", null)).toBeCloseTo(0.9 * dimScale(c), 10);
  });

  it("raises the dim to countryMix when the node is outside the drilled country", () => {
    const c = ctx({ morph: 1, countryFilter: "US", countryMix: 0.9 });
    // s.l0 * dimScale(1) = 0.4*1.0 = 0.4, which is < countryMix 0.9 -> raised to 0.9
    expect(validatorDim(c, s, "l0", "DE")).toBeCloseTo(0.9, 10);
  });

  it("raises to countryMix when the node has no geo at all (geoCc null)", () => {
    const c = ctx({ morph: 1, countryFilter: "US", countryMix: 0.7 });
    expect(validatorDim(c, s, "l0", null)).toBeCloseTo(0.7, 10);
  });

  it("does NOT raise the dim when the node IS inside the drilled country", () => {
    const c = ctx({ morph: 1, countryFilter: "US", countryMix: 0.9 });
    // s.l0 * dimScale(1) = 0.4, and 0.4 > raising target only applies via max — inside the
    // country the max(d, countryMix) branch is skipped entirely, so d stays 0.4.
    expect(validatorDim(c, s, "l0", "US")).toBeCloseTo(0.4, 10);
  });

  it("never raises the dim when no country is drilled into", () => {
    const c = ctx({ morph: 1, countryFilter: null, countryMix: 0 });
    expect(validatorDim(c, s, "l0", "DE")).toBeCloseTo(0.4, 10);
  });
});

describe("metaNodeDim", () => {
  it("multiplies recDim by dimScale outside the ledger view", () => {
    const c = ctx({ morph: 1, ledger: false });
    expect(metaNodeDim(c, 0.5, null)).toBeCloseTo(0.5 * dimScale(c), 10);
  });

  it("forces a flat 0.82 multiplier in the ledger view, ignoring dimScale/morph", () => {
    const c = ctx({ morph: 0, ledger: true });
    expect(metaNodeDim(c, 0.5, null)).toBeCloseTo(0.5 * 0.82, 10);
  });

  it("raises to countryMix outside the drilled country", () => {
    const c = ctx({ morph: 1, ledger: false, countryFilter: "US", countryMix: 0.95 });
    // recDim * dimScale(1) = 0.1, below countryMix 0.95 -> raised
    expect(metaNodeDim(c, 0.1, "DE")).toBeCloseTo(0.95, 10);
  });
});

describe("nodeEmissive (validator loop, js/globe.js:1043-1054)", () => {
  const baseLo = 0.5, baseHi = 0.22;

  it("at morph=0, no twinkle/flash/dim/focus: base is exactly baseLo, floored at 0.02", () => {
    const c = ctx({ morph: 0 });
    // lerp(0.5,0.22,0)=0.5; twinkle term *0=0; d=0 -> *(1-0)=0.5; +0 flash
    expect(nodeEmissive(c, 0, 0, 0, 0, false, false, baseLo, baseHi)).toBeCloseTo(0.5, 10);
  });

  it("at morph=1 with d=0, base is exactly baseHi (twinkle phase at sin(0)=0)", () => {
    const c = ctx({ morph: 1 });
    expect(nodeEmissive(c, 0, 0, 0, 0, false, false, baseLo, baseHi)).toBeCloseTo(0.22, 10);
  });

  it("applies the twinkle shimmer scaled by morph (0.06 coefficient)", () => {
    const c = ctx({ morph: 1 });
    const clock = 1, twinkle = 0.3;
    const expected = (lerpRef(baseLo, baseHi, 1) + Math.sin(clock * 2 + twinkle) * 0.06 * 1) * 1;
    expect(nodeEmissive(c, 0, clock, twinkle, 0, false, false, baseLo, baseHi)).toBeCloseTo(expected, 10);
  });

  it("suppresses glow by (1 - d*0.92) and adds the morph-scaled flash", () => {
    const c = ctx({ morph: 1 });
    const d = 0.5;
    const flash = 1;
    const expected = 0.22 * (1 - d * 0.92) + flash * 1;
    expect(nodeEmissive(c, d, 0, 0, flash, false, false, baseLo, baseHi)).toBeCloseTo(expected, 10);
  });

  it("floors at 0.02 when fully dimmed with no flash", () => {
    const c = ctx({ morph: 1 });
    expect(nodeEmissive(c, 1, 0, 0, 0, false, false, baseLo, baseHi)).toBeCloseTo(0.02, 10);
  });

  it("boosts the focused node by +1.4, ignoring dimOthersOnFocus", () => {
    const c = ctx({ morph: 0 });
    const base = nodeEmissive(c, 0, 0, 0, 0, false, false, baseLo, baseHi);
    expect(nodeEmissive(c, 0, 0, 0, 0, true, true, baseLo, baseHi)).toBeCloseTo(base + 1.4, 10);
  });

  it("dims a non-focused node by *0.45 only when dimOthersOnFocus is set", () => {
    const c = ctx({ morph: 0 });
    const base = nodeEmissive(c, 0, 0, 0, 0, false, false, baseLo, baseHi);
    expect(nodeEmissive(c, 0, 0, 0, 0, false, true, baseLo, baseHi)).toBeCloseTo(base * 0.45, 10);
  });

  it("does nothing extra when there's no focus target at all (isFocus and dimOthersOnFocus both false)", () => {
    const c = ctx({ morph: 0 });
    const base = nodeEmissive(c, 0, 0, 0, 0, false, false, baseLo, baseHi);
    expect(base).toBeCloseTo(0.5, 10);
  });
});

describe("metaNodeEmissive (metagraph loop, js/globe.js:1099-1107)", () => {
  const base = 0.5;

  it("at morph=0, no dim/flash: glow is exactly base, no lerp toward a second endpoint", () => {
    const c = ctx({ morph: 0 });
    expect(metaNodeEmissive(c, 0, 0, 0, 0, false, false, base)).toBeCloseTo(0.5, 10);
  });

  it("applies the twinkle shimmer scaled by morph with the metagraph's 0.12 coefficient", () => {
    const c = ctx({ morph: 1 });
    const clock = 1, twinkle = 0.3;
    const expected = (base + Math.sin(clock * 2 + twinkle) * 0.12 * 1) * (1 - 0 * 0.9);
    expect(metaNodeEmissive(c, 0, clock, twinkle, 0, false, false, base)).toBeCloseTo(expected, 10);
  });

  it("suppresses glow by (1 - d*0.9) — the metagraph coefficient, not the validator's 0.92", () => {
    const c = ctx({ morph: 0 });
    const d = 0.5;
    const expected = base * (1 - d * 0.9);
    expect(metaNodeEmissive(c, d, 0, 0, 0, false, false, base)).toBeCloseTo(expected, 10);
  });

  it("floors at 0.03 (not the validator's 0.02) when fully dimmed with no flash", () => {
    const c = ctx({ morph: 0 });
    // base=0.2, d=1 -> glow = 0.2*(1-0.9) = 0.02, below the 0.03 floor -> clamped up to it.
    expect(metaNodeEmissive(c, 1, 0, 0, 0, false, false, 0.2)).toBeCloseTo(0.03, 10);
  });

  it("adds the morph-scaled flash", () => {
    const c = ctx({ morph: 1 });
    const flash = 2;
    const expected = base * (1 - 0 * 0.9) + flash * 1;
    expect(metaNodeEmissive(c, 0, 0, 0, flash, false, false, base)).toBeCloseTo(expected, 10);
  });

  it("boosts the focused node by +1.4", () => {
    const c = ctx({ morph: 0 });
    const b = metaNodeEmissive(c, 0, 0, 0, 0, false, false, base);
    expect(metaNodeEmissive(c, 0, 0, 0, 0, true, true, base)).toBeCloseTo(b + 1.4, 10);
  });

  it("dims a non-focused node by *0.45 only when dimOthersOnFocus is set", () => {
    const c = ctx({ morph: 0 });
    const b = metaNodeEmissive(c, 0, 0, 0, 0, false, false, base);
    expect(metaNodeEmissive(c, 0, 0, 0, 0, false, true, base)).toBeCloseTo(b * 0.45, 10);
  });

  it("does nothing extra when there's no focus target at all (isFocus and dimOthersOnFocus both false)", () => {
    const c = ctx({ morph: 0 });
    const b = metaNodeEmissive(c, 0, 0, 0, 0, false, false, base);
    expect(b).toBeCloseTo(0.5, 10);
  });
});

// local mirror of nodeLayout's lerp so this test file has no import-order dependency on it
function lerpRef(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
