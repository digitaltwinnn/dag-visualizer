import { describe, expect, it } from "vitest";
import { buildRoster, sortRoster } from "@/src/data/roster";
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
});
