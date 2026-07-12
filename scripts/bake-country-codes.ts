// Bake the ISO 3166-1 alpha-2 → numeric join table (data/country-codes.json).
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
