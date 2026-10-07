import { describe, expect, it } from "vitest";
import { cohortsLevel, countriesLevel, countryNodes, nodeOrder, nodesByCountry } from "./ladderLevels";
import type { CountryStat, NodeRow } from "./types";

// A node row with just what the levels read. `meta` names its network (networkOfRow).
const node = (o: { ip: string; id?: string; cc?: string | null; country?: string | null; city?: string; isp?: string; meta?: string; layer?: string }): NodeRow =>
  ({
    pick: {
      kind: "metanode",
      meta: o.meta ? { id: o.meta } : undefined,
      node: { ip: o.ip, id: o.id ?? `id-${o.ip}` },
      geo: { cc: o.cc ?? undefined, city: o.city, isp: o.isp },
    },
    label: o.ip,
    id: o.id ?? `id-${o.ip}`,
    cc: o.cc ?? null,
    country: o.country ?? null,
    city: o.city ?? null,
    layer: o.layer ?? "l0",
  }) as unknown as NodeRow;

const de1 = node({ ip: "1", id: "b", cc: "de", country: "Germany", city: "Falkenstein", isp: "Hetzner", meta: "dor" });
const de2 = node({ ip: "2", id: "a", cc: "de", country: "Germany", city: "Falkenstein", isp: "Hetzner", meta: "ded" });
const de3 = node({ ip: "3", id: "c", cc: "de", country: "Germany", city: "Berlin", isp: "AWS", meta: "dor" });
const fi1 = node({ ip: "4", id: "d", cc: "fi", country: "Finland", city: "Helsinki", isp: "Hetzner", meta: "dor" });
const fi2 = node({ ip: "5", id: "e", cc: "fi", country: "Finland", city: "Helsinki", isp: "OVH", meta: "ded" });
const fi3 = node({ ip: "6", id: "f", cc: "fi", country: "Finland", city: "Espoo", isp: "UpCloud", meta: "tbc" });
// A node the lookup placed in a country but gave no code (Review Focus 2).
const fiNoCc = node({ ip: "7", id: "g", cc: null, country: "Finland", city: "Oulu", isp: "Elisa", meta: "dor" });
const sel = [de1, de2, de3, fi1, fi2, fi3, fiNoCc];
const countries: CountryStat[] = [
  { cc: "de", country: "Germany", count: 3 },
  { cc: "fi", country: "Finland", count: 3 },
];

describe("nodeOrder", () => {
  it("orders by city, then id", () => {
    expect([de1, de3, de2].sort(nodeOrder).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});

describe("nodesByCountry", () => {
  it("joins by country NAME and sorts by city, then id", () => {
    const by = nodesByCountry(sel);
    expect(by.get("Germany")!.map((r) => r.id)).toEqual(["c", "a", "b"]); // Berlin, then Falkenstein a < b
    expect(by.get("Finland")!.map((r) => r.id)).toEqual(["f", "d", "e", "g"]); // Espoo, Helsinki d < e, Oulu
  });
});

describe("countriesLevel", () => {
  const by = nodesByCountry(sel);
  it("orders by the picked figure", () => {
    // providers: Germany 2 (Hetzner, AWS), Finland 4 (Hetzner, OVH, UpCloud, Elisa)
    expect(countriesLevel(countries, by, "providers").map((x) => x.c.cc)).toEqual(["fi", "de"]);
  });
  it("breaks a tie on node count, so the order is stable (Review Focus 3)", () => {
    // metagraphs: Germany {dor, ded} = 2, Finland (two rows only) {dor, ded} = 2 — tied; Finland
    // has the larger node count, so it leads.
    const tieBy = new Map([["Germany", [de1, de2, de3]], ["Finland", [fi1, fi2]]]);
    const tie: CountryStat[] = [
      { cc: "de", country: "Germany", count: 3 },
      { cc: "fi", country: "Finland", count: 5 },
    ];
    expect(countriesLevel(tie, tieBy, "metagraphs").map((x) => x.c.cc)).toEqual(["fi", "de"]);
  });
});

describe("countryNodes", () => {
  it("returns a country's rows by NAME, including a node with no country code (Review Focus 2)", () => {
    expect(countryNodes("fi", countries, nodesByCountry(sel)).map((r) => r.id)).toEqual(["f", "d", "e", "g"]);
    expect(countryNodes("xx", countries, nodesByCountry(sel))).toEqual([]);
  });
});

describe("cohortsLevel", () => {
  it("groups by city × provider, count desc then city", () => {
    const rows = countryNodes("de", countries, nodesByCountry(sel));
    const cs = cohortsLevel(rows);
    expect(cs.map((c) => `${c.isp}|${c.city}|${c.rows.length}`)).toEqual(["Hetzner|Falkenstein|2", "AWS|Berlin|1"]);
    expect(cs[0]!.rows.map((r) => r.id)).toEqual(["a", "b"]); // keeps the input (sorted) order
  });
  it("sorts an unlocated cohort last", () => {
    const loose = node({ ip: "9", country: "Germany", isp: "X" }); // no city
    const cs = cohortsLevel([de3, loose]);
    expect(cs.map((c) => c.city)).toEqual(["Berlin", null]);
  });
});
