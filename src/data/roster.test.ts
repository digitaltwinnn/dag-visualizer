import { describe, expect, it } from "vitest";
import { buildRoster, groupRosterByCountry, groupRosterByNetwork, sortRoster } from "@/src/data/roster";
import type { NodeRow } from "@/src/data/types";

const row = (over: Partial<NodeRow> & { pick: NodeRow["pick"] }): NodeRow => ({
  label: "n", id: "id1", cc: "de", country: "Germany", city: "Berlin", layer: "l0", roles: ["l0"], ...over,
});

const validator = row({ pick: { kind: "l0", geo: { cc: "de", city: "Berlin", isp: "Hetzner", asn: "AS24940" } }, id: "v1" });
const metaNode = row({
  pick: { kind: "metanode", meta: { id: "dor" } as never, geo: { cc: "us", city: "Ashburn", isp: "AWS" } },
  id: null, cc: "us", country: "United States", city: "Ashburn", layer: "dl1", roles: ["dl1"],
});

describe("buildRoster", () => {
  it("derives network id + provider from each row's pick", () => {
    const rows = buildRoster([validator, metaNode]);
    expect(rows.map((r) => r.netId)).toEqual(["dag", "dor"]);
    expect(rows.map((r) => r.isp)).toEqual(["Hetzner", "AWS"]);
    expect(rows[0].asn).toBe("AS24940");
  });
  it("keys are unique even when ids are null", () => {
    const rows = buildRoster([metaNode, metaNode]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });
  it("keys are unique when two networks report the SAME id (one machine, two nodes under 'all')", () => {
    const sameId = row({ pick: { kind: "metanode", meta: { id: "dor" } as never }, id: "v1" });
    const rows = buildRoster([validator, sameId]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });
  it("one row per MACHINE: records sharing an IP merge, the metagraph leads, roles unite", () => {
    const at = (ip: string) => ({ ip }) as never;
    const dagRec = row({ pick: { kind: "l0", node: at("1.2.3.4") } as never, id: "m1", roles: ["l0", "cl1"] });
    const upRec = row({ pick: { kind: "metanode", meta: { id: "up" } as never, node: at("1.2.3.4") } as never, id: "m1", roles: ["l0", "dl1"] });
    const lone = row({ pick: { kind: "l0", node: at("9.9.9.9") } as never, id: "m2" });
    const rows = buildRoster([dagRec, upRec, lone]);
    expect(rows).toHaveLength(2);
    expect(rows[0].netId).toBe("up");
    expect(rows[0].nets).toEqual(["up", "dag"]);
    expect(rows[0].ids).toEqual(["m1"]);
    // Both records stay reachable — a selection of the DAG record is this row's too.
    expect(rows[0].recs).toEqual([upRec, dagRec]);
    expect(rows[0].roles.sort()).toEqual(["cl1", "dl1", "l0"]);
    expect(rows[1].nets).toEqual(["dag"]);
  });
  it("no IP is no evidence of shared hardware: a shared id alone does not merge", () => {
    const sameId = row({ pick: { kind: "metanode", meta: { id: "dor" } as never }, id: "v1" });
    expect(buildRoster([validator, sameId])).toHaveLength(2);
  });
  it("a row keeps its key when an EARLIER row leaves the list", () => {
    const other = row({ pick: { kind: "l0" }, id: "v2" });
    const before = buildRoster([validator, other]);
    const after = buildRoster([other]);
    expect(after[0].key).toBe(before[1].key);
  });
});

describe("sortRoster", () => {
  it("sorts by column with nulls last, and flips with dir", () => {
    const rows = buildRoster([metaNode, validator]);
    expect(sortRoster(rows, "city", 1).map((r) => r.node.city)).toEqual(["Ashburn", "Berlin"]);
    expect(sortRoster(rows, "city", -1).map((r) => r.node.city)).toEqual(["Berlin", "Ashburn"]);
    const noCity = buildRoster([row({ pick: { kind: "l1" }, city: null, id: "x" }), validator]);
    expect(sortRoster(noCity, "city", 1).map((r) => r.node.city)).toEqual(["Berlin", null]);
  });
  it("the Network column sorts the DISPLAYED ticker, not the hidden id", () => {
    // A real catalog pair whose two orders disagree: by address Dor (DAG0Cy…) < BioFi (DAG6A8…),
    // by name BioFi < Dor Technologies. Sorting the id ordered hex nobody sees (2026-08-13).
    const dor = "DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM";
    const biofi = "DAG6A8Dw78yWv9z8pHqjJ4JVwSqq9V9Ha7CRUQnY";
    const rows = buildRoster([
      row({ pick: { kind: "metanode", meta: { id: dor } as never }, id: "a" }),
      row({ pick: { kind: "metanode", meta: { id: biofi } as never }, id: "b" }),
    ]);
    expect(sortRoster(rows, "net", 1).map((r) => r.netName)).toEqual(["BIOFI", "DOR"]);
  });
});

describe("groupRosterByCountry (the phone Geography roster)", () => {
  it("runs countries busiest first, cities in order inside, the unlocated last", () => {
    const at = (id: string, country: string | null, city: string | null) =>
      row({ pick: { kind: "l0", geo: { cc: "xx", city: city ?? undefined } } as never, id, country, city });
    const rows = buildRoster([
      at("a", "Germany", "Nuremberg"), at("b", "Finland", "Helsinki"), at("c", "Germany", "Falkenstein"),
      at("d", null, null), at("e", "Austria", "Vienna"),
    ]);
    const g = groupRosterByCountry(rows);
    expect(g.map((x) => [x.country, x.rows.map((r) => r.node.city)])).toEqual([
      ["Germany", ["Falkenstein", "Nuremberg"]],
      ["Austria", ["Vienna"]],
      ["Finland", ["Helsinki"]],
      [null, [null]],
    ]);
  });
});

describe("groupRosterByNetwork (the phone Hypergraph roster)", () => {
  const at = (ip: string) => ({ ip }) as never;
  it("puts a shared machine under each of its networks with that network's roles; the DAG leads, then busiest first", () => {
    const dagRec = row({ pick: { kind: "l0", node: at("1.2.3.4") } as never, id: "m1", roles: ["l0", "cl1"] });
    const upRec = row({ pick: { kind: "metanode", meta: { id: "up" } as never, node: at("1.2.3.4") } as never, id: "m1", roles: ["dl1"] });
    const up2 = row({ pick: { kind: "metanode", meta: { id: "up" } as never, node: at("5.5.5.5") } as never, id: "m3", roles: ["l0"] });
    const dor = row({ pick: { kind: "metanode", meta: { id: "dor" } as never, node: at("6.6.6.6") } as never, id: "m4", roles: ["l0"] });
    const g = groupRosterByNetwork(buildRoster([dagRec, upRec, up2, dor]));
    expect(g.map((x) => [x.netId, x.entries.map((e) => e.rec.id)])).toEqual([
      ["dag", ["m1"]],
      ["up", ["m1", "m3"]],
      ["dor", ["m4"]],
    ]);
    expect(g[0].entries[0].roles.sort()).toEqual(["cl1", "l0"]);
    expect(g[1].entries[0].roles).toEqual(["dl1"]);
  });
  it("a catalog co-tenant the list does not show adds no plate", () => {
    const upOnly = row({ pick: { kind: "metanode", meta: { id: "up" } as never, node: at("1.2.3.4") } as never, id: "m1" });
    const metaList = [{ id: "dag", nodes: [{ ip: "1.2.3.4" }] }] as never;
    const rows = buildRoster([upOnly], metaList);
    expect(rows[0].nets).toContain("dag");
    expect(groupRosterByNetwork(rows).map((x) => x.netId)).toEqual(["up"]);
  });
});
