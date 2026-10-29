import { describe, it, expect } from "vitest";
import { mergeDagClusters, type DagNode } from "./dagCore";

// THE DAG'S CLUSTER MERGE — one rule for the live Hypergraph's core and the trends sampler's DAG
// tallies, so a hybrid validator is one node on both.

const n = (id: string, ip: string, state?: string) => ({ id, ip, state });

describe("mergeDagClusters", () => {
  it("a validator in both clusters is ONE hybrid node, l0 first, with the consensus layer's state", () => {
    const [a] = mergeDagClusters([n("a", "1.1.1.1", "Ready")], [n("a", "1.1.1.1", "Observing")]);
    expect(a).toEqual<DagNode>({ id: "a", ip: "1.1.1.1", state: "Ready", roles: ["l0", "cl1"], layer: "l0" });
  });

  it("an L1-only validator is a dedicated currency node", () => {
    expect(mergeDagClusters([], [n("b", "2.2.2.2", "Ready")])).toEqual([{ id: "b", ip: "2.2.2.2", state: "Ready", roles: ["cl1"], layer: "cl1" }]);
  });

  it("skips an entry without an id, and takes the ip from whichever cluster has one", () => {
    const out = mergeDagClusters([{ ip: "9.9.9.9" } as never, n("c", "", "Ready")], [n("c", "3.3.3.3")]);
    expect(out).toEqual([{ id: "c", ip: "3.3.3.3", state: "Ready", roles: ["l0", "cl1"], layer: "l0" }]);
  });

  it("answers in id order whatever order the clusters list them (the scene places nodes by index)", () => {
    const out = mergeDagClusters([n("z", "1.1.1.1"), n("m", "2.2.2.2")], [n("a", "3.3.3.3"), n("z", "1.1.1.1")]);
    expect(out.map((x) => x.id)).toEqual(["a", "m", "z"]);
    expect(out.map((x) => x.roles.join("+"))).toEqual(["cl1", "l0", "l0+cl1"]);
  });
});
