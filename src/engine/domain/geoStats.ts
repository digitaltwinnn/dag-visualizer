import type { GeoInfo, CountryStat, NodeRow, PickDescriptor } from "@/src/data/types";

// Geo "data" layer, split out of globe.js: per-country tallies and the flat node-browser list.
// These are PURE functions over the Globe's node arrays (`nodes` =
// validators, `metaNodes` = metagraph nodes) — no Three.js / mesh state — so they live on their
// own and globe.js stays focused on the 3D node engine. The Globe keeps thin wrappers that pass
// its arrays in (so the engine's call sites are unchanged).

// Minimal structural shape these pure functions read off a Globe node record — NOT the full
// (much richer) engine node record, which arrives in a later port. `pick` is the node's real
// PickDescriptor (kind-discriminated); only the l0/l1/metanode branches carry `geo`/`node`, so
// reads narrow via `"geo" in pick` / `"node" in pick` rather than assuming the field exists.
export interface GeoStatNode {
  noGeo?: boolean;
  geoPrimary?: boolean; // metaNodes: absent means "primary" (`r.geoPrimary ?? true`)
  metaId?: string; // only set on metaNodes rows
  layer: string;
  pick: PickDescriptor;
}

const geoOf = (pick: PickDescriptor): GeoInfo | undefined => ("geo" in pick ? pick.geo : undefined);
const nodeOf = (pick: PickDescriptor) => ("node" in pick ? pick.node : undefined);

// Tally located nodes by country, keyed per network id so the leaderboard and the distribution
// score can both read one selection out of it:
//   dag — the validator set (the DAG core); <metaId> — one metagraph's nodes;
//   all — the combined validator set (what the unfiltered leaderboard shows).
export function countryTallies(
  nodes: GeoStatNode[],
  metaNodes: GeoStatNode[],
): Record<string, Record<string, CountryStat>> {
  const nets: Record<string, Record<string, CountryStat>> = {};
  const bump = (id: string, g: GeoInfo | undefined) => {
    if (!g || !g.country) return;
    const m = (nets[id] ||= {});
    // `cc` is optional on GeoInfo (the source geo data can be loose) but CountryStat's `cc` is
    // not — mirrors the original JS, which assigned it as-is regardless.
    (m[g.country] ||= { country: g.country, cc: g.cc as string, count: 0 }).count++;
  };
  for (const u of nodes) {
    if (u.noGeo || !u.geoPrimary) continue; // one count per machine (skip hybrid siblings)
    // Validators ARE the DAG core: count each machine once under "dag" and once under "all".
    bump("dag", geoOf(u.pick));
    bump("all", geoOf(u.pick));
  }
  for (const r of metaNodes) if (r.geoPrimary ?? true) bump(r.metaId!, geoOf(r.pick));
  return nets;
}

// Sorted [{ country, cc, count }] for one filter selection — drives the "Nodes by country"
// leaderboard.
export function countryStats(nodes: GeoStatNode[], metaNodes: GeoStatNode[], filter: string): CountryStat[] {
  const m = countryTallies(nodes, metaNodes)[filter];
  return m ? Object.values(m).sort((a, b) => b.count - a.count) : [];
}

// Flat node list for one filter selection — drives the React node browser. Read-only: it just
// surfaces each plotted node's existing `pick` descriptor (so a click reuses the exact same
// inspector card as clicking the node on the globe) plus the few fields the browser groups/sorts
// on. all/dag → validators; <metaId> → that metagraph's nodes.
export function listNodes(nodes: GeoStatNode[], metaNodes: GeoStatNode[], filter: string): NodeRow[] {
  const rows: NodeRow[] = [];
  const push = (pick: PickDescriptor, layer: string) => {
    const g = geoOf(pick) || null;
    const node = nodeOf(pick) || null;
    rows.push({
      pick,
      // Prefer the node ID (the stable identity); fall back to IP/place when absent.
      label: (node && (node.id || node.ip)) || (g && (g.city || g.country)) || "node",
      id: (node && node.id) || null,
      cc: g ? g.cc || null : null,
      country: g ? g.country || null : null,
      city: g ? g.city || null : null,
      state: node ? node.state : null,
      layer,
      // The node's full role set (a hybrid runs several) — so the browser shows every layer it
      // serves, not just the shell it was de-duped into.
      roles: node && node.roles && node.roles.length ? node.roles : [layer],
    });
  };
  if (filter === "all" || filter === "dag") {
    for (const u of nodes) {
      if (u.noGeo || !u.geoPrimary) continue; // one row per machine (skip hybrid siblings)
      push(u.pick, u.layer);
    }
  } else {
    for (const r of metaNodes) {
      if (r.metaId === filter && (r.geoPrimary ?? true)) push(r.pick, r.layer); // one row per node
    }
  }
  return rows;
}
