import { describe, it, expect } from "vitest";
import { submitterHue, submitterHues, submitterHudCss, submitterSceneHex, MIN_HUE_GAP, ORG_HUE_GAP } from "./submitterHue";
import { identityHueDeg, SCENE_L, SCENE_C, SCENE_L_LIGHT, SCENE_C_LIGHT } from "./identity";
import { inAllowedZone } from "./brand";
import { oklchToHex } from "./palette";
import { DED_ID, DOR_ID } from "@/src/data/submitters";

const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const NETS = [DED_ID, DOR_ID].map((n) => identityHueDeg(n) as number);
const REAL = [
  "c9834e11-36ca-436f-8954-6b304e13ac6b", "ff591af5-e0dc-40e9-8e83-77e19ab66da6",
  "d61768f8-5d4f-40bc-8389-5e28fc35a69a", "567332a1-685e-4f7a-be8b-c20658e2a60b",
  "dd8bec70-03d3-4868-b3b7-6f9ed47dee97", "bc9fd17c-7868-4a33-8cc8-9ab2ae456fb9",
  "5d73f427-28a0-4f78-a2f1-abaefd2ec157",
];

describe("submitterHue", () => {
  it("is deterministic and in the clear set for any id", () => {
    expect(submitterHue("org-1")).toBe(submitterHue("org-1"));
    for (let i = 0; i < 400; i++) {
      const h = submitterHue(crypto.randomUUID());
      expect(inAllowedZone(h)).toBe(true);
      for (const n of NETS) expect(dist(h, n)).toBeGreaterThanOrEqual(MIN_HUE_GAP);
    }
  });
  it("spreads the seven real organisations", () => {
    const m = submitterHues(REAL);
    const hs = REAL.map((id) => m.get(id) as number);
    for (let i = 0; i < hs.length; i++) {
      expect(inAllowedZone(hs[i])).toBe(true);
      for (const n of NETS) expect(dist(hs[i], n)).toBeGreaterThanOrEqual(MIN_HUE_GAP);
      for (let j = i + 1; j < hs.length; j++) expect(dist(hs[i], hs[j])).toBeGreaterThanOrEqual(ORG_HUE_GAP);
      expect(submitterHue(REAL[i], REAL)).toBe(hs[i]);
    }
  });
  it("does not depend on input order", () => {
    const a = submitterHues(REAL), b = submitterHues([...REAL].reverse());
    for (const id of REAL) expect(b.get(id)).toBe(a.get(id));
  });
});

describe("string forms", () => {
  it("HUD is theme-deferred", () => {
    expect(submitterHudCss("a", REAL)).toBe(`oklch(var(--ident-l) var(--ident-c) ${submitterHue("a", REAL)}deg)`);
  });
  it("scene hex per theme", () => {
    const h = submitterHue("a");
    expect(submitterSceneHex("a")).toBe(oklchToHex(SCENE_L, SCENE_C, h));
    expect(submitterSceneHex("a", [], "light")).toBe(oklchToHex(SCENE_L_LIGHT, SCENE_C_LIGHT, h));
  });
});
