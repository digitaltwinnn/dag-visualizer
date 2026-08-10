import { describe, it, expect } from "vitest";
import { STAGE_LIGHTS, STAGE_LIGHT_DEFAULTS, STAGE_LIGHT_SCHEMA } from "./stageLight";

// The rows are pinned through STAGE_LIGHT_DEFAULTS, not the live STAGE_LIGHTS: the `?tune` panel
// binds the live rows, and a test that asserted those would turn a dev knob into a red build.
describe("STAGE_LIGHTS", () => {
  it("has a row for every View3D", () => {
    expect(Object.keys(STAGE_LIGHTS).sort()).toEqual(["geo", "hyper", "ledger"]);
  });

  it("pins hyper's row (moved verbatim from HyperView.ts's SPOT_* consts)", () => {
    expect(STAGE_LIGHT_DEFAULTS.hyper).toEqual({
      angle: 0.9, distance: 40, intensity: 2.4, penumbra: 0.25, height: 9, heightDag: 17,
    });
  });

  it("pins geo's row (moved verbatim from Globe.ts)", () => {
    expect(STAGE_LIGHT_DEFAULTS.geo).toEqual({ angle: 0.36, distance: 22, intensity: 1.5, height: 6 });
  });

  // ⚠️ UNCONSUMED: no FocusSpot is constructed for the ledger (only HyperView and Globe register
  // one), so this row currently drives nothing. Kept as the staging values a ledger spot would
  // take; see the note in stageLight.ts.
  it("pins ledger's row (moved verbatim from LedgerView.ts)", () => {
    expect(STAGE_LIGHT_DEFAULTS.ledger).toEqual({ angle: 0.75, distance: 44, intensity: 2.6, height: 14 });
  });

  it("starts live == defaults, so an untouched panel changes nothing", () => {
    expect(STAGE_LIGHTS).toEqual(STAGE_LIGHT_DEFAULTS);
  });

  it("schemas every knob, and every knob's range contains its default", () => {
    for (const row of Object.values(STAGE_LIGHT_DEFAULTS)) {
      for (const [key, v] of Object.entries(row)) {
        const knob = STAGE_LIGHT_SCHEMA[key as keyof typeof row];
        expect(knob, `no schema entry for ${key}`).toBeDefined();
        expect(v).toBeGreaterThanOrEqual(knob!.min);
        expect(v).toBeLessThanOrEqual(knob!.max);
      }
    }
  });
});
