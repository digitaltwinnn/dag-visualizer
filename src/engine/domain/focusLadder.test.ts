import { describe, it, expect } from "vitest";
import { LADDERS, LEVEL_CARRY, finerLevels, type SelectionSnapshot } from "./focusLadder";

const sel = (over: Partial<SelectionSnapshot> = {}): SelectionSnapshot => ({
  inspectIsNode: false, cohort: null, country: null, layerId: null, filter: "all", ...over,
});
const COHORT = { cc: "DE", city: "Falkenstein", isp: "Hetzner" };

describe("focusLadder — the per-view rung tables (spec 2026-07-18)", () => {
  it("pins each view's rung order, finest→coarsest", () => {
    expect(LADDERS.geo.map((r) => r.level)).toEqual(["node", "cohort", "country", "network", "all"]);
    expect(LADDERS.hyper.map((r) => r.level)).toEqual(["node", "network", "all"]);
    expect(LADDERS.ledger.map((r) => r.level)).toEqual(["node", "layer", "all"]);
  });

  it("every ladder ends in an unconditional 'all' rung (the walk always resolves)", () => {
    for (const rungs of Object.values(LADDERS)) {
      const last = rungs[rungs.length - 1];
      expect(last.level).toBe("all");
      expect(last.active(sel())).toBe(true);
    }
  });

  it("active() truth table — geo", () => {
    const [node, cohort, country, network] = LADDERS.geo;
    expect(node.active(sel({ inspectIsNode: true }))).toBe(true);
    expect(node.active(sel())).toBe(false);
    expect(cohort.active(sel({ cohort: COHORT }))).toBe(true);
    expect(cohort.active(sel())).toBe(false);
    expect(country.active(sel({ country: "DE" }))).toBe(true);
    expect(country.active(sel())).toBe(false);
    expect(network.active(sel({ filter: "dor" }))).toBe(true);
    expect(network.active(sel({ filter: "all" }))).toBe(false);
  });

  it("active() truth table — hyper and ledger", () => {
    expect(LADDERS.hyper[0].active(sel({ inspectIsNode: true }))).toBe(true);
    expect(LADDERS.hyper[1].active(sel({ filter: "dag" }))).toBe(true);
    expect(LADDERS.hyper[1].active(sel())).toBe(false);
    expect(LADDERS.ledger[0].active(sel({ inspectIsNode: true }))).toBe(true);
    expect(LADDERS.ledger[1].active(sel({ layerId: "ml0" }))).toBe(true);
    expect(LADDERS.ledger[1].active(sel())).toBe(false);
  });

  it("resolver keys are view-prefixed and unique within a view", () => {
    for (const [view, rungs] of Object.entries(LADDERS)) {
      const keys = rungs.map((r) => r.resolver);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of keys) expect(k.startsWith(view === "hyper" ? "hyper" : view)).toBe(true);
    }
  });

  it("finerLevels — the deselect-stepping data pickActions consumes", () => {
    expect(finerLevels("geo", "country")).toEqual(["node", "cohort"]);
    expect(finerLevels("geo", "cohort")).toEqual(["node"]);
    expect(finerLevels("geo", "node")).toEqual([]);
    expect(finerLevels("ledger", "layer")).toEqual(["node"]);
    expect(finerLevels("hyper", "network")).toEqual(["node"]);
  });

  it("carry policy — universal subjects carry, view-scoped rungs clear (spec Part 2)", () => {
    expect(LEVEL_CARRY.node).toBe("always");
    expect(LEVEL_CARRY.network).toBe("always");
    expect(LEVEL_CARRY.cohort).toBe("view-scoped");
    expect(LEVEL_CARRY.country).toBe("view-scoped");
    expect(LEVEL_CARRY.layer).toBe("view-scoped");
  });
});
