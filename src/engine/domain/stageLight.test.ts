import { describe, it, expect } from "vitest";
import { STAGE_LIGHTS } from "./stageLight";

describe("STAGE_LIGHTS", () => {
  it("has a row for every View3D", () => {
    expect(Object.keys(STAGE_LIGHTS).sort()).toEqual(["geo", "hyper", "ledger"]);
  });

  it("pins hyper's row (moved verbatim from HyperView.ts's SPOT_* consts)", () => {
    expect(STAGE_LIGHTS.hyper).toEqual({
      angle: 0.9, distance: 40, intensity: 2.4, penumbra: 0.25, height: 9, heightDag: 17,
    });
  });

  it("pins geo's row (moved verbatim from Globe.ts)", () => {
    expect(STAGE_LIGHTS.geo).toEqual({ angle: 0.36, distance: 22, intensity: 1.5, height: 6 });
  });

  it("pins ledger's row (moved verbatim from LedgerView.ts)", () => {
    expect(STAGE_LIGHTS.ledger).toEqual({ angle: 0.75, distance: 44, intensity: 2.6, height: 14 });
  });
});
