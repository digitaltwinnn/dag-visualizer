import type { GeoInfo, NodeRow } from "@/src/data/types";
import { pickNetId } from "@/src/engine/domain/pickActions";

// The raw layer's node-roster rows (spec 2026-08-01): a flat, sortable projection of
// `store.selNodes` — the same records the explorers browse, denser. Pure so the sorting/
// derivation is unit-tested; NodeRosterTable feeds it live and owns the column order per view.
export interface RosterRow {
  key: string; // stable render key — network + node + layer, disambiguated only on a real collision
  node: NodeRow;
  netId: string | null; // "dag" | metagraph id (identity-hue + name lookup)
  isp: string | null;
  asn: string | null;
}

export type RosterSortKey = "net" | "id" | "layer" | "country" | "city" | "isp";

export function buildRoster(selNodes: readonly NodeRow[]): RosterRow[] {
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
      isp: geo?.isp ?? null,
      asn: geo?.asn ?? null,
    };
  });
}

const FIELD: Record<RosterSortKey, (r: RosterRow) => string | null> = {
  net: (r) => r.netId,
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
