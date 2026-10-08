// Bake the ISO 3166-1 alpha-2 → numeric join table (data/country-codes.json), and the alpha-2 →
// CONTINENT table (data/country-continents.json, 2026-10-08 — the Geography vitals' Nodes card
// breaks the fleet down by continent).
//
// Why: node geolocations carry alpha-2 codes (`cc`, from ip-api), while the world-atlas
// countries topology (`public/countries-110m.json`) keys countries by ISO numeric id. This
// table is the join. Baked OFFLINE from the `world-countries` dataset (devDependency) — run
// manually if the ISO standard ever changes (it effectively doesn't):
//
//   npx tsx scripts/bake-country-codes.ts
import { writeFileSync } from "node:fs";
import countries from "world-countries";

const map: Record<string, string> = {};
for (const c of countries) {
  if (c.cca2 && c.ccn3) map[c.cca2] = c.ccn3;
}

const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync("data/country-codes.json", JSON.stringify(sorted, null, "\t") + "\n");
console.log(`baked ${Object.keys(sorted).length} alpha-2 → numeric pairs to data/country-codes.json`);

// The dataset's REGION is the UN's, where "Americas" is one region; a reader says North and South
// America, so the Americas split by subregion — South America alone is "South America", and
// Central America and the Caribbean join North America (the seven-continent convention).
const continentOf = (region: string, subregion: string): string | null => {
  if (region === "Americas") return subregion === "South America" ? "South America" : "North America";
  if (region === "Antarctic") return "Antarctica";
  return region || null; // Africa, Asia, Europe, Oceania
};
const continents: Record<string, string> = {};
for (const c of countries) {
  const k = continentOf(c.region, c.subregion);
  if (c.cca2 && k) continents[c.cca2] = k;
}
const sortedC = Object.fromEntries(Object.entries(continents).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync("data/country-continents.json", JSON.stringify(sortedC, null, "\t") + "\n");
console.log(`baked ${Object.keys(sortedC).length} alpha-2 → continent pairs to data/country-continents.json`);
