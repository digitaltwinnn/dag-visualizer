import { describe, expect, it } from "vitest";
import { matchSignerRow, nodeSigned, resolveSigner, resolveSignerIps, SIGNER_GROUPS, SIGNER_UNKNOWN } from "@/src/data/network";
import type { MetaInfo, NodeRow } from "@/src/data/types";

const meta = (id: string, nodes: { ip?: string; id?: string; ids?: string[] }[]): MetaInfo => ({
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

  // The regression that motivated `NodeInfo.ids` (found live 2026-08-09): a machine's peer id is per
  // LAYER, so a hybrid's dL1 id is NOT the l0 id in `id`. Data blocks are signed by the dL1 cluster,
  // so matching `id` alone left every hybrid data-block signer unresolvable while the machine sat
  // right there in the list.
  it("matches a hybrid machine's SECONDARY layer id, not only its primary one", () => {
    const metaList = [
      meta("dor", [
        { ip: "1.1.1.1", id: "c54ccbea2a000000", ids: ["c54ccbea2a000000", "5faa4745ce000000"] },
        { ip: "2.2.2.2", id: "ffffff9999999999", ids: ["ffffff9999999999"] },
      ]),
    ];
    expect(resolveSignerIps(metaList, "dor", ["c54ccbea"])).toEqual(["1.1.1.1"]); // l0 proof signer
    expect(resolveSignerIps(metaList, "dor", ["5faa4745"])).toEqual(["1.1.1.1"]); // its dL1 identity
  });
});

// The card-side twin: a signer prefix → the live NodeRow the metagraph-snapshot card renders.
const nodeRow = (metaId: string, id: string, city: string, ids?: string[]): NodeRow => ({
  pick: { kind: "metanode", node: { id, ip: `ip-${id}` }, meta: { id: metaId } as never },
  label: city,
  id,
  ids,
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

  // The card-side half of the per-layer-id regression above: a DATA-BLOCK signer names the machine
  // by its dL1 id, so the row must be findable by any of its layer ids.
  it("finds a hybrid by any of its layer ids, so a data-block signer resolves too", () => {
    const hybrid = [nodeRow("dor", "c54ccbea2a000000", "Seattle", ["c54ccbea2a000000", "5faa4745ce000000"])];
    expect(matchSignerRow(hybrid, "dor", "c54ccbea")?.city).toBe("Seattle");
    expect(matchSignerRow(hybrid, "dor", "5faa4745")?.city).toBe("Seattle");
  });
});

// The words for WHICH CLUSTER signed — one home, because the confusion the constant answers (DOR's
// "signed by" is always 3 of its 20 machines) only clears if all three signer surfaces name the same
// layer the same way.
describe("nodeSigned", () => {
  it("matches across every LAYER id, not the primary alone (a hybrid's L0 id differs)", () => {
    const hybrid = { id: "dl1aaaa", ids: ["dl1aaaa", "l0bbbb"] };
    expect(nodeSigned(hybrid, ["l0bb"])).toBe(true); // the L0 layer signed the proof
    expect(nodeSigned(hybrid, ["zzzz"])).toBe(false);
    expect(nodeSigned(hybrid, null)).toBe(false);
    expect(nodeSigned(hybrid, [])).toBe(false);
  });
});

describe("SIGNER_GROUPS", () => {
  it("names a distinct producing layer for each group, in every register a site needs", () => {
    expect(SIGNER_GROUPS.proof.layer).not.toBe(SIGNER_GROUPS.dataBlocks.layer);
    expect(SIGNER_GROUPS.proof.who).not.toBe(SIGNER_GROUPS.dataBlocks.who);
    for (const g of [SIGNER_GROUPS.proof, SIGNER_GROUPS.dataBlocks, SIGNER_GROUPS.globalProof]) {
      for (const s of [g.label, g.layer, g.who, g.title]) expect(s.length).toBeGreaterThan(0);
    }
  });

  it("names the LAYER in each group's wording — that is the whole point of the constant", () => {
    // The proof is the L0 cluster's; the blocks are the dL1 cluster's. A group whose words
    // don't say which layer signed is back to the bare number the user found confusing.
    expect(SIGNER_GROUPS.proof.who).toMatch(/L0/);
    expect(SIGNER_GROUPS.proof.title).toMatch(/L0/);
    expect(SIGNER_GROUPS.dataBlocks.who).toMatch(/L1/);
    expect(SIGNER_GROUPS.dataBlocks.title).toMatch(/L1/);
  });

  // The vocabulary rule made executable (user, 2026-08-10 — "why do we call it 'validators' for
  // global snapshot and in metagraph L0 validators?"). A VALIDATOR IS A LAYER, so the word is
  // never bare: every `who` is a count's noun phrase and must lead with the layer that acted.
  // The global snapshot is included deliberately — it was the surface that read "155 validators",
  // and under the unified node model its seal is the DAG's own L0 cluster, no different in kind.
  it("qualifies every `who` with a layer code — the word 'validators' is never bare", () => {
    for (const g of Object.values(SIGNER_GROUPS)) {
      expect(g.who).toMatch(/^(L0|cL1|dL1) validators$/);
    }
  });

  // ONE layer vocabulary app-wide: the codes the composition chips use. "data-L1" / "currency-L1"
  // were a second dialect for the same three layers.
  it("spells layers in the app's own codes, not a long form", () => {
    for (const g of Object.values(SIGNER_GROUPS)) {
      for (const s of [g.layer, g.who, g.title]) expect(s).not.toMatch(/data-L1|currency-L1/);
    }
  });
});

// The generic unknown-signer rule (user, 2026-08-09 — "I want it to be a generic solution and not a
// spot solution"). `resolveSigner` is the ONE decision both signer lists read, and it is keyed on
// the DATA: the unlisted channel is not a special case, it is just the branch every network takes
// when nothing about its cluster is published.
describe("resolveSigner", () => {
  const rows = [
    nodeRow("dor", "abcdef0123456789", "Falkenstein"),
    nodeRow("ded", "ffffff9999999999", "Ashburn"),
  ];

  it("resolves to the node, which is the only arm that carries one", () => {
    const r = resolveSigner(rows, "dor", "abcdef01");
    expect(r.known).toBe(true);
    expect(r.known && r.row.city).toBe("Falkenstein");
  });

  it("says NETWORK when no row of that network is here at all (the unlisted case)", () => {
    // An unlisted channel's id never appears in any published node row, so every one of its
    // signers takes this branch — with no mention of "unlisted" anywhere in the logic.
    expect(resolveSigner(rows, "DAG5unknownchannel", "c54ccbea")).toEqual({ known: false, reason: "network" });
    expect(resolveSigner([], "dor", "abcdef01")).toEqual({ known: false, reason: "network" });
  });

  it("says NODE when the network IS here but nothing carries the prefix", () => {
    expect(resolveSigner(rows, "dor", "zzzzzzzz")).toEqual({ known: false, reason: "node" });
    // An empty prefix can't match, and the network is present — same branch.
    expect(resolveSigner(rows, "ded", "")).toEqual({ known: false, reason: "node" });
  });

  it("carries words for both unresolved reasons, and they differ", () => {
    // Both render sites read these, so a missing or duplicated entry would let the two lists
    // describe the same id differently.
    expect(SIGNER_UNKNOWN.network.label).not.toBe(SIGNER_UNKNOWN.node.label);
    for (const w of [SIGNER_UNKNOWN.network, SIGNER_UNKNOWN.node]) {
      expect(w.label.length).toBeGreaterThan(0);
      expect(w.title.length).toBeGreaterThan(0);
    }
  });
});
