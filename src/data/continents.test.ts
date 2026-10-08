import { describe, expect, it } from "vitest";
import { continentOf, nodesByContinent } from "@/src/data/continents";

describe("continentOf", () => {
  it("reads the baked table, case-insensitive, with the Americas split North/South", () => {
    expect(continentOf("de")).toBe("Europe");
    expect(continentOf("US")).toBe("North America");
    expect(continentOf("PA")).toBe("North America"); // Central America joins North America
    expect(continentOf("BR")).toBe("South America");
    expect(continentOf("SG")).toBe("Asia");
    expect(continentOf("AU")).toBe("Oceania");
  });
  it("no code, or an unknown one, is no continent", () => {
    expect(continentOf(null)).toBeNull();
    expect(continentOf("ZZ")).toBeNull();
  });
});

describe("nodesByContinent", () => {
  it("counts busiest first and keeps the unplaced apart", () => {
    const out = nodesByContinent([{ cc: "DE" }, { cc: "FI" }, { cc: "US" }, { cc: null }, { cc: "ZZ" }, { cc: "SG" }, { cc: "CA" }]);
    expect(out.rows).toEqual([
      { continent: "Europe", count: 2 },
      { continent: "North America", count: 2 },
      { continent: "Asia", count: 1 },
    ]);
    expect(out.unplaced).toBe(2);
  });
});
