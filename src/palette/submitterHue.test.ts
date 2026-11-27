import { describe, it, expect } from "vitest";
import { submitterHue, submitterHudCss, submitterSceneHex, MIN_HUE_GAP } from "./submitterHue";
import { networkHueDegs, SCENE_L, SCENE_C, SCENE_L_LIGHT, SCENE_C_LIGHT } from "./identity";
import { oklchToHex } from "./palette";

const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const uuid = () => crypto.randomUUID();

describe("submitterHue", () => {
  it("is deterministic from the id", () => {
    expect(submitterHue("org-1")).toBe(submitterHue("org-1"));
  });
  it("keeps at least MIN_HUE_GAP from every network hue", () => {
    const nets = networkHueDegs();
    expect(nets.length).toBeGreaterThan(3);
    for (let i = 0; i < 400; i++) {
      const h = submitterHue(uuid());
      for (const n of nets) expect(dist(h, n)).toBeGreaterThanOrEqual(MIN_HUE_GAP);
    }
  });
  it("spreads ids over several hues", () => {
    const set = new Set(Array.from({ length: 100 }, () => Math.round(submitterHue(uuid()))));
    expect(set.size).toBeGreaterThan(10);
  });
});

describe("string forms", () => {
  it("HUD is theme-deferred", () => {
    const h = submitterHue("a");
    expect(submitterHudCss("a")).toBe(`oklch(var(--ident-l) var(--ident-c) ${h}deg)`);
  });
  it("scene hex per theme", () => {
    const h = submitterHue("a");
    expect(submitterSceneHex("a")).toBe(oklchToHex(SCENE_L, SCENE_C, h));
    expect(submitterSceneHex("a", "light")).toBe(oklchToHex(SCENE_L_LIGHT, SCENE_C_LIGHT, h));
  });
});
