// THE FLEET BY SUB-REGION (user, 2026-10-08 — the Geography vitals: "nodes located/unplaced;
// unplaced never happens, what is a better node breakdown related to geo?", then continents, then
// "room for sub-regions?"). The world view of where the network runs, one level above the Top
// countries card beside it. Continents alone said little — Europe held 102 of 161 nodes — so the
// card names the UN M49 sub-region (Western Europe, Northern America, Northern Europe …), from a
// baked table (data/country-subregions.json, scripts/bake-country-codes.ts), never a guess.
import table from "@/data/country-subregions.json";
import type { NodeRow } from "@/src/data/types";

const SUBREGION: Readonly<Record<string, string>> = table;

/** A country's UN M49 sub-region, or null when the code is not a country the table knows. */
export function subregionOf(cc: string | null | undefined): string | null {
  return cc ? (SUBREGION[cc.toUpperCase()] ?? null) : null;
}

/** The fleet's nodes per sub-region, busiest first (ties by name), and the nodes no country could
 *  be placed for — a count the card states only when it is not zero. A node whose country code the
 *  table does not know counts as unplaced: it is in no region this card can name. */
export function nodesBySubregion(rows: readonly Pick<NodeRow, "cc">[]): { rows: { region: string; count: number }[]; unplaced: number } {
  const by = new Map<string, number>();
  let unplaced = 0;
  for (const r of rows) {
    const k = subregionOf(r.cc);
    if (k) by.set(k, (by.get(k) ?? 0) + 1);
    else unplaced++;
  }
  return {
    rows: [...by.entries()].map(([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count || a.region.localeCompare(b.region)),
    unplaced,
  };
}
