import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIGHT_TUNE_DEFAULTS } from "./sceneColors";

// THE GROUND'S THREE HOMES, HELD TOGETHER EXECUTABLY (2026-08-30). `groundL` lives in
// LIGHT_TUNE_DEFAULTS, in globals.css's `--scene-ground` token, and in devTune's live override —
// the third DERIVES from the struct, but the token was synced by a comment ("keep ... in sync"),
// which is exactly the two-homes drift class that bit the light lane the same day (the palette's
// SCENE_L_LIGHT sat at a stale 0.70 while the shipped tune said 0.57, and a fresh boot showed the
// stale look until a slider touch). A CSS token can't import TypeScript, so the sync can't be a
// derivation — but it CAN be a test: parse the token's light arm out of the stylesheet and assert
// its L equals the struct. Editing either home without the other now fails here instead of
// shipping a boot look that disagrees with the tuned one.
describe("the light ground's token ↔ tune sync", () => {
  it("globals.css --scene-ground (light arm) carries LIGHT_TUNE_DEFAULTS.groundL", () => {
    const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
    const m = css.match(/--scene-ground:\s*light-dark\(oklch\(([\d.]+)\s/);
    expect(m, "--scene-ground token not found in globals.css").toBeTruthy();
    expect(Number(m![1])).toBeCloseTo(LIGHT_TUNE_DEFAULTS.groundL, 6);
  });
});
