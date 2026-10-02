import { describe, it, expect } from "vitest";
import { CATALOG } from "@/src/engine/config";
import { currentIdOf, foldLineage, isTracked, lineageIds } from "./lineage";

const op = (n: string) => (n.endsWith("gapMax") ? "max" : n.startsWith("f.") ? "set" : "add") as "add" | "max" | "set";
// The catalog's own re-registered network — the fact these rules exist for.
const row = CATALOG.mainnet.find((m) => m.formerIds?.length)!;
const [former] = row.formerIds!;

describe("address lineage", () => {
  it("the catalog carries at least one re-registered network", () => {
    expect(row).toBeTruthy();
    expect(former).not.toBe(row.id);
  });
  it("a former address belongs to its network; an unknown one is itself", () => {
    expect(currentIdOf("mainnet", former)).toBe(row.id);
    expect(currentIdOf("mainnet", row.id)).toBe(row.id);
    expect(currentIdOf("mainnet", "DAGnobody")).toBe("DAGnobody");
    expect(isTracked("mainnet", former)).toBe(true);
    expect(isTracked("mainnet", "DAGnobody")).toBe(false);
  });
  it("lineageIds lists current and former addresses", () => {
    const ids = lineageIds("mainnet");
    expect(ids).toContain(row.id);
    expect(ids).toContain(former);
    expect(ids.length).toBe(CATALOG.mainnet.length + CATALOG.mainnet.reduce((n, m) => n + (m.formerIds?.length ?? 0), 0));
  });
  it("an unknown network folds nothing and lists nothing", () => {
    expect(lineageIds("nope")).toEqual([]);
    const s = { "m.x.snaps": [1] };
    expect(foldLineage("nope", s, op)).toBe(s);
  });
});

describe("foldLineage (one history per network)", () => {
  it("joins the retired chain's buckets to the current chain's and drops the former family", () => {
    const out = foldLineage("mainnet", {
      [`m.${former}.snaps`]: [5, 7, 0, null],
      [`m.${row.id}.snaps`]: [null, 0, 3, 4],
      "g.ticks": [1, 1, 1, 1],
    }, op);
    expect(out[`m.${row.id}.snaps`]).toEqual([5, 7, 3, 4]);
    expect(out[`m.${former}.snaps`]).toBeUndefined();
    expect(out["g.ticks"]).toEqual([1, 1, 1, 1]);
  });
  it("a metric only the former chain has becomes the network's", () => {
    const out = foldLineage("mainnet", { [`m.${former}.fee`]: [2, null] }, op);
    expect(out[`m.${row.id}.fee`]).toEqual([2, null]);
  });
  it("maxima take the larger; a bucket neither measured stays null", () => {
    const out = foldLineage("mainnet", {
      [`m.${former}.gapMax`]: [9, null, null],
      [`m.${row.id}.gapMax`]: [4, 6, null],
    }, op);
    expect(out[`m.${row.id}.gapMax`]).toEqual([9, 6, null]);
  });
  it("folds every family that names the address — the fleet gauges too", () => {
    const out = foldLineage("mainnet", {
      [`f.nodes.${former}`]: [3, null],
      [`f.nodes.${row.id}`]: [null, 3],
      [`f.layer.${former}.l0`]: [3, null],
    }, op);
    expect(out[`f.nodes.${row.id}`]).toEqual([3, 3]);
    expect(out[`f.layer.${row.id}.l0`]).toEqual([3, null]);
    expect(Object.keys(out).some((k) => k.includes(former))).toBe(false);
  });
});
