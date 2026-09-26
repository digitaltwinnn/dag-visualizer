import type { MetaInfo, NodeRow } from "@/src/data/types";
import { providerOfRow } from "@/src/data/geoMeasure";

// WHAT A NETWORK ROW COUNTS (user, 2026-09-26: "the hyper view is still missing the new control
// and we should benefit from it there as well"). The Hypergraph explorer's network rows carried
// one figure, the fleet size. This module states the choices, their order and how each is read
// off a network, so the card's heading control (`components/explorer/ExplorerHeading.tsx`) can list them — the
// Geography card's vocabulary turned around: there a country counts its networks and providers,
// here a network counts its countries and providers.
//
// `nodes` is the catalog's own fleet (`MetaInfo.nodes`), the figure of record. The two distinct
// counts read the PLACED rows the Engine publishes for every network (`store.allNodes`, the same
// rows the Geography browser groups by country) — nothing fetched, nothing estimated: a node the
// geolocation could not place counts toward no country and no provider.
//
// A SETTING, not a selection — like `geoMeasure`, it writes its store setter directly.

export type HyperMeasure = "nodes" | "countries" | "providers";

/** The heading control's order. Nodes first: the figure the rows have always led with. */
export const HYPER_MEASURE_ORDER: readonly HyperMeasure[] = ["nodes", "countries", "providers"];

/** The word the heading control shows — what every network row's figure IS. */
export const HYPER_MEASURE_LABELS: Readonly<Record<HyperMeasure, string>> = {
  nodes: "Nodes",
  countries: "Countries",
  providers: "Providers",
};

/** The heading control's list — each measure with the unit its figure is in. */
export const HYPER_MEASURE_OPTIONS: readonly { id: HyperMeasure; label: string; unit: string }[] = HYPER_MEASURE_ORDER.map((id) => ({
  id,
  label: HYPER_MEASURE_LABELS[id],
  unit: "count",
}));


/** The figure a network row shows for `m`: its fleet size, or the distinct countries / providers
 *  among its placed rows. `rows` are the network's own placed rows (the caller groups
 *  `allNodes` by network with `geoMeasure.networkOfRow`). */
export function networkMeasure(m: HyperMeasure, net: Pick<MetaInfo, "nodes">, rows: readonly Pick<NodeRow, "pick" | "cc" | "country">[]): number {
  return m === "nodes" ? net.nodes.length : groupMeasure(m, rows);
}

/** The figure a COMPOSITION row shows for `m` — the same three measures over the group's own
 *  rows, so the pick made at the network level carries down (user, 2026-09-26: "we select
 *  countries but when we select a composition it starts showing nodes again"). A group's nodes
 *  are its rows, so `nodes` is their count. */
export function groupMeasure(m: HyperMeasure, rows: readonly Pick<NodeRow, "pick" | "cc" | "country">[]): number {
  switch (m) {
    case "nodes":
      return rows.length;
    case "countries": {
      const s = new Set<string>();
      for (const r of rows) { const k = r.cc || r.country; if (k) s.add(k); }
      return s.size;
    }
    case "providers": {
      const s = new Set<string>();
      for (const r of rows) { const p = providerOfRow(r); if (p) s.add(p); }
      return s.size;
    }
  }
}
