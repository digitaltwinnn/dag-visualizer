import { describe, it, expect } from "vitest";
import { compositionRows, nodeCompositionLabel, compositionKey, parseCompositionKey, compositionClause, ROLE_SHORT, layerCodesOf, compositionGroups } from "./composition";
import type { NodeInfo, NodeRow } from "@/src/data/types";

const n = (roles: string[]): NodeInfo => ({ ip: "x", state: "Ready", layer: roles[0], roles }) as NodeInfo;

describe("compositionRows", () => {
  it("splits hybrid (by exact code set) from dedicated rows, summing to the total", () => {
    const nodes = [
      n(["l0", "dl1"]), n(["l0", "dl1"]), n(["l0", "dl1"]), // 3 hybrid L0·dL1
      n(["dl1"]), n(["dl1"]),                                // 2 dedicated data
      n(["l0"]),                                             // 1 dedicated consensus
    ];
    const rows = compositionRows(nodes);
    expect(rows).toContainEqual({ label: "Hybrid", codes: ["L0", "dL1"], count: 3 });
    expect(rows).toContainEqual({ label: "Data", codes: ["dL1"], count: 2 });
    expect(rows).toContainEqual({ label: "Consensus", codes: ["L0"], count: 1 });
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(6);
  });
  it("emits two Hybrid rows for two distinct make-ups", () => {
    const rows = compositionRows([n(["l0", "dl1"]), n(["l0", "cl1", "dl1"])]);
    const hybrids = rows.filter((r) => r.label === "Hybrid");
    expect(hybrids).toHaveLength(2);
    expect(hybrids.map((h) => h.codes.join("·")).sort()).toEqual(["L0·cL1·dL1", "L0·dL1"]);
  });
  it("names dedicated currency as Currency cL1", () => {
    expect(compositionRows([n(["cl1"])])).toContainEqual({ label: "Currency", codes: ["cL1"], count: 1 });
  });
});

describe("nodeCompositionLabel (the node card's subtitle word)", () => {
  it("renders one lowercase word per composition", () => {
    expect(nodeCompositionLabel({ roles: ["l0", "cl1"] })).toBe("hybrid");
    expect(nodeCompositionLabel({ roles: ["l0"] })).toBe("consensus");
    expect(nodeCompositionLabel({ roles: ["dl1"] })).toBe("data");
    expect(nodeCompositionLabel({ layer: "cl1" })).toBe("currency"); // layer fallback
  });
  it("is null when the node carries no role/layer info", () => {
    expect(nodeCompositionLabel({})).toBeNull();
  });
});

// The composition key is a FORMAT with two consumers (the explorer/Engine build it, the card reads
// it back), so the pair is pinned here: whatever the builder emits, the parser must return.
describe("compositionKey / parseCompositionKey", () => {
  it("round-trips a hybrid group's label and codes", () => {
    const k = compositionKey("Hybrid", ["L0", "cL1", "dL1"]);
    expect(parseCompositionKey(k)).toEqual({ label: "Hybrid", codes: ["L0", "cL1", "dL1"] });
  });
  it("round-trips a group with no codes", () => {
    expect(parseCompositionKey(compositionKey("Node", []))).toEqual({ label: "Node", codes: [] });
  });
});

// The caption's functional clauses (user, 2026-08-16): the leaf caption says what a group DOES.
describe("compositionClause", () => {
  it("names one layer's function alone", () => {
    expect(compositionClause(["L0"])).toBe("seal snapshots");
    expect(compositionClause(["dL1"])).toBe("validate data updates");
  });
  it("joins a hybrid's clauses in code order with a final 'and', eliding a repeated verb", () => {
    expect(compositionClause(["L0", "cL1"])).toBe("seal snapshots and validate transactions");
    expect(compositionClause(["L0", "cL1", "dL1"])).toBe("seal snapshots, validate transactions and data updates");
    expect(compositionClause(["cL1", "dL1"])).toBe("validate transactions and data updates");
  });
  it("answers null for codes it has no clause for — the caller falls back", () => {
    expect(compositionClause([])).toBeNull();
    expect(compositionClause(["??"])).toBeNull();
  });
});

// ONE layer vocabulary app-wide (CLAUDE.md, "Nodes, layers & the filter"): the codes the
// composition chips use are the codes every surface uses. Three private copies of this map
// existed before the 2026-08-16 consolidation, so the exported map is the thing under test.
describe("ROLE_SHORT", () => {
  it("is the whole layer vocabulary and nothing else", () => {
    expect(ROLE_SHORT).toEqual({ l0: "L0", cl1: "cL1", dl1: "dL1" });
  });
});

describe("layerCodesOf", () => {
  it("aggregates the layers present, in the fixed vocabulary order", () => {
    expect(layerCodesOf([{ roles: ["dl1"] }, { roles: ["l0"] }])).toEqual(["L0", "dL1"]);
  });
  it("reports each layer ONCE however many machines run it", () => {
    expect(layerCodesOf([{ roles: ["l0", "dl1"] }, { roles: ["l0", "dl1"] }])).toEqual(["L0", "dL1"]);
  });
  it("is empty for nodes carrying no role list", () => {
    expect(layerCodesOf([{}, { roles: [] }])).toEqual([]);
  });
});

const nrow = (ip: string, roles: string[], id: string | null = ip): NodeRow =>
  ({ pick: { kind: "l0", node: { ip, roles } as never }, label: ip, id, cc: null, country: null, city: null, layer: roles[0], roles }) as NodeRow;

describe("compositionGroups", () => {
  // ⚠️ A machine appears ONCE per cluster it runs, so the group counts match the dossier's
  // table — this is the "a count can't drift" guarantee CLAUDE.md names for the shared math.
  it("dedups a machine reported by several clusters", () => {
    const groups = compositionGroups([nrow("1.1.1.1", ["l0", "dl1"]), nrow("1.1.1.1", ["l0", "dl1"])]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(1);
  });

  it("splits by composition and orders the biggest group first", () => {
    const groups = compositionGroups([
      nrow("1.1.1.1", ["dl1"]), nrow("2.2.2.2", ["dl1"]), nrow("3.3.3.3", ["l0", "dl1"]),
    ]);
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([["Data", 2], ["Hybrid", 1]]);
  });

  // The key is the group's stable identity — the same string the store's CompositionSel carries,
  // which is why the builder and the parser live in one module.
  it("keys each group with the round-trippable label + codes", () => {
    const [g] = compositionGroups([nrow("1.1.1.1", ["l0", "dl1"])]);
    expect(g.key).toBe(compositionKey("Hybrid", ["L0", "dL1"]));
    expect(parseCompositionKey(g.key)).toEqual({ label: "Hybrid", codes: ["L0", "dL1"] });
  });

  it("orders rows within a group deterministically", () => {
    const groups = compositionGroups([nrow("9.9.9.9", ["dl1"]), nrow("1.1.1.1", ["dl1"])]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["1.1.1.1", "9.9.9.9"]);
  });
});
