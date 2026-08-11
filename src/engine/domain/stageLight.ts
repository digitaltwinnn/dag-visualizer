// Per-view stage-light staging constants — the viewPolicy idiom: one row per view that STAGES a
// light, consumed by `scene/objects/StageLight.ts`'s per-frame claim. The per-view VALUES are
// deliberate tuning; the MECHANISM is shared.
import type { View3D } from "./viewTransition";
import type { TuneSchema } from "../tune";

/** The views that stage a light. The ledger deliberately stages NONE — its chamber is lit by its
 *  own glass and emissive snapshots, and emphasis there is the four colour dim tiers, not a beam.
 *  Narrowing the key type (rather than carrying an unconsumed `ledger` row) is what makes that a
 *  compile-time fact: a claim for an unstaged view doesn't type-check. */
export type StagedView = Extract<View3D, "hyper" | "geo">;

export interface StageLightRow {
  angle: number;     // SpotLight cone half-angle (rad)
  distance: number;  // light range — size past the farthest lit point (decay 0)
  intensity: number; // full-on target the light eases toward
  penumbra?: number; // soft edge (the light defaults 0.5)
  height: number;    // aim(): light this far above the subject along the staging normal
  heightDag?: number; // hyper only: the DAG-core stage uses its own height
}

export const STAGE_LIGHTS: Record<StagedView, StageLightRow> = {
  // hyper: cone covers the outer cL1 ring (5.4) with margin at height; the DAG core is the
  // same subject at a bigger scale (L1 shell 12.5) → its own higher stage (heightDag).
  hyper: { angle: 0.9, distance: 40, intensity: 2.4, penumbra: 0.25, height: 9, heightDag: 17 },
  geo: { angle: 0.36, distance: 22, intensity: 1.5, height: 6 },
};

// ---- the `?tune` surface (contract: src/engine/tune.ts) --------------------------------------
// STAGE_LIGHTS' rows are already plain mutable objects, so the panel binds them directly and no
// production code changes shape. What it needs on top is a defaults copy to reset/diff against —
// snapshotted at module init, before any panel can exist, so it cannot be a turned knob.
export const STAGE_LIGHT_DEFAULTS: Readonly<Record<StagedView, StageLightRow>> = {
  hyper: { ...STAGE_LIGHTS.hyper },
  geo: { ...STAGE_LIGHTS.geo },
};

export const STAGE_LIGHT_SCHEMA: TuneSchema<StageLightRow> = {
  angle: { min: 0.05, max: 1.4, step: 0.01, label: "cone" },
  distance: { min: 5, max: 80, step: 1, label: "range" },
  intensity: { min: 0, max: 10, step: 0.1 },
  penumbra: { min: 0, max: 1, label: "soft edge" },
  height: { min: 1, max: 40, step: 0.5, label: "stage height" },
  heightDag: { min: 1, max: 40, step: 0.5, label: "stage height · DAG" },
};
