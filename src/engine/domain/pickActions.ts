// The CLICK/SELECT DECISION TABLE — what picking a subject means, per view × pick kind, as
// pure data-in/actions-out logic. TWO kinds of caller execute it:
//   - the Engine's _handleClick (scene raycast clicks) via clickActions();
//   - the React components' handlers (GeoExplore's country/node rows, LiveStrip's bars) via
//     the named builders below — so the scene and the panels can never drift in semantics.
// The ORDERING contracts are tested invariants:
//   - selecting a node sets the network filter FIRST (its store subscription clears any old
//     country drill), then commits the node's own country, then inspect LAST so the
//     node-focus camera flight wins over the network/country framings;
//   - the country toggle drops a selected node BEFORE moving the drill level (the zoom-level
//     rule: moving between levels deselects the finer one).
import type { Mode } from "@/src/store/store";
import type { PickDescriptor } from "@/src/data/types";

export type ClickAction =
  | { kind: "filter"; id: string }                                             // commit the network filter
  | { kind: "country"; cc: string | null }                                     // commit/clear the country drill
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
// GeoExplore's country row (`drill`). Entering/leaving a country level drops a selected node
// first (the zoom-level rule).
export function countryToggleActions(
  cc: string,
  current: { country: string | null; hasInspect: boolean },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  acts.push({ kind: "country", cc: current.country === cc ? null : cc });
  return acts;
}

// Selecting a NODE — shared by the scene node click and GeoExplore's node row (`selectNode`).
// Drills the global filter into the node's network (only when it actually changes — no churn),
// selects the node's COUNTRY in geo (border + firmer land + expanded explorer row beneath the
// selection), and sets inspect LAST so the node camera wins the flight. `deselect` is the
// row's re-click toggle (one toggle language everywhere — the × on the card does the same);
// a scene click never deselects.
export function nodeSelectActions(
  p: PickDescriptor,
  opts: { mode: Mode; currentFilter: string; deselect?: boolean },
): ClickAction[] {
  if (opts.deselect) return [{ kind: "inspect", pick: null }];
  const acts: ClickAction[] = [];
  const netId = pickNetId(p);
  if (netId && netId !== opts.currentFilter) acts.push({ kind: "filter", id: netId });
  if (opts.mode === "geo" && "geo" in p && p.geo?.cc) acts.push({ kind: "country", cc: p.geo.cc });
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
  current: { filter: string; country: string | null; hasInspect: boolean; layerId: string | null };
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
  return nodeSelectActions(p, { mode, currentFilter: current.filter });
}
