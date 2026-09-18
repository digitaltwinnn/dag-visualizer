import { describe, it, expect } from "vitest";
import type { Mode } from "@/src/store/store";
import { VIEW_POLICIES } from "./viewPolicy";
import { is3D } from "./viewTransition";

const MODES: Mode[] = ["hyper", "geo", "ledger", "trend", "soon"];
const CANVAS_MODES: Mode[] = ["hyper", "geo", "ledger", "trend"];
const FLAT_MODES: Mode[] = ["soon"];

describe("VIEW_POLICIES", () => {
  it("defines exactly the five modes", () => {
    expect(Object.keys(VIEW_POLICIES).sort()).toEqual([...MODES].sort());
  });

  it("gives canvas ONLY to the four 3D modes", () => {
    for (const m of CANVAS_MODES) expect(VIEW_POLICIES[m].canvas).toBe(true);
    for (const m of FLAT_MODES) expect(VIEW_POLICIES[m].canvas).toBe(false);
  });

  it("enables travelling-packet arcs ONLY in geo", () => {
    for (const m of MODES) expect(VIEW_POLICIES[m].sims.arcs).toBe(m === "geo");
  });

  // DoF was dropped on 2026-07-17 (the bokeh read as fuzz on the selection) and restored on
  // 2026-09-13 once the sharp zone and hyper's bloom had both been re-tuned — see the policy
  // row's own note. What the rule has always been is that DoF is HYPER'S ALONE: geo's globe
  // doesn't need it, the ledger's chamber is coplanar, and a flat view has no depth to blur.
  it("makes only hyper dofEligible", () => {
    for (const m of MODES) expect(VIEW_POLICIES[m].dofEligible).toBe(m === "hyper");
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

  // The trends GROUND is the one thing TrendsView draws in WebGL, and it belongs to that view
  // alone — the DOM chart planes would otherwise stand in a void. It is a `show` row rather than
  // a `mode === "trend"` in the Engine for convention 7's reason: the Engine owns root-group
  // visibility (rule 6), so the view has to be TOLD whether it is on, and the allow-list is where
  // a fifth view answers that question for itself.
  it("shows the trends ground ONLY in trend", () => {
    for (const m of MODES) expect(VIEW_POLICIES[m].show.trendGround).toBe(m === "trend");
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

describe("the trends view is registered and inert", () => {
  it("is a 3D view", () => {
    expect(is3D("trend")).toBe(true);
  });

  it("shows no shared geometry and picks nothing", () => {
    const p = VIEW_POLICIES.trend;
    expect(p.canvas).toBe(true);
    expect(p.show).toEqual({ hyperFurniture: false, globeSurface: false, ledger: false, trendGround: true });
    expect(p.pickSources).toEqual([]);
    expect(p.sims).toEqual({ arcs: false, hubOrbits: false, globeSpin: false });
  });

  it("parks the fleet rather than placing it", () => {
    expect(VIEW_POLICIES.trend.fleet).toBe("parked");
    expect(VIEW_POLICIES.hyper.fleet).toBe("placed");
  });

  it("answers RAW with the document, not the records layer", () => {
    expect(VIEW_POLICIES.trend.rawSurface).toBe("document");
    expect(VIEW_POLICIES.ledger.rawSurface).toBe("records");
  });

  // Controller ruling: `chartStack` is the flag a later task's `TrendStack` component gates on
  // (convention 7 — gate on the view a behaviour is FOR, never `mode === "x"`).
  it("mounts the chart-plane stack only in trend", () => {
    expect(VIEW_POLICIES.trend.chartStack).toBe(true);
    expect(VIEW_POLICIES.hyper.chartStack).toBe(false);
  });

  // ⚠️ THE IDLE ORBIT IS A ROW, NOT A DENY-LIST (2026-09-18). `Engine._applyDestLayout` carried
  // `controls.autoRotate = mode !== "geo"` — the shape convention 7 exists to prevent — and it had
  // already gone wrong: the trends view inherited hyper's spin by default, which slid a page of
  // charts sideways forever and kept `TrendStackSync`'s idle skip from ever engaging. Every value
  // below is what the old expression GAVE that view, so this pins the preservation as much as the
  // rule: `ledger` is false because its branch in `_applyDestLayout` returns before the generic
  // line ever ran, and `hyper` is true because that line did run for it — even though its camera
  // does not in fact orbit, `CameraDirector.focusFilter` having switched it off a moment later.
  // Measured in the browser after the change: camera drift over 1.5s idle is 0 in all four views.
  it("says per view whether the camera idles in an orbit", () => {
    expect(VIEW_POLICIES.hyper.autoRotate).toBe(true);
    expect(VIEW_POLICIES.geo.autoRotate).toBe(false);
    expect(VIEW_POLICIES.ledger.autoRotate).toBe(false);
    expect(VIEW_POLICIES.trend.autoRotate).toBe(false);
    // The flat placeholder never applies a destination layout, so nothing reads its row — it keeps
    // the old expression's answer so wiring one up later changes nothing by accident.
    expect(VIEW_POLICIES.soon.autoRotate).toBe(true);
  });
});
