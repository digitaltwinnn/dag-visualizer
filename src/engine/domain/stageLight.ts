// Per-view stage-light staging constants (spec A#3) — the viewPolicy idiom: one row per 3D
// view, consumed by the view's FocusSpot construction + aim calls. The per-view VALUES are
// deliberate tuning (non-goals: values stay per-view; the MECHANISM unifies).
import type { View3D } from "./viewTransition";
import type { TuneSchema } from "../tune";

export interface StageLightRow {
  angle: number;     // SpotLight cone half-angle (rad)
  distance: number;  // light range — size past the farthest lit point (decay 0)
  intensity: number; // full-on target the FocusSpot eases toward
  penumbra?: number; // soft edge (FocusSpot defaults 0.5)
  height: number;    // aim(): light this far above the subject along the staging normal
  heightDag?: number; // hyper only: the DAG-core stage uses its own height
}

export const STAGE_LIGHTS: Record<View3D, StageLightRow> = {
  // hyper: cone covers the outer cL1 ring (5.4) with margin at height; the DAG core is the
  // same subject at a bigger scale (L1 shell 12.5) → its own higher stage (heightDag).
  hyper: { angle: 0.9, distance: 40, intensity: 2.4, penumbra: 0.25, height: 9, heightDag: 17 },
  geo: { angle: 0.36, distance: 22, intensity: 1.5, height: 6 },
  ledger: { angle: 0.75, distance: 44, intensity: 2.6, height: 14 },
};

// ---- the `?tune` surface (contract: src/engine/tune.ts) --------------------------------------
// STAGE_LIGHTS' rows are already plain mutable objects, so the panel binds them directly and no
// production code changes shape. What it needs on top is a defaults copy to reset/diff against —
// snapshotted at module init, before any panel can exist, so it cannot be a turned knob.
//
// ⚠️ `ledger` has a row here but NO FocusSpot: only HyperView (hyper) and Globe (geo) construct and
// register one. The row is unconsumed — the panel therefore offers hyper and geo only, rather than
// a folder whose sliders move nothing.
export const STAGE_LIGHT_DEFAULTS: Readonly<Record<View3D, StageLightRow>> = {
  hyper: { ...STAGE_LIGHTS.hyper },
  geo: { ...STAGE_LIGHTS.geo },
  ledger: { ...STAGE_LIGHTS.ledger },
};

export const STAGE_LIGHT_SCHEMA: TuneSchema<StageLightRow> = {
  angle: { min: 0.05, max: 1.4, step: 0.01, label: "cone" },
  distance: { min: 5, max: 80, step: 1, label: "range" },
  intensity: { min: 0, max: 10, step: 0.1 },
  penumbra: { min: 0, max: 1, label: "soft edge" },
  height: { min: 1, max: 40, step: 0.5, label: "stage height" },
  heightDag: { min: 1, max: 40, step: 0.5, label: "stage height · DAG" },
};
