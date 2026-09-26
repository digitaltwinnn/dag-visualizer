import { describe, expect, it } from "vitest";
import type { NodeRow } from "@/src/data/types";
import {
  GEO_MEASURE_LABELS,
  GEO_MEASURE_ORDER,
  countryMeasure,
  networkOfRow,
  providerOfRow,
  stepGeoMeasure,
  type GeoMeasure,
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

  it("steps through the order and stops at the ends", () => {
    expect(stepGeoMeasure("nodes", -1)).toBeNull();
    expect(stepGeoMeasure("nodes", 1)).toBe("metagraphs");
    expect(stepGeoMeasure("providers", 1)).toBeNull();
    expect(stepGeoMeasure("bogus" as GeoMeasure, 1)).toBeNull();
  });
});

describe("what a row serves and who hosts it", () => {
  it("a metagraph node serves its metagraph; a validator serves the DAG; a nameless pick serves nothing", () => {
    expect(networkOfRow(meta("dor", null))).toBe("dor");
    expect(networkOfRow(dag("l0", null))).toBe("dag");
    expect(networkOfRow({ pick: { kind: "geoLive" } as NodeRow["pick"] })).toBeNull();
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
