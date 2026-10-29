import { roleKey } from "@/src/data/composition";

// THE FLEET'S LAYER AND MAKE-UP TALLIES (2026-10-29) — one arithmetic for every network the
// sampler stores, the DAG core included. Before this the loop lived inline in the sampler and ran
// over the metagraphs only: the DAG's nodes reached it as a geo map of addresses, which carries no
// layer, so History's node-type stack and the DAG's layer lines had nothing to read. The DAG's
// nodes now arrive merged from its two clusters (`mergeDagClusters`) and are tallied here exactly
// as a metagraph's are.
//
//   · `perNetLayers[id][role]` — the per-ROLE counts (a hybrid counts once for every layer it runs,
//     so a network's roles overlap); `f.layer.{id}.{role}`.
//   · `perNetTypes[id][key]` — the same nodes by TYPE (`roleKey`): each node counted ONCE under its
//     exact make-up, so a network's types sum to its total; `f.type.{id}.{key}`.
//   · `layers[role]` — the FLEET-WIDE per-role counts, `f.layer.{role}`. Metagraph roles ONLY, as
//     always: adding the validators would step every existing fleet-wide layer line on the day it
//     shipped (user, 2026-10-29). The DAG's own row carries its layers under `perNetLayers.dag`.
//
// `dagNodes` null means the clusters could not be read this sample: the DAG's fields are then
// ABSENT (rule 10 — an honest gap), never zero, and the rest of the fleet is still written.

export interface RoleNode { roles?: string[]; layer?: string | null }

export interface FleetTallies {
  layers: Record<string, number>;
  perNetLayers: Record<string, Record<string, number>>;
  perNetTypes: Record<string, Record<string, number>>;
}

const rolesOf = (n: RoleNode): string[] => (n.roles && n.roles.length ? n.roles : n.layer ? [n.layer] : []);

/** One network's roles and types. */
export function tallyNetwork(nodes: readonly RoleNode[]): { layers: Record<string, number>; types: Record<string, number> } {
  const layers: Record<string, number> = {};
  const types: Record<string, number> = {};
  for (const n of nodes) {
    const k = roleKey(n);
    types[k] = (types[k] || 0) + 1;
    for (const role of rolesOf(n)) layers[role] = (layers[role] || 0) + 1;
  }
  return { layers, types };
}

export function fleetTallies(
  metagraphs: readonly { id: string; nodes: readonly RoleNode[] }[],
  dagNodes: readonly RoleNode[] | null,
): FleetTallies {
  const layers: Record<string, number> = {};
  const perNetLayers: Record<string, Record<string, number>> = {};
  const perNetTypes: Record<string, Record<string, number>> = {};
  for (const m of metagraphs) {
    const t = tallyNetwork(m.nodes);
    perNetLayers[m.id] = t.layers;
    perNetTypes[m.id] = t.types;
    for (const [role, n] of Object.entries(t.layers)) layers[role] = (layers[role] || 0) + n;
  }
  if (dagNodes) {
    const t = tallyNetwork(dagNodes);
    perNetLayers.dag = t.layers;
    perNetTypes.dag = t.types;
  }
  return { layers, perNetLayers, perNetTypes };
}
