import { describe, it, expect } from "vitest";
import { hexToHueDeg, configPins, identityMap, identityHudHex, identitySceneHex, identityHudNumber, SCENE_L, SCENE_C } from "./identity";
import { METAGRAPHS, COLORS } from "../../js/config.js";
import { oklchToHex } from "./palette";

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
  it("keeps a known metagraph's exact brand hue", () => {
    const m0 = (METAGRAPHS as { id: string; color: number }[])[0];
    const e = identityMap([m0.id]).get(m0.id)!;
    expect(e.hueDeg).toBeCloseTo(hexToHueDeg(m0.color), 5);
  });
  it("derives hud/scene hexes at the two L/C for the SAME hue", () => {
    const m0 = (METAGRAPHS as { id: string }[])[0];
    const e = identityMap([m0.id]).get(m0.id)!;
    expect(e.hudHex).toBe(oklchToHex(0.8, 0.15, e.hueDeg));
    expect(e.sceneHex).toBe(oklchToHex(SCENE_L, SCENE_C, e.hueDeg));
  });
  it("gives a NEW id a hue in an allowed zone, de-collided against pins", () => {
    const e = identityMap(["totally-new-metagraph-id"]).get("totally-new-metagraph-id")!;
    const h = e.hueDeg;
    const inAllowed = (h>=41&&h<74)||(h>=106&&h<149)||(h>=211&&h<249)||(h>=316||h<9);
    expect(inAllowed).toBe(true);
  });
});

describe("lane accessors", () => {
  it("dag is structural cyan in both lanes", () => {
    const cyan = "#" + COLORS.core.toString(16).padStart(6, "0");
    expect(identityHudHex("dag")).toBe(cyan);
    expect(identitySceneHex("dag")).toBe(cyan);
    expect(identityHudNumber("dag")).toBe(COLORS.core);
  });
  it("hud and scene share the hue for a known metagraph", () => {
    const m0 = (METAGRAPHS as { id: string }[])[0];
    expect(Math.abs(hexToHueDeg(parseInt(identityHudHex(m0.id).slice(1),16)) - hexToHueDeg(parseInt(identitySceneHex(m0.id).slice(1),16)))).toBeLessThan(2);
  });
});
