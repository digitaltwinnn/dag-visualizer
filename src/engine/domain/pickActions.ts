// The scene CLICK DECISION TABLE — what a click means, per view × pick kind, as pure
// data-in/actions-out logic. The Engine's _handleClick merely resolves the pick (raycast,
// drag suppression, the land-sphere country hit) and then EXECUTES the returned actions in
// order. Extracted (user, 2026-07-11) so the interaction semantics that accumulated across
// the design sessions are TESTED invariants — especially the ORDERING contracts:
//   - a node click sets the network filter FIRST (its store subscription clears any old
//     country drill), then commits the node's own country, then inspect LAST so the
//     node-focus camera flight wins over the network/country framings;
//   - an empty-click country toggle drops a selected node BEFORE moving the drill level
//     (the zoom-level rule: moving between levels deselects the finer one).
import type { Mode } from "@/src/store/store";
import type { PickDescriptor } from "@/src/data/types";

export type ClickAction =
  | { kind: "filter"; id: string }                                              // commit the network filter
  | { kind: "country"; cc: string | null }                                      // commit/clear the country drill
  | { kind: "inspect"; pick: PickDescriptor | null }                            // open/clear the node card
  | { kind: "snapshot"; pick: Extract<PickDescriptor, { kind: "snapshot" }> }   // pin a snapshot (unfollow + card)
  | { kind: "layer"; pick: Extract<PickDescriptor, { kind: "layer" }> | null }  // toggle the layer card
  | { kind: "stopAutoRotate" };                                                 // camera side-effect (geo node zoom)

// The network a node pick belongs to: its metagraph, or the DAG core for a validator.
export const pickNetId = (p: PickDescriptor): string | null =>
  p.kind === "metanode" ? p.meta?.id ?? null : p.kind === "l0" || p.kind === "l1" ? "dag" : null;

export function clickActions(input: {
  mode: Mode;
  // The raycast pick (already drag-suppressed + active-gated by the Engine), or null.
  pick: PickDescriptor | null;
  // The drillable country under the cursor when NOTHING was picked (the Engine resolves the
  // land-sphere hit, policy-gated to geo); null elsewhere/over ocean.
  countryCc: string | null;
  current: { country: string | null; hasInspect: boolean; layerId: string | null };
}): ClickAction[] {
  const { mode, pick: p, countryCc, current } = input;

  // Empty click on a drillable country (geo): toggle its drill — the scene twin of the
  // explorer row. Entering/leaving a country level drops a selected node first.
  if (!p) {
    if (!countryCc) return [];
    const acts: ClickAction[] = [];
    if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
    acts.push({ kind: "country", cc: current.country === countryCc ? null : countryCc });
    return acts;
  }

  // A hub click selects the metagraph (opens its context pane + frames it).
  if (p.kind === "meta") return [{ kind: "filter", id: p.cfg.id }];

  // The ledger's snapshot tile: pin that snapshot (the FollowController only auto-follows
  // the live tip while nothing is selected).
  if (p.kind === "snapshot") return [{ kind: "snapshot", pick: p }];

  // A floor PLANE click = the explore panel's row click: toggle the committed layer.
  if (p.kind === "layer")
    return [{ kind: "layer", pick: current.layerId === p.layerId ? null : p }];

  // A node, in any view: drill the global filter into the node's network and open its card.
  const acts: ClickAction[] = [];
  const netId = pickNetId(p);
  // Geo: the camera will fly to the node — stop the idle rotation under it, and also select
  // the node's COUNTRY (border + firmer land + expanded explorer row beneath the selection).
  if (mode === "geo") acts.push({ kind: "stopAutoRotate" });
  if (netId) acts.push({ kind: "filter", id: netId });
  if (mode === "geo" && "geo" in p && p.geo?.cc) acts.push({ kind: "country", cc: p.geo.cc });
  acts.push({ kind: "inspect", pick: p }); // LAST — the node camera wins (ledger skips the
  // flight store-side: the inspect subscription only flies in geo/hyper).
  return acts;
}
