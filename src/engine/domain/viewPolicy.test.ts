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

  // The band is ONE mounted surface whose CONTENT is per view (2026-09-18): `vitalsLane` says
  // whether it mounts and reserves space, `bandContent` says what it holds. Pinned as an
  // allow-list rather than "everything except trend", which is the deny-list shape convention 7
  // exists to prevent — a sixth view must answer for itself.
  it("fills the band with vitals cells everywhere but the trends view, which gets the timeline", () => {
    expect(VIEW_POLICIES.trend.bandContent).toBe("timeline");
    for (const m of MODES) {
      if (m === "trend") continue;
      expect(VIEW_POLICIES[m].bandContent, `${m} should still show the vitals cells`).toBe("vitals");
    }
  });

  it("states a band's shared window once — only the Snapshots band has one", () => {
    // Its cards are all cut from one measured window, so the band says it once above its corner
    // and the cards stay quiet; every other band holds live readings, or (History) its own range.
    expect(VIEW_POLICIES.ledger.bandWindow).toBe("24h");
    for (const m of ["hyper", "geo", "trend", "soon"] as const) {
      expect(VIEW_POLICIES[m].bandWindow, `${m} has no shared window to state`).toBeNull();
    }
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
  // …and geo joined it low on 2026-09-28 (a co-located stack of thirty caps is denser than a
  // tray, and read as "too shiny" at the ledger's half): the two DENSE-chip views run below the
  // rest, both above zero. Hyper's spheres skip the env and its row states the full gain.
  it("keeps the two dense-chip views' sheen low but above zero, below every other view", () => {
    const dense = ["ledger", "geo"] as const;
    for (const d of dense) expect(VIEW_POLICIES[d].chipEnv).toBeGreaterThan(0);
    const ceiling = Math.max(...dense.map((d) => VIEW_POLICIES[d].chipEnv));
    for (const m of MODES) {
      if (!(dense as readonly string[]).includes(m)) expect(VIEW_POLICIES[m].chipEnv).toBeGreaterThan(ceiling);
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

  // The explorer follows the open card down — except in a view whose first level is its own AXIS
  // (Snapshots: the global snapshots in time), where it rests on that list (user, 2026-10-07).
  it("rests the explorer on the axis only where the root list IS the view's axis", () => {
    expect(VIEW_POLICIES.ledger.explorerDepth).toBe("axis");
    for (const m of ["hyper", "geo", "trend", "soon"] as const) expect(VIEW_POLICIES[m].explorerDepth).toBe("follow");
  });

  it("answers RAW with a door onto the records, which History has none of its own", () => {
    expect(VIEW_POLICIES.trend.rawSurface).toBe("buckets");
    expect(VIEW_POLICIES.ledger.rawSurface).toBe("records");
  });

  // `chartStack` is the flag `components/TrendStack.tsx` gates its mount on (convention 7 — gate
  // on the view a behaviour is FOR, never `mode === "x"`).
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
  it("switches the pointer orbit off ONLY in trend — its billboard deck moves by the focus re-deal, and zoom stays", () => {
    for (const m of MODES) expect(VIEW_POLICIES[m].rotate).toBe(m !== "trend");
  });

  // ⚠️ A NODE COMMITS ITS NETWORK ONLY IN HYPER (user, 2026-09-26 for geo, 2026-09-29 for the
  // ledger's explorer signer row). Was a `mode !== "geo"` deny-list in pickActions, which handed
  // the ledger hyper's filter-first by default.
  it("lets only hyper's node select commit the network filter", () => {
    for (const m of MODES) expect(VIEW_POLICIES[m].nodeCommitsNetwork).toBe(m === "hyper");
  });

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
