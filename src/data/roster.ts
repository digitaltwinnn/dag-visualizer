import type { GeoInfo, MetaInfo, NodeRow } from "@/src/data/types";
import { pickNetId } from "@/src/engine/domain/pickActions";
import { coLocatedNetworks, metagraphById } from "@/src/data/network";

// The raw layer's node-roster rows (spec 2026-08-01): a flat, sortable projection of
// `store.selNodes` — the same records the explorers browse, denser. Pure so the sorting/
// derivation is unit-tested; NodeRosterTable feeds it live and owns the column order per view.
export interface RosterRow {
  key: string; // stable render key — the MACHINE (its IP), or the record where no IP is known
  node: NodeRow; // the row's PRIMARY record — what a click commits and a hover glows
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
