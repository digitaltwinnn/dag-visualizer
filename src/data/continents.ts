// THE FLEET BY CONTINENT (user, 2026-10-08 — the Geography vitals: "nodes located/unplaced;
// unplaced never happens, what is a better node breakdown related to geo?"). The world view of
// where the network runs, one level above the Top countries card beside it. The continent of a
// country comes from a baked table (data/country-continents.json, scripts/bake-country-codes.ts —
// the UN regions, the Americas split North/South), never from a guess.
import table from "@/data/country-continents.json";
import type { NodeRow } from "@/src/data/types";

const CONTINENT: Readonly<Record<string, string>> = table;

/** A country's continent, or null when the code is not a country the table knows. */
export function continentOf(cc: string | null | undefined): string | null {
  return cc ? (CONTINENT[cc.toUpperCase()] ?? null) : null;
}

/** The fleet's nodes per continent, busiest first (ties by name), and the nodes no country could
 *  be placed for — a count the card states only when it is not zero. A node whose country code the
 *  table does not know counts as unplaced: it is not on any continent this card can name. */
export function nodesByContinent(rows: readonly Pick<NodeRow, "cc">[]): { rows: { continent: string; count: number }[]; unplaced: number } {
  const by = new Map<string, number>();
  let unplaced = 0;
  for (const r of rows) {
    const k = continentOf(r.cc);
    if (k) by.set(k, (by.get(k) ?? 0) + 1);
    else unplaced++;
  }
  return {
    rows: [...by.entries()].map(([continent, count]) => ({ continent, count })).sort((a, b) => b.count - a.count || a.continent.localeCompare(b.continent)),
    unplaced,
  };
}
