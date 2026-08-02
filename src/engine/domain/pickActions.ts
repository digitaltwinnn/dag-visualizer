// The CLICK/SELECT DECISION TABLE — what picking a subject means, per view × pick kind, as
// pure data-in/actions-out logic. TWO kinds of caller execute it:
//   - the Engine's _handleClick (scene raycast clicks) via clickActions();
//   - the React components' handlers (GeoExplore's country/node rows, LiveStrip's bars) via
//     the named builders below — so the scene and the panels can never drift in semantics.
// The ORDERING contracts are tested invariants:
//   - selecting a node sets the network filter FIRST (its store subscription clears any old
//     country drill), then commits the node's own country AND cohort (full-ancestry rule,
//     spec Part 3 — every rung above the node commits so a deselect steps back down the same
//     ladder regardless of how the node was reached), then inspect LAST so the node-focus
//     camera flight wins over the network/country/cohort framings;
//   - a zoom-level toggle (country, cohort) drops every FINER rung first (moving between
//     levels deselects the finer ones); the "ladder-derived stepping" tests assert this
//     matches `domain/focusLadder.ts`'s finerLevels() exactly, so pickActions can't drift
//     from the ladder even though the drop list is hand-written per builder.
import type { Mode } from "@/src/store/store";
import type { PickDescriptor } from "@/src/data/types";
import type { CohortSel, CompositionSel } from "./focusLadder";

export type ClickAction =
  | { kind: "filter"; id: string }                                             // commit the network filter
  | { kind: "country"; cc: string | null }                                     // commit/clear the country drill
  | { kind: "cohort"; sel: CohortSel | null }                                  // commit/clear the city×provider cohort (geo)
  | { kind: "composition"; sel: CompositionSel | null }                        // commit/clear the composition group (hyper)
  | { kind: "inspect"; pick: PickDescriptor | null }                           // open/clear the node card
  // Select a snapshot (follow decides pin vs heartbeat) — or CLEAR it (pick null, follow
  // omitted: the follow state is untouched; FollowController owns the re-follow).
  | { kind: "snapshot"; pick: Extract<PickDescriptor, { kind: "snapshot" }> | null; follow?: boolean }
  | { kind: "layer"; pick: Extract<PickDescriptor, { kind: "layer" }> | null }; // commit/clear the layer card

// The network a node pick belongs to: its metagraph, or the DAG core for a validator.
export const pickNetId = (p: PickDescriptor): string | null =>
  p.kind === "metanode" ? p.meta?.id ?? null : p.kind === "l0" || p.kind === "l1" ? "dag" : null;

// Whether a pick participates in hover/click AT ALL — the per-view activity gate the Engine
// applies to every raycast hit before it reaches clickActions/tooltips.
//  - A registered-but-node-less metagraph hub is shown (dim) but never selectable, matching
//    its inactive look + its "registered · no live nodes" filter chip (`activeMetaIds` null =
//    counts not loaded yet → all allowed).
//  - GEO: off-filter nodes are genuinely hidden, so they must not respond either (Three's
//    raycaster ignores `visible`); the country drill is a LENS, so it does NOT gate picking.
//  - HYPER (and elsewhere): every node stays interactive — off-focus ones are only dimmed,
//    and clicking one drills into its network (gating them out read as a bug).
export function pickActive(
  p: PickDescriptor,
  mode: Mode,
  filter: string,
  activeMetaIds: ReadonlySet<string> | null,
): boolean {
  if (p.kind === "meta") return !activeMetaIds || activeMetaIds.has(p.cfg.id);
  if (mode !== "geo") return true;
  const id = p.kind === "l0" || p.kind === "l1" ? "dag" : p.kind === "metanode" ? p.meta?.id : undefined;
  if (id === undefined) return true; // non-node picks (snapshot/layer) are view-gated by pickSources
  return filter === "all" || filter === id;
}

// The country zoom-level TOGGLE — shared by the scene's empty-click-on-a-country and
// GeoExplore's country row (`drill`). Entering/leaving a country level drops the finer rungs
// first (the zoom-level rule — finerLevels("geo","country") = ["node","cohort"]): a selected
// node, then a committed cohort.
export function countryToggleActions(
  cc: string,
  current: { country: string | null; hasInspect: boolean; cohort: CohortSel | null },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  if (current.cohort) acts.push({ kind: "cohort", sel: null });
  acts.push({ kind: "country", cc: current.country === cc ? null : cc });
  return acts;
}

// Cohort identity — cc+city+isp (all three; city/isp may be null and must match as null).
export const sameCohort = (a: CohortSel | null, b: CohortSel | null): boolean =>
  !!a && !!b && a.cc === b.cc && a.city === b.city && a.isp === b.isp;

// The cohort/provider zoom-level TOGGLE (spec Part 4) — GeoExplore's cohort row. Entering/
// leaving the cohort level drops the finer node selection first (finerLevels("geo","cohort")).
export function cohortToggleActions(
  c: CohortSel,
  current: { cohort: CohortSel | null; hasInspect: boolean },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  acts.push({ kind: "cohort", sel: sameCohort(current.cohort, c) ? null : c });
  return acts;
}

// Composition-group identity — network + group key (the `${label}|${codes}` HyperExplore builds).
export const sameComposition = (a: CompositionSel | null, b: CompositionSel | null): boolean =>
  !!a && !!b && a.netId === b.netId && a.key === b.key;

// The COMPOSITION zoom-level TOGGLE (user, 2026-08-02) — HyperExplore's group row. A group is
// network-scoped, so the row commits its NETWORK first (only when it changes, the no-churn rule;
// the Engine's filter subscription clears every finer rung, which is why the composition commit
// must come after it), then drops the finer node selection (finerLevels("hyper","composition")),
// then commits the group itself. Re-clicking the committed group clears it — one toggle language.
export function compositionToggleActions(
  c: CompositionSel,
  current: { composition: CompositionSel | null; hasInspect: boolean; filter: string },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (c.netId !== current.filter) acts.push({ kind: "filter", id: c.netId });
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  acts.push({ kind: "composition", sel: sameComposition(current.composition, c) ? null : c });
  return acts;
}

// Selecting a NODE — shared by the scene node click and GeoExplore's node row (`selectNode`).
// Drills the global filter into the node's network (only when it actually changes — no churn),
// selects the node's full geo ANCESTRY in geo (country + cohort — border/firmer land/expanded
// explorer rows beneath the selection) or its ledger LAYER ancestry in ledger, and sets inspect
// LAST so the node camera wins the flight. Full-ancestry rule (spec Part 3): committing every
// rung above the node means a deselect steps back down the SAME ladder regardless of how the
// node was reached (scene click, explorer row, or a jump straight from "all"). `deselect` is
// the row's re-click toggle (one toggle language everywhere — the × on the card does the
// same); a scene click never deselects.
export function nodeSelectActions(
  p: PickDescriptor,
  opts: {
    mode: Mode;
    currentFilter: string;
    deselect?: boolean;
    ledgerLayerId?: string | null;
    /** HYPER ancestry: the composition group the node belongs to (the explorer row's parent
     *  group, or the one the Engine derives for a scene click). Same role `ledgerLayerId` plays
     *  in ledger — the caller resolves it, because the group vocabulary lives in the data layer. */
    compositionSel?: CompositionSel | null;
  },
): ClickAction[] {
  if (opts.deselect) return [{ kind: "inspect", pick: null }];
  const acts: ClickAction[] = [];
  const netId = pickNetId(p);
  if (netId && netId !== opts.currentFilter) acts.push({ kind: "filter", id: netId });
  if (opts.mode === "hyper" && opts.compositionSel) acts.push({ kind: "composition", sel: opts.compositionSel });
  if (opts.mode === "geo" && "geo" in p && p.geo?.cc) {
    acts.push({ kind: "country", cc: p.geo.cc });
    // Full-ancestry rule (spec Part 3): the node's cohort commits too, so deselect steps
    // node → cohort → country → network regardless of how the node was reached.
    acts.push({ kind: "cohort", sel: { cc: p.geo.cc, city: p.geo.city ?? null, isp: p.geo.isp ?? null } });
  }
  if (opts.mode === "ledger") {
    // Ledger ancestry: the browser row's parent floor, else the node's related-L0 floor
    // (the same mapping the view-entry auto-commit uses).
    const layerId = opts.ledgerLayerId ?? autoLayerForNode(p.kind);
    if (layerId) acts.push({ kind: "layer", pick: { kind: "layer", layerId } });
  }
  acts.push({ kind: "inspect", pick: p });
  return acts;
}

// The layer TOGGLE — shared by the scene's floor-plane click and LedgerPanel's rows: commit
// the clicked layer, or clear when it's already the committed one.
export function layerToggleActions(
  p: Extract<PickDescriptor, { kind: "layer" }>,
  currentLayerId: string | null,
): ClickAction[] {
  return [{ kind: "layer", pick: currentLayerId === p.layerId ? null : p }];
}

// A selected NODE entering the Snapshots view auto-commits its RELATED L0 layer (user,
// 2026-07-17) so the camera arrives on the settlement row the node belongs to: a metagraph
// node → the metagraph-L0 row, a DAG validator (either shell) → the hypergraph-L0 row.
// null = no node selected / not a node pick → no auto-selection (the resting overview).
export function autoLayerForNode(kind: PickDescriptor["kind"] | null | undefined): "ml0" | "hypl0" | null {
  if (kind === "metanode") return "ml0";
  if (kind === "l0" || kind === "l1") return "hypl0";
  return null;
}

// The network-filter TOGGLE — the FilterPicker's committed-row rule: picking the committed
// metagraph again steps back to "all" (one toggle language everywhere); "all" itself never
// toggles off.
export function filterToggleActions(id: string, currentFilter: string): ClickAction[] {
  return [{ kind: "filter", id: id !== "all" && id === currentFilter ? "all" : id }];
}

// The rail-controls CLEAR-ALL — one sweep back to the "all" overview: drop every committed
// rung finest→coarsest (mirroring the ladder's deselect stepping), the snapshot pin included
// (pick null, no `follow` — re-following stays with the FollowController, like every snapshot
// clear). Each channel is gated so an already-clear one emits no action (no store churn).
export function clearAllActions(current: {
  hasInspect: boolean;
  hasSnap: boolean;
  cohort: CohortSel | null;
  composition: CompositionSel | null;
  country: string | null;
  layerId: string | null;
  filter: string;
}): ClickAction[] {
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  if (current.hasSnap) acts.push({ kind: "snapshot", pick: null });
  if (current.cohort) acts.push({ kind: "cohort", sel: null });
  if (current.composition) acts.push({ kind: "composition", sel: null });
  if (current.country) acts.push({ kind: "country", cc: null });
  if (current.layerId) acts.push({ kind: "layer", pick: null });
  if (current.filter !== "all") acts.push({ kind: "filter", id: "all" });
  return acts;
}

// Selecting a SNAPSHOT — shared by the ledger's tile click and LiveStrip's bar click:
// clicking the LIVE tip (re-)follows the heartbeat; anything older pins that snapshot
// (the FollowController only auto-advances while following).
export function snapshotSelectActions(
  p: Extract<PickDescriptor, { kind: "snapshot" }>,
  isLiveTip: boolean,
): ClickAction[] {
  return [{ kind: "snapshot", pick: p, follow: isLiveTip }];
}

export function clickActions(input: {
  mode: Mode;
  // The raycast pick (already drag-suppressed + pickActive-gated by the Engine), or null.
  pick: PickDescriptor | null;
  // The drillable country under the cursor when NOTHING was picked (the Engine resolves the
  // land-sphere hit, policy-gated to geo); null elsewhere/over ocean.
  countryCc: string | null;
  // HYPER only: the composition group the picked node belongs to, resolved by the Engine (the
  // group vocabulary lives in the data layer) — the node's ancestry rung, like the ledger floor.
  compositionSel?: CompositionSel | null;
  current: { filter: string; country: string | null; hasInspect: boolean; layerId: string | null; cohort: CohortSel | null };
}): ClickAction[] {
  const { mode, pick: p, countryCc, current } = input;

  // Empty click on a drillable country: toggle its drill — the scene twin of the explorer
  // row. Mode-gated here TOO (the Engine only resolves countryCc in geo, but the table stays
  // safe on its own).
  if (!p) return mode === "geo" && countryCc ? countryToggleActions(countryCc, current) : [];

  // A hub click selects the metagraph (opens its context pane + frames it).
  if (p.kind === "meta") return [{ kind: "filter", id: p.cfg.id }];

  // The ledger's snapshot tile: a scene tile is never the strip's live tip — always pin.
  if (p.kind === "snapshot") return snapshotSelectActions(p, false);

  // A floor PLANE click = the explore panel's row click: toggle the committed layer.
  if (p.kind === "layer") return layerToggleActions(p, current.layerId);

  // A node, in any view. (No autoRotate action: geo disables the controls' rotation at mode
  // entry and the inspect subscription re-asserts it on the node flight.)
  return nodeSelectActions(p, { mode, currentFilter: current.filter, compositionSel: input.compositionSel });
}
