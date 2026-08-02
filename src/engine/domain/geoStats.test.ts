import { describe, it, expect } from "vitest";
import { countryStats, listNodes, countryTallies, type GeoStatNode } from "./geoStats";
import type { PickDescriptor } from "@/src/data/types";

// Builds a validator-shaped pick (l0/l1 — the shapes that carry geo + node).
const validatorPick = (
  kind: "l0" | "l1",
  id: string,
  city: string,
  country: string,
  cc: string,
): PickDescriptor => ({
  kind,
  node: { id, ip: `10.0.0.${id}`, state: "Ready", roles: [kind] },
  geo: { city, country, cc, lat: 0, lon: 0 },
});

// Builds a metagraph-node-shaped pick.
const metaPick = (id: string, city: string, country: string, cc: string): PickDescriptor => ({
  kind: "metanode",
  node: { id, ip: `10.0.1.${id}`, state: "Ready", roles: ["l0"] },
  geo: { city, country, cc, lat: 0, lon: 0 },
  layer: "l0",
});

// Two DAG validators co-located in Germany (Berlin, Munich), one in France (Paris), and one
// unlocatable machine (noGeo — a hybrid sibling that must be skipped, same as globe.js does).
const validators: GeoStatNode[] = [
  { layer: "l0", geoPrimary: true, pick: validatorPick("l0", "v1", "Berlin", "Germany", "DE") },
  { layer: "l0", geoPrimary: true, pick: validatorPick("l0", "v2", "Munich", "Germany", "DE") },
  { layer: "l1", geoPrimary: true, pick: validatorPick("l1", "v3", "Paris", "France", "FR") },
  { layer: "l0", geoPrimary: false, noGeo: true, pick: { kind: "l0" } },
];

// One metagraph node (DOR) in Portugal.
const metaNodes: GeoStatNode[] = [
  { layer: "l0", metaId: "dor", geoPrimary: true, pick: metaPick("m1", "Lisbon", "Portugal", "PT") },
];

describe("countryStats", () => {
  it("tallies + sorts DAG validators by country, descending count", () => {
    expect(countryStats(validators, metaNodes, "dag")).toEqual([
      { country: "Germany", cc: "DE", count: 2 },
      { country: "France", cc: "FR", count: 1 },
    ]);
  });

  it("counts every network under 'all' — the whole plotted footprint, not just the validators", () => {
    expect(countryStats(validators, metaNodes, "all")).toEqual([
      { country: "Germany", cc: "DE", count: 2 },
      { country: "France", cc: "FR", count: 1 },
      { country: "Portugal", cc: "PT", count: 1 },
    ]);
  });

  it("tallies a metagraph filter independently of the validator set", () => {
    expect(countryStats(validators, metaNodes, "dor")).toEqual([{ country: "Portugal", cc: "PT", count: 1 }]);
  });

  it("returns [] for a filter with no tallied nodes", () => {
    expect(countryStats(validators, metaNodes, "nope")).toEqual([]);
  });
});

describe("countryTallies", () => {
  it("keys the raw tally map by filter id, then by country", () => {
    const nets = countryTallies(validators, metaNodes);
    expect(nets.dag?.Germany).toEqual({ country: "Germany", cc: "DE", count: 2 });
    expect(nets.dor?.Portugal).toEqual({ country: "Portugal", cc: "PT", count: 1 });
  });

  it("counts a node ONCE PER NETWORK under 'all' — a machine serving two networks is two nodes", () => {
    // The same machine (one IP) reported by both the validator set and a metagraph, exactly as
    // mainnet does it: two chips on the globe, two rows in the browser, two counts here.
    const shared: GeoStatNode[] = [
      { layer: "l0", metaId: "dor", geoPrimary: true, pick: metaPick("v1", "Berlin", "Germany", "DE") },
    ];
    const nets = countryTallies(validators, shared);
    expect(nets.all?.Germany.count).toBe(3); // 2 validators + the metagraph node on one of them
    expect(nets.dag?.Germany.count).toBe(2);
    expect(nets.dor?.Germany.count).toBe(1);
  });
});

describe("listNodes", () => {
  it("lists EVERY network's nodes for 'all', skipping the unlocatable sibling", () => {
    const rows = listNodes(validators, metaNodes, "all");
    expect(rows.map((r) => r.id)).toEqual(["v1", "v2", "v3", "m1"]);
    expect(rows[0]).toMatchObject({
      id: "v1",
      city: "Berlin",
      country: "Germany",
      cc: "DE",
      layer: "l0",
      roles: ["l0"],
    });
  });

  it("lists the validators alone for 'dag' — 'all' adds the metagraph nodes on top", () => {
    const dag = listNodes(validators, metaNodes, "dag");
    expect(dag.map((r) => r.id)).toEqual(["v1", "v2", "v3"]);
    expect(listNodes(validators, metaNodes, "all").slice(0, dag.length)).toEqual(dag);
  });

  it("lists only the matching metagraph's nodes for a metagraph filter", () => {
    const rows = listNodes(validators, metaNodes, "dor");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "m1", city: "Lisbon", country: "Portugal", layer: "l0" });
  });

  it("falls back to id/ip/place for the label and [layer] for roles when absent", () => {
    const noRoles: GeoStatNode[] = [
      {
        layer: "cl1",
        geoPrimary: true,
        pick: { kind: "l0", node: { ip: "1.2.3.4", state: "Ready" }, geo: { country: "Testland" } },
      },
    ];
    const [row] = listNodes(noRoles, [], "dag");
    expect(row).toMatchObject({ label: "1.2.3.4", id: null, roles: ["cl1"] });
  });
});
