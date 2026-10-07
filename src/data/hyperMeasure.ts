import type { MetaInfo, NodeRow } from "@/src/data/types";
import { ROLE_SHORT } from "@/src/data/composition";

// WHAT A NETWORK ROW COUNTS in the Hypergraph explorer — the heading control's choices, their
// order and how each is read off a network (`components/explorer/ExplorerHeading.tsx` lists them).
//
// THE VIEW IS THE ARCHITECTURE, SO ITS FIGURES COUNT WHAT A NETWORK IS BUILT OF (user, 2026-10-07:
// "in hyper showing country counts doesn't really have anything to do with that view"): its nodes,
// and its nodes per layer — L0 seals its snapshots, cL1 validates its transactions, dL1 its data
// updates. Countries and providers were Geography's questions and live there (`geoMeasure`).
//
// `nodes` is the catalog's own fleet (`MetaInfo.nodes`), the figure of record. The layer counts
// read the rows the Engine publishes for every network (`store.allNodes`) — nothing fetched, nothing
// estimated — and count a NODE once however many of its layer rows are listed (a hybrid appears
// once per layer it runs).
//
// A SETTING, not a selection — like `geoMeasure`, it writes its store setter directly.

export type HyperMeasure = "nodes" | "l0" | "cl1" | "dl1";

/** The heading control's order: nodes first, then the layers in the vocabulary's own order. */
export const HYPER_MEASURE_ORDER: readonly HyperMeasure[] = ["nodes", "l0", "cl1", "dl1"];

/** The word the heading control shows — the layer CODES the chips already use (ROLE_SHORT). */
export const HYPER_MEASURE_LABELS: Readonly<Record<HyperMeasure, string>> = {
  nodes: "Nodes",
  l0: ROLE_SHORT.l0,
  cl1: ROLE_SHORT.cl1,
  dl1: ROLE_SHORT.dl1,
};

/** The heading control's list — every measure counts nodes. */
export const HYPER_MEASURE_OPTIONS: readonly { id: HyperMeasure; label: string; unit: string }[] = HYPER_MEASURE_ORDER.map((id) => ({
  id,
  label: HYPER_MEASURE_LABELS[id],
  unit: "nodes",
}));

type MeasuredRow = Pick<NodeRow, "pick" | "roles" | "id" | "label">;

/** A node's identity across its layer rows: its IP where the pick has one, else its id. */
const nodeKey = (r: MeasuredRow): string => ("node" in r.pick ? r.pick.node?.ip : null) ?? r.id ?? r.label;

/** The distinct nodes among `rows` that run `layer`. */
function nodesRunning(layer: string, rows: readonly MeasuredRow[]): number {
  const s = new Set<string>();
  for (const r of rows) if (r.roles?.includes(layer)) s.add(nodeKey(r));
  return s.size;
}

/** The figure a network row shows for `m`: its fleet size, or how many of its nodes run that
 *  layer. `rows` are the network's own rows (the caller groups `allNodes` by network). */
export function networkMeasure(m: HyperMeasure, net: Pick<MetaInfo, "nodes">, rows: readonly MeasuredRow[]): number {
  return m === "nodes" ? net.nodes.length : nodesRunning(m, rows);
}

/** The figure a COMPOSITION row shows for `m` — the same measures over the group's own rows, so
 *  the pick made at the network level carries down. A group's nodes are its rows. */
export function groupMeasure(m: HyperMeasure, rows: readonly MeasuredRow[]): number {
  return m === "nodes" ? rows.length : nodesRunning(m, rows);
}
