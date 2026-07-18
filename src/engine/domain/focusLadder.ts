// The FOCUS/ZOOM LADDER as data (spec 2026-07-18) — the per-view subject-level contract the
// Engine's camera resolution walks and pickActions' deselect stepping derives from. One rung
// per committable level, finest→coarsest; the Engine calls the first ACTIVE rung's resolver
// and falls through on resolver failure (unlocatable node, topology not loaded). Resolvers
// are NAMED here but IMPLEMENTED as Engine methods — they carry real scene side effects
// (globe lean/spin, autoRotate) that don't belong in domain/. viewPolicy's sibling idiom.
import type { View3D } from "./viewTransition";

export type FocusLevel = "node" | "cohort" | "country" | "layer" | "network" | "all";

// The committed cohort (city × provider) selection — geo-only, country-scoped. Matches
// GeoExplore's cohort key fields; internal name stays `cohort`, user-facing copy says
// "provider" (spec Part 6 records the deliberate two-register naming).
export interface CohortSel { cc: string; city: string | null; isp: string | null }

// Plain selection snapshot the Engine builds from the store each resolve — keeps the table
// store-free (domain rule).
export interface SelectionSnapshot {
  inspectIsNode: boolean;
  cohort: CohortSel | null;
  country: string | null;
  layerId: string | null;
  filter: string; // "all" | "dag" | metagraph id
}

export type ResolverKey =
  | "geoNode" | "geoCohort" | "geoCountry" | "geoNetwork" | "geoOverview"
  | "hyperNode" | "hyperNetwork" | "hyperOverview"
  | "ledgerNode" | "ledgerLayer" | "ledgerOverview";

export interface Rung {
  level: FocusLevel;
  active(sel: SelectionSnapshot): boolean;
  resolver: ResolverKey;
}

// Finest→coarsest; the last rung is unconditional so the walk always resolves.
export const LADDERS: Record<View3D, Rung[]> = {
  geo: [
    { level: "node",    active: (s) => s.inspectIsNode,    resolver: "geoNode" },
    { level: "cohort",  active: (s) => s.cohort != null,   resolver: "geoCohort" },
    { level: "country", active: (s) => s.country != null,  resolver: "geoCountry" },
    { level: "network", active: (s) => s.filter !== "all", resolver: "geoNetwork" },
    { level: "all",     active: () => true,                resolver: "geoOverview" },
  ],
  hyper: [
    { level: "node",    active: (s) => s.inspectIsNode,    resolver: "hyperNode" },
    { level: "network", active: (s) => s.filter !== "all", resolver: "hyperNetwork" },
    { level: "all",     active: () => true,                resolver: "hyperOverview" },
  ],
  ledger: [
    { level: "node",    active: (s) => s.inspectIsNode,    resolver: "ledgerNode" },
    { level: "layer",   active: (s) => s.layerId != null,  resolver: "ledgerLayer" },
    { level: "all",     active: () => true,                resolver: "ledgerOverview" },
  ],
};

// Cross-view carry (spec Part 2): a rung that exists in only one view clears when leaving
// that view; universal subjects carry. The snapshot subject is NOT a rung — its pin/follow
// behaviour stays with FollowController + snapshotSelectActions.
export const LEVEL_CARRY: Record<Exclude<FocusLevel, "all">, "always" | "view-scoped"> = {
  node: "always",
  network: "always",
  cohort: "view-scoped",
  country: "view-scoped",
  layer: "view-scoped",
};

// The levels FINER than `level` in this view's ladder — the deselect-stepping data
// pickActions derives its drop-the-finer rules from (one list, two consumers).
export function finerLevels(view: View3D, level: FocusLevel): FocusLevel[] {
  const order = LADDERS[view].map((r) => r.level);
  const i = order.indexOf(level);
  return i < 0 ? [] : order.slice(0, i);
}
