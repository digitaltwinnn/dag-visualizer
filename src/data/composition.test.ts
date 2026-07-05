import { describe, it, expect } from "vitest";
import { compositionRows } from "./composition";
import type { NodeInfo } from "@/src/data/types";

const n = (roles: string[]): NodeInfo => ({ ip: "x", state: "Ready", layer: roles[0], roles }) as NodeInfo;

describe("compositionRows", () => {
  it("splits hybrid (by exact code set) from dedicated rows, summing to the total", () => {
    const nodes = [
      n(["l0", "dl1"]), n(["l0", "dl1"]), n(["l0", "dl1"]), // 3 hybrid L0·dL1
      n(["dl1"]), n(["dl1"]),                                // 2 dedicated data
      n(["l0"]),                                             // 1 dedicated consensus
    ];
    const rows = compositionRows(nodes);
    expect(rows).toContainEqual({ label: "Hybrid", codes: ["L0", "dL1"], count: 3, states: ["Ready", "Ready", "Ready"] });
    expect(rows).toContainEqual({ label: "Data", codes: ["dL1"], count: 2, states: ["Ready", "Ready"] });
    expect(rows).toContainEqual({ label: "Consensus", codes: ["L0"], count: 1, states: ["Ready"] });
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(6);
  });
  it("emits two Hybrid rows for two distinct make-ups", () => {
    const rows = compositionRows([n(["l0", "dl1"]), n(["l0", "cl1", "dl1"])]);
    const hybrids = rows.filter((r) => r.label === "Hybrid");
    expect(hybrids).toHaveLength(2);
    expect(hybrids.map((h) => h.codes.join("·")).sort()).toEqual(["L0·cL1·dL1", "L0·dL1"]);
  });
  it("names dedicated currency as Currency cL1", () => {
    expect(compositionRows([n(["cl1"])])).toContainEqual({ label: "Currency", codes: ["cL1"], count: 1, states: ["Ready"] });
  });
});
