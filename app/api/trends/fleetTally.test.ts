import { describe, it, expect } from "vitest";
import { fleetTallies, tallyNetwork } from "./fleetTally";

// The sampler's layer and make-up arithmetic, one rule for every network — the DAG included
// (2026-10-29), with the fleet-wide layer lines left metagraph-only on purpose.

const hybrid = { roles: ["l0", "cl1"], layer: "l0" };
const cl1 = { roles: ["cl1"], layer: "cl1" };
const dag = [hybrid, cl1, cl1];
const metas = [{ id: "m", nodes: [{ roles: ["l0", "cl1", "dl1"], layer: "l0" }, { roles: ["dl1"], layer: "dl1" }, { roles: ["dl1"], layer: "dl1" }] }];

describe("tallyNetwork", () => {
  it("roles overlap, types partition: a hybrid counts in every layer it runs and once as a make-up", () => {
    expect(tallyNetwork(dag)).toEqual({ layers: { l0: 1, cl1: 3 }, types: { "l0+cl1": 1, cl1: 2 } });
    expect(Object.values(tallyNetwork(dag).types).reduce((a, b) => a + b, 0)).toBe(dag.length);
  });
  it("falls back to the single layer when a node states no roles, and 'none' when it states nothing", () => {
    expect(tallyNetwork([{ layer: "dl1" }, {}])).toEqual({ layers: { dl1: 1 }, types: { dl1: 1, none: 1 } });
  });
});

describe("fleetTallies", () => {
  it("tallies the DAG's nodes like a metagraph's, under `dag`", () => {
    const t = fleetTallies(metas, dag);
    expect(t.perNetTypes.dag).toEqual({ "l0+cl1": 1, cl1: 2 });
    expect(t.perNetLayers.dag).toEqual({ l0: 1, cl1: 3 });
    expect(t.perNetLayers.m).toEqual({ l0: 1, cl1: 1, dl1: 3 });
    expect(t.perNetTypes.m).toEqual({ "l0+cl1+dl1": 1, dl1: 2 });
  });
  it("the fleet-wide layers stay metagraph-only, with or without the DAG's nodes", () => {
    expect(fleetTallies(metas, dag).layers).toEqual({ l0: 1, cl1: 1, dl1: 3 });
    expect(fleetTallies(metas, dag).layers).toEqual(fleetTallies(metas, null).layers);
  });
  it("a cluster read that failed (null) leaves the DAG ABSENT — no key, never zeros", () => {
    const t = fleetTallies(metas, null);
    expect("dag" in t.perNetLayers).toBe(false);
    expect("dag" in t.perNetTypes).toBe(false);
  });
});
