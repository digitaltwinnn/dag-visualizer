import { describe, it, expect } from "vitest";
import { hexToHueDeg, configPins, identityPins, identityMap, identityHudHex, identitySceneHex, SCENE_L, SCENE_C, HUD_L, HUD_C } from "./identity";
import { METAGRAPHS, COLORS } from "@/src/engine/config";
import { oklchToHex } from "./palette";
import brandHues from "@/data/brand-hues.json";

describe("hexToHueDeg", () => {
  it("maps primaries to their OKLCH hue neighbourhood", () => {
    expect(hexToHueDeg(0xff0000)).toBeGreaterThan(15);   // red ~29°
    expect(hexToHueDeg(0xff0000)).toBeLessThan(45);
    expect(hexToHueDeg(0x00ff00)).toBeGreaterThan(130);  // green ~142°
    expect(hexToHueDeg(0x0000ff)).toBeGreaterThan(250);  // blue ~264°
  });
});

describe("configPins", () => {
  it("pins every config metagraph to its brand hue (not snapped)", () => {
    const pins = configPins();
    for (const m of METAGRAPHS as { id: string; color: number }[]) {
      expect(pins[m.id]).toBeCloseTo(hexToHueDeg(m.color), 5);
    }
  });
});

describe("identityMap", () => {
  it("keeps a known metagraph's exact hue (baked brand hue if present, else config)", () => {
    const m0 = (METAGRAPHS as { id: string; color: number }[])[0];
    const e = identityMap([m0.id]).get(m0.id)!;
    const brand = (brandHues as Record<string, { hueDeg: number }>)[m0.id];
    const expected = brand ? brand.hueDeg : hexToHueDeg(m0.color);
    expect(e.hueDeg).toBeCloseTo(expected, 5);
  });
  it("derives hud/scene hexes at the two L/C for the SAME hue", () => {
    const m0 = (METAGRAPHS as { id: string }[])[0];
    const e = identityMap([m0.id]).get(m0.id)!;
    expect(e.hudHex).toBe(oklchToHex(HUD_L, HUD_C, e.hueDeg));
    expect(e.sceneHex).toBe(oklchToHex(SCENE_L, SCENE_C, e.hueDeg));
  });
  it("gives a NEW id a hue in an allowed zone, de-collided against pins", () => {
    const e = identityMap(["totally-new-metagraph-id"]).get("totally-new-metagraph-id")!;
    const h = e.hueDeg;
    const inAllowed = (h>=41&&h<74)||(h>=106&&h<149)||(h>=211&&h<249)||(h>=316||h<9);
    expect(inAllowed).toBe(true);
  });
});

describe("identityPins", () => {
  it("overlays baked brand hues over config pins (brand wins)", () => {
    const cfg = configPins();
    const pins = identityPins();
    const expected: Record<string, number> = { ...cfg };
    for (const [id, v] of Object.entries(brandHues as Record<string, { hueDeg: number }>)) expected[id] = v.hueDeg;
    expect(pins).toEqual(expected);
  });
});

describe("lane accessors", () => {
  it("dag resolves its own baked brand hue, distinct from structural cyan", () => {
    // The DAG is itself a metagraph-shaped "core" (USER DECISION) and gets its own brand hue
    // like any metagraph — via brand-hues.json's "dag" entry (baked by bake-brand-hues.ts) —
    // NOT the structural cyan used by the central core sphere / "All" filter.
    const cyan = "#" + COLORS.core.toString(16).padStart(6, "0");
    const brand = (brandHues as Record<string, { hueDeg: number }>).dag;
    expect(brand).toBeTruthy();
    expect(identityHudHex("dag")).toBe(oklchToHex(HUD_L, HUD_C, brand.hueDeg));
    expect(identitySceneHex("dag")).toBe(oklchToHex(SCENE_L, SCENE_C, brand.hueDeg));
    expect(identityHudHex("dag")).not.toBe(cyan);
    expect(identitySceneHex("dag")).not.toBe(cyan);
  });
  it("hud and scene share the hue for a known metagraph", () => {
    const m0 = (METAGRAPHS as { id: string }[])[0];
    expect(Math.abs(hexToHueDeg(parseInt(identityHudHex(m0.id).slice(1),16)) - hexToHueDeg(parseInt(identitySceneHex(m0.id).slice(1),16)))).toBeLessThan(2);
  });
});
