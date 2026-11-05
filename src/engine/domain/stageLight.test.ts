import { describe, it, expect } from "vitest";
import { STAGE_LIGHTS } from "./stageLight";

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
    const h = STAGE_LIGHTS.hyper;
    expect(h.heightNode).toBeDefined();
    expect(h.heightDag).toBeDefined();
    expect(h.angleNode).toBeDefined();
    expect(h.heightNode!).toBeLessThan(h.height);
    expect(h.height).toBeLessThan(h.heightDag!);
    expect(h.angleNode!).toBeLessThan(h.angle);
  });

  it("every row is a live lamp: a positive cone, distance, intensity and height, the cone inside a hemisphere, a penumbra in [0, 1]", () => {
    for (const [view, row] of Object.entries(STAGE_LIGHTS)) {
      for (const k of ["angle", "distance", "intensity", "height"] as const) expect(row[k], `${view}.${k}`).toBeGreaterThan(0);
      expect(row.angle, `${view} cone`).toBeLessThan(Math.PI / 2);
      if (row.penumbra != null) {
        expect(row.penumbra, `${view} penumbra`).toBeGreaterThanOrEqual(0); // 0 is a hard edge, a legitimate lamp
        expect(row.penumbra, `${view} penumbra`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("geo's lamp is tighter and closer than hyper's — one dense stack, not a ring of hubs", () => {
    expect(STAGE_LIGHTS.geo.angle).toBeLessThan(STAGE_LIGHTS.hyper.angle);
    expect(STAGE_LIGHTS.geo.distance).toBeLessThan(STAGE_LIGHTS.hyper.distance);
  });

  // A lamp is not the same instrument on both grounds: dark blooms the wash it lays on an emissive
  // node, paper does not (the whole-frame pass is skipped there), so the identical claim reads as
  // nothing there. Every
  // row that states a paper level must state a HIGHER one — the direction is the design, the
  // numbers are tuning. The ledger is exempt by construction: its claim is paper-only, so its one
  // `intensity` already is its paper number.
  it("asks MORE of a claim on paper, wherever a row states a paper level", () => {
    for (const [view, row] of Object.entries(STAGE_LIGHTS)) {
      if (row.intensityPaper == null) continue;
      expect(row.intensityPaper, `${view} paper level`).toBeGreaterThan(row.intensity);
    }
    expect(STAGE_LIGHTS.ledger.intensityPaper).toBeUndefined();
  });

  it("the ledger's row is the day glass's LOW highlight: staged under hyper's hub height, with no node or core stage", () => {
    const l = STAGE_LIGHTS.ledger;
    expect(l.height).toBeLessThan(STAGE_LIGHTS.hyper.height);
    expect(l.heightNode).toBeUndefined();
    expect(l.heightDag).toBeUndefined();
  });
});
