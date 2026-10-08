import { describe, expect, it } from "vitest";
import { nodesBySubregion, subregionOf } from "@/src/data/subregions";

describe("subregionOf (UN M49)", () => {
  it("reads the baked table, case-insensitive", () => {
    expect(subregionOf("de")).toBe("Western Europe");
    expect(subregionOf("FI")).toBe("Northern Europe");
    expect(subregionOf("US")).toBe("Northern America");
    expect(subregionOf("IN")).toBe("Southern Asia");
  });
  it("uses M49, not the dataset's own groups: no 'Central Europe', Mexico in Central America", () => {
    expect(subregionOf("AT")).toBe("Western Europe"); // the dataset said "Central Europe"
    expect(subregionOf("PL")).toBe("Eastern Europe");
    expect(subregionOf("HR")).toBe("Southern Europe"); // the dataset said "Southeast Europe"
    expect(subregionOf("CY")).toBe("Western Asia");
    expect(subregionOf("MX")).toBe("Central America");
  });
  it("no code, or an unknown one, is no region", () => {
    expect(subregionOf(null)).toBeNull();
    expect(subregionOf("ZZ")).toBeNull();
  });
});

describe("nodesBySubregion", () => {
  it("counts busiest first and keeps the unplaced apart", () => {
    const out = nodesBySubregion([{ cc: "DE" }, { cc: "FR" }, { cc: "FI" }, { cc: "US" }, { cc: null }, { cc: "ZZ" }, { cc: "AT" }]);
    expect(out.rows).toEqual([
      { region: "Western Europe", count: 3 },
      { region: "Northern America", count: 1 },
      { region: "Northern Europe", count: 1 },
    ]);
    expect(out.unplaced).toBe(2);
  });
});
