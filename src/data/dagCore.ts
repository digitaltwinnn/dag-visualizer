import type { ClusterNode } from "@/src/data/types";

// THE DAG'S TWO CLUSTERS AS ONE NODE LIST (2026-10-29, moved out of `NetworkData._buildDagCore` so
// the trends sampler reads the DAG's make-ups by the same rule the live Hypergraph draws them).
// The global L0 and the DAG's L1 cluster lists are merged by node `id`, turning the DAG into the
// same hybrid/dedicated structure a metagraph has: a validator in both clusters is ONE hybrid node
// (`roles: ["l0", "cl1"]`), not two. Measured live 2026-10-29: every id the two clusters share
// sits on one IP, so merging by id and by address count the same nodes.

/** One of the DAG's own nodes: its roles (`l0` first), and `layer` the primary one for plotting. */
export interface DagNode {
  id: string;
  ip: string;
  state?: string;
  roles: string[];
  layer: string;
}

export function mergeDagClusters(l0: readonly ClusterNode[], l1: readonly ClusterNode[]): DagNode[] {
  const byId = new Map<string, { id: string; ip: string; state?: string; roles: string[] }>();
  const merge = (list: readonly ClusterNode[], role: string) => {
    for (const n of list) {
      if (!n || !n.id) continue;
      let e = byId.get(n.id);
      if (!e) { e = { id: n.id, ip: n.ip, state: n.state, roles: [] }; byId.set(n.id, e); }
      if (!e.roles.includes(role)) e.roles.push(role);
      if (!e.ip && n.ip) e.ip = n.ip;
      if (role === "l0" && n.state) e.state = n.state; // prefer the consensus-layer state
    }
  };
  merge(l0, "l0");  // consensus / settlement
  merge(l1, "cl1"); // the DAG's L1 IS its $DAG currency-L1 (it has no data-L1)
  const nodes: DagNode[] = [...byId.values()].map((e) => {
    e.roles.sort((a, b) => (a === "l0" ? 0 : 1) - (b === "l0" ? 0 : 1));
    return { ...e, layer: e.roles[0]! }; // primary layer for plotting (l0 if present, else cl1)
  });
  // CANONICAL ORDER — cluster/info returns peers in an unstable order, and the scene places
  // nodes by list INDEX (armillary ring slots, honeycomb stacks). Without this, the 25s
  // membership poll could reshuffle indices and visibly SNAP every node to a new ring
  // position mid-rotation (user bug).
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return nodes;
}
