import type { GeoInfo, NodeRow } from "@/src/data/types";
import { pickNetId } from "@/src/engine/domain/pickActions";

// The section-2 node-roster rows (spec 2026-08-01): a flat, sortable projection of
// `store.selNodes` — the same records the explorers browse, denser. Pure so the sorting/
// derivation is unit-tested; NodeRosterTable feeds it live and owns the column order per view.
export interface RosterRow {
  key: string; // stable render key — the node id when present, else label+index
  node: NodeRow;
  netId: string | null; // "dag" | metagraph id (identity-hue + name lookup)
  isp: string | null;
  asn: string | null;
}

export type RosterSortKey = "net" | "id" | "layer" | "country" | "city" | "isp";

export function buildRoster(selNodes: readonly NodeRow[]): RosterRow[] {
  return selNodes.map((node, i) => {
    const geo: GeoInfo | undefined = "geo" in node.pick ? node.pick.geo : undefined;
    return {
      key: node.id ?? `${node.label}#${i}`,
      node,
      netId: pickNetId(node.pick),
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
