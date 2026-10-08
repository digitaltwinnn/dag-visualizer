import { describe, expect, it } from "vitest";
import type { MetaInfo, NodeRow } from "@/src/data/types";
import {
  HYPER_MEASURE_LABELS,
  HYPER_MEASURE_OPTIONS,
  HYPER_MEASURE_ORDER,
  groupMeasure,
  networkMeasure,
} from "./hyperMeasure";

// The Hypergraph explorer's network-row figure (user, 2026-10-07 — the view is the architecture,
// so its figures count what the network is BUILT of): its nodes, and its nodes per layer. Countries
// and providers were Geography's questions and left for it.

type Row = Pick<NodeRow, "pick" | "roles" | "id" | "label">;
const row = (ip: string, roles: string[]): Row =>
  ({ pick: { kind: "metanode", node: { ip } } as unknown as NodeRow["pick"], roles, id: `id-${ip}`, label: ip });
const net = (n: number): Pick<MetaInfo, "nodes"> => ({ nodes: Array.from({ length: n }, () => ({})) });

// A hybrid (L0 + cL1) listed once per layer it runs, a data node, a dedicated validator.
const rows = [row("1", ["l0", "cl1"]), row("1", ["l0", "cl1"]), row("2", ["dl1"]), row("3", ["l0"])];

describe("the order and its labels", () => {
  it("leads with nodes, then the layers in the vocabulary's own order and codes", () => {
    expect(HYPER_MEASURE_ORDER).toEqual(["nodes", "l0", "cl1", "dl1"]);
    expect(HYPER_MEASURE_LABELS).toEqual({ nodes: "Nodes", l0: "L0", cl1: "cL1", dl1: "dL1" });
  });
  it("lists every measure for the heading control, in order, each counted in nodes", () => {
    expect(HYPER_MEASURE_OPTIONS.map((o) => o.id)).toEqual(HYPER_MEASURE_ORDER);
    expect(HYPER_MEASURE_OPTIONS.every((o) => o.unit === "nodes")).toBe(true);
  });
});

describe("networkMeasure — a network row's figure", () => {
  it("nodes is the catalog's own fleet, whatever the placed rows say", () => {
    expect(networkMeasure("nodes", net(19), rows)).toBe(19);
  });
  it("a layer counts the nodes that run it — a node listed once per layer counts once", () => {
    expect(networkMeasure("l0", net(19), rows)).toBe(2); // the hybrid and the validator
    expect(networkMeasure("cl1", net(19), rows)).toBe(1);
    expect(networkMeasure("dl1", net(19), rows)).toBe(1);
    expect(networkMeasure("dl1", net(3), [])).toBe(0);
  });
});

describe("groupMeasure — a composition row's figure, the network level's pick carried down", () => {
  it("counts the group's nodes, or those of them running the picked layer", () => {
    expect(groupMeasure("nodes", rows)).toBe(4);
    expect(groupMeasure("l0", rows)).toBe(2);
    expect(groupMeasure("dl1", rows)).toBe(1);
  });
});
