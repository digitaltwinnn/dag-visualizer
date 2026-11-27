import { describe, it, expect } from "vitest";
import { submitterHue, submitterHues, submitterHudCss, submitterSceneHex, MIN_HUE_GAP, ORG_HUE_GAP } from "./submitterHue";
import { COLORS } from "@/src/engine/config";
import { hexToHueDeg, identityHueDeg, SCENE_L, SCENE_C, SCENE_L_LIGHT, SCENE_C_LIGHT } from "./identity";
import { inAllowedZone } from "./brand";
import { oklchToHex } from "./palette";
import { DED_ID, DOR_ID } from "@/src/data/submitters";

const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const NETS = [...[DED_ID, DOR_ID].map((n) => identityHueDeg(n) as number), hexToHueDeg(COLORS.core)];
const REAL = [
  "c9834e11-36ca-436f-8954-6b304e13ac6b", "ff591af5-e0dc-40e9-8e83-77e19ab66da6",
  "d61768f8-5d4f-40bc-8389-5e28fc35a69a", "567332a1-685e-4f7a-be8b-c20658e2a60b",
  "dd8bec70-03d3-4868-b3b7-6f9ed47dee97", "bc9fd17c-7868-4a33-8cc8-9ab2ae456fb9",
  "5d73f427-28a0-4f78-a2f1-abaefd2ec157",
];

describe("submitterHue", () => {
  it("seats the seven palette ids pairwise 24 apart, clear of DED, Dor and the core cyan, in the zones", () => {
    const hs = REAL.map((id) => submitterHue(id, REAL) as number);
    for (let i = 0; i < hs.length; i++) {
      expect(inAllowedZone(hs[i])).toBe(true);
      for (const n of NETS) expect(dist(hs[i], n)).toBeGreaterThanOrEqual(MIN_HUE_GAP);
      for (let j = i + 1; j < hs.length; j++) expect(dist(hs[i], hs[j])).toBeGreaterThanOrEqual(ORG_HUE_GAP);
    }
    expect(REAL.map((id) => submitterHue(id, REAL))).toEqual(hs);
  });
  it("assigns by palette order: the same slots, the busiest first", () => {
    const rev = [...REAL].reverse();
    expect(submitterHue(rev[0], rev)).toBe(submitterHue(REAL[0], REAL));
  });
  it("gives an id outside the palette no hue", () => {
    expect(submitterHue("eighth", REAL)).toBeNull();
    expect(submitterHues(REAL).size).toBe(7);
  });
});

describe("string forms", () => {
  it("HUD is theme-deferred inside the palette and muted outside", () => {
    expect(submitterHudCss(REAL[0], REAL)).toBe(`oklch(var(--ident-l) var(--ident-c) ${submitterHue(REAL[0], REAL)}deg)`);
    expect(submitterHudCss("eighth", REAL)).toBe("var(--muted-foreground)");
  });
  it("scene hex per theme inside the palette, the chamber's neutral outside", () => {
    const h = submitterHue(REAL[0], REAL) as number;
    expect(submitterSceneHex(REAL[0], REAL)).toBe(oklchToHex(SCENE_L, SCENE_C, h));
    expect(submitterSceneHex(REAL[0], REAL, "light")).toBe(oklchToHex(SCENE_L_LIGHT, SCENE_C_LIGHT, h));
    expect(submitterSceneHex("eighth", REAL)).toBe("#8a96b8");
    expect(submitterSceneHex("eighth", REAL, "light")).toBe("#5a6478");
  });
});
