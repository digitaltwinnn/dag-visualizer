import { describe, it, expect } from "vitest";
import { STAGE_LIGHTS, STAGE_LIGHT_DEFAULTS, STAGE_LIGHT_SCHEMA } from "./stageLight";

// The rows are pinned through STAGE_LIGHT_DEFAULTS, not the live STAGE_LIGHTS: the `?tune` panel
// binds the live rows, and a test that asserted those would turn a dev knob into a red build.
describe("STAGE_LIGHTS", () => {
  // Every 3D view has a row, and the placeholder views have none — `StagedView` makes the second
  // half a compile-time fact and this assertion is the runtime half. The ledger's row is the newest
  // and the one with a condition on it: it is CLAIMED only on a light ground, so having a row here
  // is not the same as staging a light. The dark chamber still stages nothing, and the gate that
  // says so lives at the claim site in LedgerView, which is where it can read the theme.
  it("has a row for every view that stages a light, and no others", () => {
    expect(Object.keys(STAGE_LIGHTS).sort()).toEqual(["geo", "hyper", "ledger"]);
  });

  // Hyper stages THREE subjects at three scales out of one row — the DAG core, a metagraph hub and
  // a single node (the follow-spot). The node's own height AND cone are what make the pool read as
  // emphasis on one bead rather than as a wash over its whole shell, so both are pinned.
  it("pins hyper's row, including its per-subject stages (core, hub, node)", () => {
    expect(STAGE_LIGHT_DEFAULTS.hyper).toEqual({
      angle: 0.9, distance: 40, intensity: 2.4, intensityPaper: 5.5, penumbra: 0.25,
      height: 9, heightDag: 17, heightNode: 3.2, angleNode: 0.5,
    });
    // The ladder in numbers: the finer the subject, the lower and tighter its stage.
    expect(STAGE_LIGHT_DEFAULTS.hyper.heightNode!).toBeLessThan(STAGE_LIGHT_DEFAULTS.hyper.height);
    expect(STAGE_LIGHT_DEFAULTS.hyper.height).toBeLessThan(STAGE_LIGHT_DEFAULTS.hyper.heightDag!);
    expect(STAGE_LIGHT_DEFAULTS.hyper.angleNode!).toBeLessThan(STAGE_LIGHT_DEFAULTS.hyper.angle);
  });

  it("pins geo's row (moved verbatim from Globe.ts)", () => {
    expect(STAGE_LIGHT_DEFAULTS.geo).toEqual({
      angle: 0.36, distance: 22, intensity: 1.5, intensityPaper: 3.4, height: 6,
    });
  });

  // A lamp is not the same instrument on both grounds: dark blooms the wash it lays on an emissive
  // node, paper (bloomMul 0.15) barely does, so the identical claim reads as nothing there. Every
  // row that states a paper level must state a HIGHER one — the direction is the design, the
  // numbers are tuning. The ledger is exempt by construction: its claim is paper-only, so its one
  // `intensity` already is its paper number.
  it("asks MORE of a claim on paper, wherever a row states a paper level", () => {
    for (const [view, row] of Object.entries(STAGE_LIGHT_DEFAULTS)) {
      if (row.intensityPaper == null) continue;
      expect(row.intensityPaper, `${view} paper level`).toBeGreaterThan(row.intensity);
    }
    expect(STAGE_LIGHT_DEFAULTS.ledger.intensityPaper).toBeUndefined();
  });

  it("pins the ledger's row (the day glass's movable highlight)", () => {
    expect(STAGE_LIGHT_DEFAULTS.ledger).toEqual({
      angle: 0.7, distance: 60, intensity: 0.32, penumbra: 0.6, height: 5,
    });
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
