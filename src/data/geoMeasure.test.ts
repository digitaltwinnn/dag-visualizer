import { describe, expect, it } from "vitest";
import type { NodeRow } from "@/src/data/types";
import {
  COHORT_MEASURE_OPTIONS,
  COHORT_MEASURES,
  GEO_MEASURE_LABELS,
  GEO_MEASURE_OPTIONS,
  GEO_MEASURE_ORDER,
  cohortMeasure,
  countryMeasure,
  networkOfRow,
  providerOfRow,
} from "./geoMeasure";

// The Geography explorer's country-row figure, as a vocabulary (2026-09-26): nodes, distinct
// metagraphs, distinct providers — every one read off the rows the browser already holds.

const meta = (id: string, isp: string | null): Pick<NodeRow, "pick"> =>
  ({ pick: { kind: "metanode", meta: { id }, geo: isp ? { isp } : undefined } as unknown as NodeRow["pick"] });
const dag = (kind: "l0" | "l1", isp: string | null): Pick<NodeRow, "pick"> =>
  ({ pick: { kind, geo: isp ? { isp } : undefined } as unknown as NodeRow["pick"] });

describe("the order and its labels", () => {
  it("leads with nodes and names every measure", () => {
    expect(GEO_MEASURE_ORDER[0]).toBe("nodes");
    for (const m of GEO_MEASURE_ORDER) expect(GEO_MEASURE_LABELS[m].length).toBeGreaterThan(0);
  });

  it("the provider is the geolocation's ISP, or nothing", () => {
    expect(providerOfRow(meta("dor", "Hetzner"))).toBe("Hetzner");
    expect(providerOfRow(meta("dor", null))).toBeNull();
    expect(providerOfRow(meta("dor", ""))).toBeNull();
  });
});

describe("countryMeasure", () => {
  const rows = [meta("dor", "Hetzner"), meta("dor", "OVH"), meta("ded", "Hetzner"), dag("l0", "Hetzner"), dag("l1", null)];

  it("nodes is the leaderboard's own count, never re-derived from the rows", () => {
    expect(countryMeasure("nodes", 7, rows)).toBe(7);
    expect(countryMeasure("nodes", 0, rows)).toBe(0);
  });

  it("metagraphs counts distinct networks, the DAG among them", () => {
    expect(countryMeasure("metagraphs", 7, rows)).toBe(3); // dor, ded, dag
  });

  it("providers counts distinct hosts and skips rows without one", () => {
    expect(countryMeasure("providers", 7, rows)).toBe(2); // Hetzner, OVH
    expect(countryMeasure("providers", 1, [dag("l1", null)])).toBe(0);
  });
});

describe("the heading lists — every measure with its unit, and a cohort's own pair", () => {
  it("lists the country measures in order with their units", () => {
    expect(GEO_MEASURE_OPTIONS.map((o) => o.id)).toEqual([...GEO_MEASURE_ORDER]);
    for (const o of GEO_MEASURE_OPTIONS) expect(o.unit.length).toBeGreaterThan(0);
  });

  it("a cohort counts its nodes or the distinct networks they serve", () => {
    const rows = [meta("dor", "Hetzner"), meta("dor", "Hetzner"), dag("l0", "Hetzner")];
    expect(COHORT_MEASURE_OPTIONS.map((o) => o.id)).toEqual(["nodes", "metagraphs"]);
    expect(COHORT_MEASURES).toEqual(["nodes", "metagraphs"]); // the country list minus Providers
    expect(cohortMeasure("nodes", rows)).toBe(3);
    expect(cohortMeasure("metagraphs", rows)).toBe(2);
  });
});

describe("networkOfRow", () => {
  it("names a metagraph node's network and the DAG for a core node", () => {
    expect(networkOfRow({ pick: { kind: "metanode", meta: { id: "dor" } } } as unknown as NodeRow)).toBe("dor");
    expect(networkOfRow({ pick: { kind: "l0", node: {} } } as unknown as NodeRow)).toBe("dag");
  });
});
