import { describe, it, expect } from "vitest";
import type { Mode } from "@/src/store/store";
import { VIEW_POLICIES } from "./viewPolicy";

const MODES: Mode[] = ["hyper", "geo", "ledger", "status", "transactions", "staking"];
const CANVAS_MODES: Mode[] = ["hyper", "geo", "ledger"];
const FLAT_MODES: Mode[] = ["status", "transactions", "staking"];

describe("VIEW_POLICIES", () => {
  it("defines exactly the six modes", () => {
    expect(Object.keys(VIEW_POLICIES).sort()).toEqual([...MODES].sort());
  });

  it("gives canvas ONLY to the three 3D modes", () => {
    for (const m of CANVAS_MODES) expect(VIEW_POLICIES[m].canvas).toBe(true);
    for (const m of FLAT_MODES) expect(VIEW_POLICIES[m].canvas).toBe(false);
  });

  it("enables travelling-packet arcs ONLY in geo", () => {
    for (const m of MODES) expect(VIEW_POLICIES[m].sims.arcs).toBe(m === "geo");
  });

  it("makes NO view dofEligible (DoF dropped — user 2026-07-17: bokeh read as fuzz on the selection)", () => {
    for (const m of MODES) expect(VIEW_POLICIES[m].dofEligible).toBe(false);
  });

  it("morphs hyper→toHyper, geo→toGeo, ledger→frozen, flat→toHyper", () => {
    expect(VIEW_POLICIES.hyper.morph).toBe("toHyper");
    expect(VIEW_POLICIES.geo.morph).toBe("toGeo");
    expect(VIEW_POLICIES.ledger.morph).toBe("frozen");
    for (const m of FLAT_MODES) expect(VIEW_POLICIES[m].morph).toBe("toHyper");
  });

  it("shows the ledger chamber ONLY in ledger", () => {
    for (const m of MODES) expect(VIEW_POLICIES[m].show.ledger).toBe(m === "ledger");
  });

  // The bottom vitals band (2026-08-30 — the vitals leave the command bar) mounts in every 3D
  // view and never beside a flat view's `preview` wireframe (rule 10). Pinned here rather than
  // left to `BottomStream` because the flag governs TWO things that must agree: whether the band
  // mounts, and whether `--bottom-reserve` reserves any space for it.
  it("mounts the bottom vitals band in every 3D view and no flat one", () => {
    for (const m of MODES) expect(VIEW_POLICIES[m].vitalsLane).toBe(VIEW_POLICIES[m].canvas);
  });

  it("gives flat views NO sims, NO picks, NO DoF, NO canvas, NO show", () => {
    for (const m of FLAT_MODES) {
      const p = VIEW_POLICIES[m];
      expect(p.canvas).toBe(false);
      expect(p.dofEligible).toBe(false);
      expect(p.pickSources).toEqual([]);
      expect(Object.values(p.sims).every((v) => v === false)).toBe(true);
      expect(Object.values(p.show).every((v) => v === false)).toBe(true);
    }
  });

  it("resolves pick sources per the pick registry", () => {
    expect(VIEW_POLICIES.hyper.pickSources).toEqual(["globe", "layers"]);
    expect(VIEW_POLICIES.geo.pickSources).toEqual(["globe"]);
    expect(VIEW_POLICIES.ledger.pickSources).toEqual(["ledger", "globe"]);
  });

  it("freezes hub orbits everywhere except hyper", () => {
    for (const m of MODES) expect(VIEW_POLICIES[m].sims.hubOrbits).toBe(m === "hyper");
  });

  // The chip env sheen is per-view, and the RELATION is the design (the numbers may move):
  // the ledger runs LOWER than every other view — its trays hold coplanar flat chips, so at the
  // resting pose full sheen mirrors on every chip at once and washes the tray toward white — but
  // NOT zero: zero went bland and dropped the parked grids' bloom in one visible step at the
  // transition boundary (user, 2026-08-30, both directions the same day).
  it("keeps the ledger's chip env sheen lowest but above zero", () => {
    const ledger = VIEW_POLICIES.ledger.chipEnv;
    expect(ledger).toBeGreaterThan(0);
    for (const m of MODES) {
      if (m !== "ledger") expect(VIEW_POLICIES[m].chipEnv).toBeGreaterThan(ledger);
    }
  });
});
