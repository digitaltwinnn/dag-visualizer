// ONE LIST PER LADDER LEVEL (user, 2026-10-07 — `docs/superpowers/specs/2026-10-07-one-list-per-level-design.md`).
// Each function answers one level's question: which subjects it holds, in which order. The
// explorer lists that list, the rail's next ghost opens its first item, and the card's ‹ › pager
// steps through it — so the three can never disagree about what is under a card. They did: the
// rail kept its own copies, and four had drifted (countries by node count while the explorer
// sorted by the picked figure, …).
//
// Pure: plain values in, plain subjects out — no React, no store, no singleton reads. A level's
// ROW (glyph, bar, click) is the explorer's business; a level's STEP (label, actions) is the
// rail's. Only membership and order live here.
import { countryMeasure, type GeoMeasure } from "./geoMeasure";
import type { CountryStat, NodeRow } from "./types";

// ── Geography ───────────────────────────────────────────────────────────────────────────────

/** A node list's order: city (label fallback), then id. */
export const nodeOrder = (a: NodeRow, b: NodeRow): number =>
  (a.city || a.label).localeCompare(b.city || b.label, undefined, { sensitivity: "base" }) || (a.id || "").localeCompare(b.id || "");

/** The selection's nodes by country NAME — the key both the leaderboard and the node list derive
 *  from `geo.country` (`cc` can be absent, the name can't) — each country's rows in node-list order. */
export function nodesByCountry(selNodes: readonly NodeRow[]): Map<string, NodeRow[]> {
  const m = new Map<string, NodeRow[]>();
  for (const r of selNodes) {
    const key = r.country || "Unknown";
    (m.get(key) ?? m.set(key, []).get(key)!).push(r);
  }
  for (const rows of m.values()) rows.sort(nodeOrder);
  return m;
}

/** THE COUNTRIES under the network, by the picked figure, node count breaking a tie. */
export function countriesLevel(
  countries: readonly CountryStat[],
  byCountry: ReadonlyMap<string, readonly NodeRow[]>,
  measure: GeoMeasure,
): { c: CountryStat; v: number }[] {
  return countries
    .map((c) => ({ c, v: countryMeasure(measure, c.count, byCountry.get(c.country) ?? []) }))
    .sort((a, b) => b.v - a.v || b.c.count - a.c.count);
}

/** One country's nodes, joined by NAME through the leaderboard (a node can carry a country and no code). */
export function countryNodes(cc: string, countries: readonly CountryStat[], byCountry: ReadonlyMap<string, readonly NodeRow[]>): NodeRow[] {
  const name = countries.find((c) => c.cc === cc)?.country;
  return name ? [...(byCountry.get(name) ?? [])] : [];
}

/** A country's city × provider group. */
export interface Cohort {
  key: string;
  city: string | null;
  isp: string | null;
  rows: NodeRow[];
}

/** THE PROVIDERS in a country: city × provider, most nodes first, then city (unlocated last).
 *  `|| null` on both fields — `sameCohort`'s strict === needs an unresolved value to be null. */
export function cohortsLevel(rows: readonly NodeRow[]): Cohort[] {
  const by = new Map<string, Cohort>();
  for (const r of rows) {
    const geo = "geo" in r.pick ? r.pick.geo : undefined;
    const city = r.city || null;
    const isp = geo?.isp || null;
    const key = `${city ?? ""}|${isp ?? ""}`;
    (by.get(key) ?? by.set(key, { key, city, isp, rows: [] }).get(key)!).rows.push(r);
  }
  return [...by.values()].sort((a, b) => b.rows.length - a.rows.length || (a.city ?? "￿").localeCompare(b.city ?? "￿"));
}
