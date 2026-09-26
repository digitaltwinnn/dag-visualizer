import type { NodeRow } from "@/src/data/types";

// WHAT A COUNTRY ROW COUNTS (user, 2026-09-26: "can the geo explorer also benefit from the new
// control — besides 'nodes' show 'metagraphs', 'providers'"). The Geography explorer's country
// rows carried one figure, the footprint's node count, with a bar scaled to the busiest country.
// This module states the choices, their order and how each is read off a country's rows, so the
// card's heading control (`components/explorer/ExplorerHeading.tsx`) can list them and the bar and the figure can
// never disagree about what they measure.
//
// Every measure is a FACT ABOUT THE COUNTRY'S PLACED NODES — the rows the browser already holds
// (`store.selNodes`, grouped by country): how many there are, how many distinct networks they
// serve, how many distinct providers host them. Nothing is fetched and nothing is estimated; a
// country whose rows carry no provider simply counts none.
//
// A SETTING, not a selection — like `trendMetric` and `ledgerMeasure`, it writes its store setter
// directly and stays outside the click decision table.

export type GeoMeasure = "nodes" | "metagraphs" | "providers";

/** The heading control's order. Nodes first: the figure the rows have always led with. */
export const GEO_MEASURE_ORDER: readonly GeoMeasure[] = ["nodes", "metagraphs", "providers"];

/** The word the heading control shows — what every country row's figure and bar ARE. */
export const GEO_MEASURE_LABELS: Readonly<Record<GeoMeasure, string>> = {
  nodes: "Nodes",
  metagraphs: "Metagraphs",
  providers: "Providers",
};

/** The heading control's list — each measure with the unit its figure is in. */
export const GEO_MEASURE_OPTIONS: readonly { id: GeoMeasure; label: string; unit: string }[] = GEO_MEASURE_ORDER.map((id) => ({
  id,
  label: GEO_MEASURE_LABELS[id],
  unit: "count",
}));

/** A COHORT's measures — the second level of the Geography explorer (design 2026-09-26: each
 *  level has its own measures). A city × provider cohort counts its nodes, or the distinct
 *  networks they serve; there is no third: every node in a cohort shares one provider. */
export type CohortMeasure = "nodes" | "metagraphs";
export const COHORT_MEASURE_OPTIONS: readonly { id: CohortMeasure; label: string; unit: string }[] = [
  { id: "nodes", label: "Nodes", unit: "count" },
  { id: "metagraphs", label: "Metagraphs", unit: "count" },
];
export function cohortMeasure(m: CohortMeasure, rows: readonly Pick<NodeRow, "pick">[]): number {
  return m === "nodes" ? rows.length : countryMeasure("metagraphs", rows.length, rows);
}


/** The network a placed node serves: its metagraph's id, or `dag` for a base-ledger validator
 *  (a pick of kind l0 / l1 / core is the DAG's own). Null only for a pick that names no node. */
export function networkOfRow(row: Pick<NodeRow, "pick">): string | null {
  const p = row.pick;
  switch (p.kind) {
    case "metanode":
      return p.meta?.id ?? null;
    case "l0":
    case "l1":
    case "core":
      return "dag";
    default:
      return null;
  }
}

/** The provider hosting a placed node — the geolocation's ISP — or null where none was resolved. */
export function providerOfRow(row: Pick<NodeRow, "pick">): string | null {
  const p = row.pick;
  const isp = "geo" in p && p.geo ? p.geo.isp : null;
  return isp ? isp : null;
}

/**
 * The figure a country row shows (and scales its bar by) for `m`. `count` is the leaderboard's
 * own node count for the country — the figure of record for `nodes`, which is why it is not
 * re-derived from `rows` — and `rows` are the country's placed nodes for the two distinct counts.
 */
export function countryMeasure(m: GeoMeasure, count: number, rows: readonly Pick<NodeRow, "pick">[]): number {
  switch (m) {
    case "nodes":
      return count;
    case "metagraphs": {
      const s = new Set<string>();
      for (const r of rows) { const n = networkOfRow(r); if (n) s.add(n); }
      return s.size;
    }
    case "providers": {
      const s = new Set<string>();
      for (const r of rows) { const p = providerOfRow(r); if (p) s.add(p); }
      return s.size;
    }
  }
}
