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
  // THE RELATIONS ARE PINNED, NOT THE NUMBERS (review, 2026-10-24): a retune is a design decision
  // the user makes on screen; what this file guards is the SHAPE of each row and the ladder in it.
  it("hyper's row stages three subjects at three scales — the finer the subject, the lower and tighter its stage", () => {
    const h = STAGE_LIGHT_DEFAULTS.hyper;
    expect(h.heightNode).toBeDefined();
    expect(h.heightDag).toBeDefined();
    expect(h.angleNode).toBeDefined();
    expect(h.heightNode!).toBeLessThan(h.height);
    expect(h.height).toBeLessThan(h.heightDag!);
    expect(h.angleNode!).toBeLessThan(h.angle);
  });

  it("every row is a live lamp: a positive cone, distance, intensity and height, the cone inside a hemisphere", () => {
    for (const [view, row] of Object.entries(STAGE_LIGHT_DEFAULTS)) {
      for (const [k, v] of Object.entries(row)) expect(v, `${view}.${k}`).toBeGreaterThan(0);
      expect(row.angle, `${view} cone`).toBeLessThan(Math.PI / 2);
    }
  });

  it("geo's lamp is tighter and closer than hyper's — one dense stack, not a ring of hubs", () => {
    expect(STAGE_LIGHT_DEFAULTS.geo.angle).toBeLessThan(STAGE_LIGHT_DEFAULTS.hyper.angle);
    expect(STAGE_LIGHT_DEFAULTS.geo.distance).toBeLessThan(STAGE_LIGHT_DEFAULTS.hyper.distance);
  });

  // A lamp is not the same instrument on both grounds: dark blooms the wash it lays on an emissive
  // node, paper does not (the whole-frame pass is skipped there), so the identical claim reads as
  // nothing there. Every
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

  it("the ledger's row is the day glass's LOW highlight: staged under hyper's hub height, with no node or core stage", () => {
    const l = STAGE_LIGHT_DEFAULTS.ledger;
    expect(l.height).toBeLessThan(STAGE_LIGHT_DEFAULTS.hyper.height);
    expect(l.heightNode).toBeUndefined();
    expect(l.heightDag).toBeUndefined();
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
