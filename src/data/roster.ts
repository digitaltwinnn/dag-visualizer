import type { GeoInfo, MetaInfo, NodeRow } from "@/src/data/types";
import { pickNetId } from "@/src/engine/domain/pickActions";
import { coLocatedNetworks, metagraphById } from "@/src/data/network";

// The raw layer's node-roster rows (spec 2026-08-01): a flat, sortable projection of
// `store.selNodes` — the same records the explorers browse, denser. Pure so the sorting/
// derivation is unit-tested; NodeRosterTable feeds it live and owns the column order per view.
export interface RosterRow {
  key: string; // stable render key — network + node + layer, disambiguated only on a real collision
  node: NodeRow;
  netId: string | null; // "dag" | metagraph id (identity-hue + name lookup)
  netName: string | null; // the DISPLAYED network name — what the Network column sorts on
  isp: string | null;
  asn: string | null;
  colo: string | null; // co-located networks' names, joined — null for a single-tenant machine (sorts last)
}

export type RosterSortKey = "net" | "id" | "layer" | "country" | "city" | "isp" | "colo";

export function buildRoster(selNodes: readonly NodeRow[], metaList: readonly MetaInfo[] = []): RosterRow[] {
  // The key is the row's own IDENTITY, not its position: under the "all" filter the same machine
  // appears once per network it serves and both rows report the same node id, so the network and
  // layer join it. A bare index suffix would have done the same job, but it re-keys every row
  // after a removal — a filter change would remount the whole table instead of the rows that
  // actually changed. A leftover duplicate (same network, node and layer) still gets a counter.
  const seen = new Map<string, number>();
  return selNodes.map((node) => {
    const geo: GeoInfo | undefined = "geo" in node.pick ? node.pick.geo : undefined;
    const netId = pickNetId(node.pick);
    const base = `${netId ?? "?"}|${node.id ?? node.label}|${node.layer ?? ""}`;
    const dup = seen.get(base) ?? 0;
    seen.set(base, dup + 1);
    return {
      key: dup === 0 ? base : `${base}#${dup}`,
      node,
      netId,
      // Resolved HERE, once per row, because the sort must order what the column SHOWS. Sorting
      // on the raw netId ordered the state-channel ADDRESSES — hidden hex, so "Network ↑" came
      // out in an order corresponding to nothing on screen (found live 2026-08-13).
      netName: netId ? (metagraphById(netId)?.name ?? netId) : null,
      isp: geo?.isp ?? null,
      asn: geo?.asn ?? null,
      // CO-LOCATION (user, 2026-08-16 — "easily spot those two"): the machine's other tenant
      // networks, from the one home in network.ts. Null (not "none") when single-tenant so the
      // column sorts its rare positives together and the table shows a quiet dash.
      colo:
        coLocatedNetworks("node" in node.pick ? node.pick.node?.ip : undefined, netId, metaList)
          .map((c) => c.name)
          .join(", ") || null,
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
  colo: (r) => r.colo,
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
