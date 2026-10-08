import type { GeoInfo, MetaInfo, NodeRow } from "@/src/data/types";
import { pickNetId } from "@/src/engine/domain/pickActions";
import { coLocatedNetworks, metagraphById } from "@/src/data/network";

// The raw layer's node-roster rows (spec 2026-08-01): a flat, sortable projection of
// `store.selNodes` — the same records the explorers browse, denser. Pure so the sorting/
// derivation is unit-tested; NodeRosterTable feeds it live and owns the column order per view.
export interface RosterRow {
  key: string; // stable render key — the MACHINE (its IP), or the record where no IP is known
  node: NodeRow; // the row's PRIMARY record — what a click commits and a hover glows
  /** Every record merged into this row, primary first — a selection of ANY of them is this row's. */
  recs: NodeRow[];
  netId: string | null; // the primary network ("dag" | metagraph id)
  netName: string | null; // the DISPLAYED primary ticker — what the Network column sorts on
  /** EVERY network on this machine, primary first: the records merged into this row, then any
   *  co-tenant the catalog places at the same IP that the current list does not show (a committed
   *  filter). One home for co-location — `coLocatedNetworks`, the explorer's own rule. */
  nets: string[];
  /** The distinct node ids merged into this row, primary first. Almost always one: a machine
   *  serving two networks reports the same id to both. */
  ids: string[];
  /** The union of the merged records' roles — what this machine RUNS. */
  roles: string[];
  isp: string | null;
  asn: string | null;
}

export type RosterSortKey = "net" | "id" | "layer" | "country" | "city" | "isp";

const ipOf = (n: NodeRow): string | null | undefined => ("node" in n.pick ? n.pick.node?.ip : undefined);

export function buildRoster(selNodes: readonly NodeRow[], metaList: readonly MetaInfo[] = []): RosterRow[] {
  // ONE ROW PER MACHINE (user, 2026-09-29: "I want it consistent" — the explorer's node rows show a
  // co-located machine as "UP DAG", while this table listed it twice, once per network). The
  // machine is its IP — the SAME key co-location is found by everywhere (`coLocatedNetworks`) and
  // the composition counts group by (`machineKey`), so the table can never merge what the explorer
  // calls two machines, or split what it calls one. A record with no IP is its own machine: without
  // the address there is no evidence two records share hardware, and a shared id is not that.
  //
  // The key is the row's IDENTITY, not its position, so a filter change remounts only the rows
  // that actually changed. An IP-less duplicate record (same network, node and layer) still gets
  // a counter.
  const groups = new Map<string, NodeRow[]>();
  const seen = new Map<string, number>();
  for (const node of selNodes) {
    const ip = ipOf(node);
    let key: string;
    if (ip) key = `ip:${ip}`;
    else {
      const base = `${pickNetId(node.pick) ?? "?"}|${node.id ?? node.label}|${node.layer ?? ""}`;
      const dup = seen.get(base) ?? 0;
      seen.set(base, dup + 1);
      key = dup === 0 ? base : `${base}#${dup}`;
    }
    const g = groups.get(key);
    if (g) g.push(node);
    else groups.set(key, [node]);
  }
  return [...groups].map(([key, recs]) => {
    // The PRIMARY is the metagraph's record where the machine also serves the DAG — the row reads
    // "UP DAG", the explorer's order: the tenant that makes the machine notable leads.
    const node = recs.find((r) => pickNetId(r.pick) !== "dag") ?? recs[0]!;
    const netId = pickNetId(node.pick);
    const nets: string[] = [];
    const add = (id: string | null) => {
      if (id && !nets.includes(id)) nets.push(id);
    };
    add(netId);
    for (const r of recs) add(pickNetId(r.pick));
    for (const c of coLocatedNetworks(ipOf(node), netId, metaList)) add(c.id);
    const ids: string[] = [];
    for (const r of [node, ...recs]) {
      const id = r.id ?? r.label;
      if (!ids.includes(id)) ids.push(id);
    }
    const roles = [...new Set(recs.flatMap((r) => r.roles ?? []))];
    const geo: GeoInfo | undefined = "geo" in node.pick ? node.pick.geo : undefined;
    return {
      key,
      node,
      recs: [node, ...recs.filter((r) => r !== node)],
      netId,
      // Resolved HERE, once per row, because the sort must order what the column SHOWS. Sorting
      // on the raw netId ordered the state-channel ADDRESSES — hidden hex, so "Network ↑" came
      // out in an order corresponding to nothing on screen (found live 2026-08-13).
      // The cell shows TICKERS (2026-09-29), so the sort orders tickers.
      netName: netId ? (metagraphById(netId)?.ticker || metagraphById(netId)?.name || (netId === "dag" ? "DAG" : netId)) : null,
      nets,
      ids,
      roles,
      isp: geo?.isp ?? null,
      asn: geo?.asn ?? null,
    };
  });
}

const FIELD: Record<RosterSortKey, (r: RosterRow) => string | null> = {
  net: (r) => r.netName,
  id: (r) => r.node.id ?? r.node.label,
  layer: (r) => r.node.layer,
  country: (r) => r.node.country,
  city: (r) => r.node.city,
  isp: (r) => r.isp,
};

// Stable copy-sort; null/empty values sort LAST regardless of direction (an unknown city is
// not "before A", it's absent).
export function sortRoster(rows: readonly RosterRow[], key: RosterSortKey, dir: 1 | -1): RosterRow[] {
  const get = FIELD[key];
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va.localeCompare(vb) * dir;
  });
}

/** One country's nodes in the phone Geography roster. `country` is null for the unlocated. */
export interface RosterCountryGroup {
  key: string;
  country: string | null;
  rows: RosterRow[];
}

/** THE GEOGRAPHY ROSTER IS GROUPED BY COUNTRY ON PHONE (user, 2026-10-08, design E1 —
 *  `docs/superpowers/design/2026-10-08-mobile-tuning/e-geo.html`): the view's question is WHERE,
 *  so each country is a plate with its node count and its rows lead with the city. Countries run
 *  busiest first (the explorer's order), ties by name; rows inside by city, then provider; the
 *  unlocated close the list rather than pretend to a place. */
export function groupRosterByCountry(rows: readonly RosterRow[]): RosterCountryGroup[] {
  const by = new Map<string, RosterCountryGroup>();
  for (const r of rows) {
    const key = r.node.country ?? "";
    let g = by.get(key);
    if (!g) by.set(key, (g = { key: key || "unlocated", country: r.node.country ?? null, rows: [] }));
    g.rows.push(r);
  }
  const groups = [...by.values()];
  for (const g of groups) g.rows = sortRoster(sortRoster(g.rows, "isp", 1), "city", 1);
  return groups.sort((a, b) => {
    if ((a.country == null) !== (b.country == null)) return a.country == null ? 1 : -1;
    return b.rows.length - a.rows.length || (a.country ?? "").localeCompare(b.country ?? "");
  });
}

/** One network's nodes in the phone Hypergraph roster — each entry the machine's row plus the
 *  record and roles it has IN THIS network. */
export interface RosterNetworkGroup {
  netId: string;
  entries: { row: RosterRow; rec: NodeRow; roles: string[] }[];
}

/** THE HYPERGRAPH ROSTER IS GROUPED BY NETWORK ON PHONE (user, 2026-10-08, design F1 —
 *  `docs/superpowers/design/2026-10-08-mobile-tuning/f-hyper.html`): the view's question is what
 *  each node IS in the architecture, so each network is a plate and its rows lead with the layers
 *  the node runs there. A machine serving two networks appears under each, as the scene draws it
 *  under each hub — with THAT network's record and roles, so a DAG validator that also hosts a
 *  metagraph reads as a validator under DAG. Only networks the machine's own records name group it:
 *  a catalog co-tenant the current list does not show (a committed filter) adds no plate. The DAG
 *  core leads, then the metagraphs busiest first, ties by ticker; rows inside by node id. */
export function groupRosterByNetwork(rows: readonly RosterRow[]): RosterNetworkGroup[] {
  const by = new Map<string, RosterNetworkGroup>();
  for (const row of rows) {
    const perNet = new Map<string, NodeRow[]>();
    for (const rec of row.recs) {
      const id = pickNetId(rec.pick);
      if (!id) continue;
      const list = perNet.get(id);
      if (list) list.push(rec);
      else perNet.set(id, [rec]);
    }
    for (const [netId, recs] of perNet) {
      let g = by.get(netId);
      if (!g) by.set(netId, (g = { netId, entries: [] }));
      g.entries.push({ row, rec: recs[0]!, roles: [...new Set(recs.flatMap((r) => r.roles ?? []))] });
    }
  }
  const tick = (id: string) => metagraphById(id)?.ticker || metagraphById(id)?.name || (id === "dag" ? "DAG" : id);
  const groups = [...by.values()];
  for (const g of groups) g.entries.sort((a, b) => (a.rec.id ?? a.rec.label).localeCompare(b.rec.id ?? b.rec.label));
  return groups.sort((a, b) => {
    if ((a.netId === "dag") !== (b.netId === "dag")) return a.netId === "dag" ? -1 : 1;
    return b.entries.length - a.entries.length || tick(a.netId).localeCompare(tick(b.netId));
  });
}
