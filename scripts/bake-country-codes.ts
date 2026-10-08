// Bake the ISO 3166-1 alpha-2 → numeric join table (data/country-codes.json), and the alpha-2 →
// SUB-REGION table (data/country-subregions.json, 2026-10-08 — the Geography vitals' Nodes card
// breaks the fleet down by UN M49 sub-region).
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

// SUB-REGIONS, the UN M49 scheme (user, 2026-10-08: continents first, then "room for sub-regions?").
// The dataset's subregions ARE M49 everywhere except where it invents its own groups: "Central
// Europe" and "Southeast Europe" are not M49 regions, and it files Cyprus under Europe, Mexico under
// North America and the US Minor Outlying Islands with the US. Those countries are corrected to their
// M49 sub-region by name below, so the card never splits neighbours (Austria and Germany) between a
// made-up region and a real one. Kosovo, which M49 does not list, joins its Balkan neighbours.
const M49_FIX: Record<string, string> = {
  AT: "Western Europe",
  CZ: "Eastern Europe", HU: "Eastern Europe", PL: "Eastern Europe", SK: "Eastern Europe", BG: "Eastern Europe", RO: "Eastern Europe",
  SI: "Southern Europe", AL: "Southern Europe", BA: "Southern Europe", HR: "Southern Europe", ME: "Southern Europe",
  MK: "Southern Europe", RS: "Southern Europe", XK: "Southern Europe",
  CY: "Western Asia",
  MX: "Central America",
  UM: "Micronesia",
};
const subregionOf = (cca2: string, region: string, subregion: string): string | null => {
  if (M49_FIX[cca2]) return M49_FIX[cca2];
  if (region === "Antarctic") return "Antarctica";
  if (subregion === "North America") return "Northern America"; // M49's name for BM CA GL PM US
  return subregion || null;
};
const subregions: Record<string, string> = {};
for (const c of countries) {
  const k = c.cca2 ? subregionOf(c.cca2, c.region, c.subregion) : null;
  if (c.cca2 && k) subregions[c.cca2] = k;
}
const sortedS = Object.fromEntries(Object.entries(subregions).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync("data/country-subregions.json", JSON.stringify(sortedS, null, "\t") + "\n");
console.log(`baked ${Object.keys(sortedS).length} alpha-2 → M49 sub-region pairs to data/country-subregions.json`);
