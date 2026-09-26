import { describe, expect, it } from "vitest";
import type { MetaInfo, NodeRow } from "@/src/data/types";
import {
  HYPER_MEASURE_LABELS,
  HYPER_MEASURE_ORDER,
  networkMeasure,
  stepHyperMeasure,
  type HyperMeasure,
} from "./hyperMeasure";

// The Hypergraph explorer's network-row figure, as a vocabulary (2026-09-26): nodes, distinct
// countries, distinct providers — the Geography card's vocabulary turned around.

type Row = Pick<NodeRow, "pick" | "cc" | "country">;
const row = (cc: string | null, country: string | null, isp: string | null): Row =>
  ({ pick: { kind: "metanode", geo: isp ? { isp } : undefined } as unknown as NodeRow["pick"], cc, country });
const net = (n: number): Pick<MetaInfo, "nodes"> => ({ nodes: Array.from({ length: n }, () => ({})) });

describe("the order and its labels", () => {
  it("leads with nodes and names every measure", () => {
    expect(HYPER_MEASURE_ORDER[0]).toBe("nodes");
    for (const m of HYPER_MEASURE_ORDER) expect(HYPER_MEASURE_LABELS[m].length).toBeGreaterThan(0);
  });

  it("steps through the order and stops at the ends", () => {
    expect(stepHyperMeasure("nodes", -1)).toBeNull();
    expect(stepHyperMeasure("nodes", 1)).toBe("countries");
    expect(stepHyperMeasure("providers", 1)).toBeNull();
    expect(stepHyperMeasure("bogus" as HyperMeasure, 1)).toBeNull();
  });
});

describe("networkMeasure", () => {
  const rows = [row("DE", "Germany", "Hetzner"), row("DE", "Germany", "OVH"), row("US", "United States", "Hetzner"), row(null, "Finland", null), row(null, null, null)];

  it("nodes is the catalog's own fleet, whatever the placed rows say", () => {
    expect(networkMeasure("nodes", net(19), rows)).toBe(19);
    expect(networkMeasure("nodes", net(0), rows)).toBe(0);
  });

  it("countries counts distinct places by code, falling back to the name, skipping the unplaced", () => {
    expect(networkMeasure("countries", net(19), rows)).toBe(3); // DE, US, Finland
  });

  it("providers counts distinct hosts and skips rows without one", () => {
    expect(networkMeasure("providers", net(19), rows)).toBe(2); // Hetzner, OVH
    expect(networkMeasure("providers", net(3), [])).toBe(0);
  });
});
