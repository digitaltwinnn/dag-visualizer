// The FOCUS/ZOOM LADDER as data (spec 2026-07-18) — the per-view subject-level contract the
// Engine's camera resolution walks and pickActions' deselect stepping derives from. One rung
// per committable level, finest→coarsest; the Engine calls the first ACTIVE rung's resolver
// and falls through on resolver failure (unlocatable node, topology not loaded). Resolvers
// are NAMED here but IMPLEMENTED as Engine methods — they carry real scene side effects
// (globe lean/spin, autoRotate) that don't belong in domain/. viewPolicy's sibling idiom.
import type { View3D } from "./viewTransition";

export type FocusLevel = "node" | "cohort" | "composition" | "country" | "layer" | "network" | "all";

// The committed cohort (city × provider) selection — geo-only, country-scoped. Matches
// GeoExplore's cohort key fields; internal name stays `cohort`, user-facing copy says
// "provider" (spec Part 6 records the deliberate two-register naming).
export interface CohortSel { cc: string; city: string | null; isp: string | null }

// The committed COMPOSITION group — hyper-only, network-scoped: HyperExplore's middle browse
// level (Hybrid [L0][cL1][dL1] / Data / Consensus / …), the hyper twin of geo's provider cohort
// and ledger's floor (user, 2026-08-02: the only explorer level with no card of its own). Keyed
// by the group's `${label}|${codes.join("·")}` — the SAME key HyperExplore's grouping builds —
// so the card re-resolves live off `selNodes` instead of caching a count that could go stale.
export interface CompositionSel { netId: string; key: string }

// Plain selection snapshot the Engine builds from the store each resolve — keeps the table
// store-free (domain rule).
export interface SelectionSnapshot {
  inspectIsNode: boolean;
  cohort: CohortSel | null;
  composition: CompositionSel | null;
  country: string | null;
  layerId: string | null;
  filter: string; // "all" | "dag" | metagraph id
}

export type ResolverKey =
  | "geoNode" | "geoCohort" | "geoCountry" | "geoNetwork" | "geoOverview"
  | "hyperNode" | "hyperComposition" | "hyperNetwork" | "hyperOverview"
  | "ledgerNode" | "ledgerLayer" | "ledgerNetwork" | "ledgerOverview";

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
  // The composition rung sits between node and network: a group is always network-scoped (its
  // toggle commits the filter first), so it has no pose of its own — `hyperComposition` frames
  // the group's NETWORK, the containment its card describes. It stays a rung anyway so the
  // deselect stepping, the carry policy, and the rail's ladder lane all see it.
  hyper: [
    { level: "node",        active: (s) => s.inspectIsNode,     resolver: "hyperNode" },
    { level: "composition", active: (s) => s.composition != null, resolver: "hyperComposition" },
    { level: "network",     active: (s) => s.filter !== "all",  resolver: "hyperNetwork" },
    { level: "all",         active: () => true,                 resolver: "hyperOverview" },
  ],
  // The layer rung sits FINER than network deliberately: a committed layer wins the camera and
  // composes with the filter (the lane-aware layer framing slides on a filter change, see
  // Engine._focusLayer); the network rung only fires when no layer/node is committed.
  ledger: [
    { level: "node",    active: (s) => s.inspectIsNode,    resolver: "ledgerNode" },
    { level: "layer",   active: (s) => s.layerId != null,  resolver: "ledgerLayer" },
    { level: "network", active: (s) => s.filter !== "all", resolver: "ledgerNetwork" },
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
  composition: "view-scoped",
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

// Does this view's ladder have this rung at all? The allow-list read of "is this subject a thing
// here" — the ladder table already says which rungs a view carries, so a consumer asking (e.g. the
// Engine deriving a pick's composition group) reads THAT instead of naming the view.
export function hasLevel(view: View3D, level: FocusLevel): boolean {
  return LADDERS[view].some((r) => r.level === level);
}
