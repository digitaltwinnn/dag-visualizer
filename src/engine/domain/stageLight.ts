// Per-view stage-light staging constants — the viewPolicy idiom: one row per view that STAGES a
// light, consumed by `scene/objects/StageLight.ts`'s per-frame claim. The per-view VALUES are
// deliberate tuning; the MECHANISM is shared.
import type { View3D } from "./viewTransition";
import type { TuneSchema } from "../tune";

/** The views that stage a light. All three 3D views have a row — but the ledger's is claimed ONLY
 *  on a light ground (LedgerView gates the claim on `_paper`, and says so at the claim site), so on
 *  the dark ground the chamber still stages nothing and is lit by its own glass and emissive
 *  snapshots exactly as before. The reason it stages one at all on paper is the day glass: an
 *  additive whisper over black needs no lamp, but a REFLECTIVE pane over paper needs something to
 *  reflect, and a fixed analytic rig can only ever be aimed by editing the shader. Handing the
 *  chamber the app's one light makes the day reflection AIMABLE with the knobs that already exist
 *  (user, 2026-08-26: "I would expect the glass to show some light reflection?").
 *
 *  It is a real SpotLight in the scene as well as a shader uniform — nothing in the chamber is lit
 *  by three.js today, so the beam itself is invisible and only the glass reads it; that is why its
 *  intensity row is low. Keeping the row in this table rather than in the shader is what keeps the
 *  `?tune` spotlight folder working for it. */
export type StagedView = Extract<View3D, "hyper" | "geo" | "ledger">;

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
  // ledger: the day glass's movable highlight. `height` stages it above the chamber's own GLOBAL
  // FLOOR, and it is low on purpose — a specular highlight sits where the light's mirror image is
  // seen, and from the ledger's resting pose (a low camera looking down the trail) a lamp staged
  // high lands its reflection well past the front rim, on no glass at all. ~5 puts the pool just
  // behind the lead slot. The cone and range only matter to a beam nothing here reads; the
  // intensity is what the glass's Blinn-Phong lobe spends.
  ledger: { angle: 0.7, distance: 60, intensity: 0.32, penumbra: 0.6, height: 5 },
};

// ---- the `?tune` surface (contract: src/engine/tune.ts) --------------------------------------
// STAGE_LIGHTS' rows are already plain mutable objects, so the panel binds them directly and no
// production code changes shape. What it needs on top is a defaults copy to reset/diff against —
// snapshotted at module init, before any panel can exist, so it cannot be a turned knob.
export const STAGE_LIGHT_DEFAULTS: Readonly<Record<StagedView, StageLightRow>> = {
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
