import { describe, expect, it } from "vitest";
import { matchSignerRow, resolveSignerIps } from "@/src/data/network";
import type { MetaInfo, NodeRow } from "@/src/data/types";

const meta = (id: string, nodes: { ip?: string; id?: string }[]): MetaInfo => ({
  id,
  name: id,
  color: 0,
  nodes,
  located: nodes.length,
  countriesCount: 1,
});

describe("resolveSignerIps", () => {
  it("resolves a truncated signer prefix to its node's ip (the scene's glow key)", () => {
    const metaList = [
      meta("dor", [
        { ip: "1.1.1.1", id: "abcdef0123456789" },
        { ip: "2.2.2.2", id: "ffffff9999999999" },
      ]),
    ];
    expect(resolveSignerIps(metaList, "dor", ["abcdef01"])).toEqual(["1.1.1.1"]);
  });

  it("matches every node whose id shares the prefix (several signers, several nodes)", () => {
    const metaList = [
      meta("dor", [
        { ip: "1.1.1.1", id: "abcdef0123456789" },
        { ip: "2.2.2.2", id: "ffffff9999999999" },
        { ip: "3.3.3.3", id: "abcdef0198765432" },
      ]),
    ];
    expect(resolveSignerIps(metaList, "dor", ["abcdef01"])?.sort()).toEqual(["1.1.1.1", "3.3.3.3"].sort());
  });

  it("returns null when nothing is selected, the metagraph is unknown, or nothing matches", () => {
    const metaList = [meta("dor", [{ ip: "1.1.1.1", id: "abcdef0123456789" }])];
    expect(resolveSignerIps(metaList, "dor", null)).toBeNull();
    expect(resolveSignerIps(metaList, "dor", [])).toBeNull();
    expect(resolveSignerIps(metaList, "unknown", ["abcdef01"])).toBeNull();
    expect(resolveSignerIps(metaList, "dor", ["zzzzzzzz"])).toBeNull();
  });

  it("skips nodes missing an ip or an id (can't be matched or can't be glowed)", () => {
    const metaList = [
      meta("dor", [
        { id: "abcdef0123456789" }, // no ip — can't be glowed even if the id matches
        { ip: "9.9.9.9" }, // no id — can't be matched
      ]),
    ];
    expect(resolveSignerIps(metaList, "dor", ["abcdef01"])).toBeNull();
  });
});

// The card-side twin: a signer prefix → the live NodeRow the metagraph-snapshot card renders.
const nodeRow = (metaId: string, id: string, city: string): NodeRow => ({
  pick: { kind: "metanode", node: { id, ip: `ip-${id}` }, meta: { id: metaId } as never },
  label: city,
  id,
  cc: "DE",
  country: "Germany",
  city,
  layer: "l0",
  roles: ["l0"],
});

describe("matchSignerRow", () => {
  const rows = [
    nodeRow("dor", "abcdef0123456789", "Falkenstein"),
    nodeRow("dor", "ffffff9999999999", "Helsinki"),
    nodeRow("ded", "abcdef0100000000", "Ashburn"), // same prefix, ANOTHER network
  ];

  it("resolves a truncated signer to its own network's row", () => {
    expect(matchSignerRow(rows, "dor", "abcdef01")?.city).toBe("Falkenstein");
  });

  it("is scoped to the snapshot's network — a prefix collision elsewhere never wins", () => {
    expect(matchSignerRow(rows, "ded", "abcdef01")?.city).toBe("Ashburn");
  });

  it("returns null for an empty prefix, an unknown network, or no match", () => {
    expect(matchSignerRow(rows, "dor", "")).toBeNull();
    expect(matchSignerRow(rows, "nope", "abcdef01")).toBeNull();
    expect(matchSignerRow(rows, "dor", "zzzzzzzz")).toBeNull();
  });
});
