import { describe, it, expect } from "vitest";
import { ViewTransition, is3D, DUR_OUT, DUR_IN, FURN_IN, STAGGER_SPREAD, DOC_ROLL } from "./viewTransition";

const settled = (v: "hyper" | "geo" | "ledger" = "hyper") => {
  const tr = new ViewTransition();
  tr.settle(v);
  return tr;
};

describe("phase sequencing", () => {
  // The doc overlay's roll (DocLayer's text + NodeFabric's fleet fade share it): pinned by
  // RELATION, not number — it must fit inside the entering view's furniture build, or a leaving
  // document would still be rolling while the scene stands fully lit behind it.
  it("DOC_ROLL fits inside the furniture build", () => {
    expect(DOC_ROLL).toBeGreaterThan(0);
    expect(DOC_ROLL).toBeLessThanOrEqual(FURN_IN);
  });

  it("is idle after settle: inactive, current view's furniture full, weight 0", () => {
    const tr = settled("geo");
    expect(tr.active()).toBe(false);
    expect(tr.furnitureAlpha("geo")).toBe(1);
    expect(tr.furnitureAlpha("hyper")).toBe(0);
    expect(tr.gatherWeight(0, 10)).toBe(0);
  });

  it("runs OUT then IN and settles on the destination", () => {
    const tr = settled("hyper");
    tr.start("hyper", "ledger");
    expect(tr.phase).toBe("out");
    // advance to just before the boundary — no flip yet
    expect(tr.tick(DUR_OUT - 0.01)).toBe(false);
    // crossing DUR_OUT fires the boundary EXACTLY once
    expect(tr.tick(0.02)).toBe(true);
    expect(tr.phase).toBe("in");
    expect(tr.tick(0.01)).toBe(false); // never twice
    // finish IN → idle, settled on the destination
    tr.tick(DUR_IN);
    expect(tr.phase).toBe("idle");
    expect(tr.to).toBe("ledger");
    expect(tr.active()).toBe(false);
    expect(tr.furnitureAlpha("ledger")).toBe(1);
  });
});

describe("gatherWeight (staggered)", () => {
  it("rank 0 leads and the last rank still completes within the phase", () => {
    const tr = settled();
    tr.start("hyper", "geo");
    tr.tick(STAGGER_SPREAD / 2); // half the spread in
    expect(tr.gatherWeight(0, 20)).toBeGreaterThan(0); // leader is flying
    expect(tr.gatherWeight(19, 20)).toBe(0); //          last hasn't started
    tr.tick(DUR_OUT - STAGGER_SPREAD / 2 - 1e-9); //     end of OUT
    expect(tr.gatherWeight(19, 20)).toBeCloseTo(1, 5); // everyone gathered
  });

  it("is monotonic and clamped to [0,1] during OUT", () => {
    const tr = settled();
    tr.start("hyper", "geo");
    let prev = -1;
    for (let i = 0; i < 30; i++) {
      tr.tick(DUR_OUT / 30);
      const w = tr.gatherWeight(5, 10);
      expect(w).toBeGreaterThanOrEqual(Math.max(0, prev));
      expect(w).toBeLessThanOrEqual(1);
      prev = w;
    }
  });

  it("runs 1 -> 0 during IN (staggered dissolve)", () => {
    const tr = settled();
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT); // boundary crossed exactly (residual 0)
    expect(tr.gatherWeight(0, 10)).toBe(1);
    tr.tick(DUR_IN / 2);
    const mid = tr.gatherWeight(0, 10);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    tr.tick(DUR_IN / 2);
    expect(tr.gatherWeight(9, 10)).toBe(0);
  });

  it("a 1-count group never divides by zero", () => {
    const tr = settled();
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT / 2);
    expect(Number.isFinite(tr.gatherWeight(0, 1))).toBe(true);
  });
});

describe("furnitureAlpha exclusivity", () => {
  it("only the from-view is lit during OUT (fading), only the to-view during IN (rising)", () => {
    const tr = settled("hyper");
    tr.start("hyper", "ledger");
    tr.tick(DUR_OUT / 2);
    expect(tr.furnitureAlpha("hyper")).toBeGreaterThan(0);
    expect(tr.furnitureAlpha("hyper")).toBeLessThan(1);
    expect(tr.furnitureAlpha("ledger")).toBe(0);
    expect(tr.furnitureAlpha("geo")).toBe(0);
    tr.tick(DUR_OUT); // into IN
    expect(tr.furnitureAlpha("hyper")).toBe(0);
    expect(tr.furnitureAlpha("ledger")).toBeGreaterThan(0);
  });

  it("the from-view reaches exactly 0 at the boundary", () => {
    const tr = settled("geo");
    tr.start("geo", "hyper");
    tr.tick(DUR_OUT);
    expect(tr.furnitureAlpha("geo")).toBe(0);
  });

  it("IN decouples its ramps: the room is fully built while nodes are still placing", () => {
    // (user, 2026-07-17): furniture rides FURN_IN, node placement rides DUR_IN (3×) — at
    // FURN_IN into the IN phase the destination view is complete but the flight continues.
    const tr = settled("hyper");
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT); // boundary, exactly
    tr.tick(FURN_IN); // the furniture build completes here…
    expect(tr.furnitureAlpha("geo")).toBe(1);
    expect(tr.phase).toBe("in"); // …but the phase (node placement) is still running
    const w = tr.gatherWeight(0, 10);
    expect(w).toBeGreaterThan(0); // the lead node is still in flight
    expect(w).toBeLessThan(1);
    tr.tick(DUR_IN - FURN_IN); // the full placement window settles it
    expect(tr.phase).toBe("idle");
  });
});

describe("staging (the 'soon'-view parked state)", () => {
  it("stage() runs step 1 only: gathers, parks, fires NO boundary", () => {
    const tr = settled("hyper");
    tr.stage("hyper");
    expect(tr.phase).toBe("out");
    expect(tr.tick(DUR_OUT / 2)).toBe(false);
    expect(tr.furnitureAlpha("hyper")).toBeLessThan(1); // old view fading
    expect(tr.tick(DUR_OUT)).toBe(false); // OUT completes — parked, no boundary
    expect(tr.phase).toBe("staged");
    expect(tr.gatherWeight(0, 10)).toBe(1); // held at the grids
    expect(tr.gatherWeight(9, 10)).toBe(1);
    for (const v of ["hyper", "geo", "ledger"] as const) expect(tr.furnitureAlpha(v)).toBe(0);
    expect(tr.tick(10)).toBe(false); // parked indefinitely
    expect(tr.phase).toBe("staged");
  });

  it("place() from parked runs step 2 immediately (caller applies layout now)", () => {
    const tr = settled("geo");
    tr.stage("geo");
    tr.tick(DUR_OUT);
    expect(tr.place("ledger")).toBe("immediate");
    expect(tr.phase).toBe("in");
    expect(tr.gatherWeight(0, 10)).toBe(1); // dissolve starts from the grids
    tr.tick(DUR_IN);
    expect(tr.phase).toBe("idle");
    expect(tr.to).toBe("ledger");
    expect(tr.furnitureAlpha("ledger")).toBe(1);
  });

  it("place() mid-gather adopts the destination and defers to the normal boundary", () => {
    const tr = settled("hyper");
    tr.stage("hyper");
    tr.tick(DUR_OUT / 2);
    expect(tr.place("geo")).toBe("atBoundary");
    expect(tr.phase).toBe("out");
    expect(tr.to).toBe("geo");
    expect(tr.tick(DUR_OUT)).toBe(true); // the boundary fires as usual now
  });

  it("stage() from IN re-gathers with base-weight continuity", () => {
    const tr = settled("hyper");
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT);
    tr.tick(DUR_IN * 0.4);
    const w = tr.gatherWeight(0, 1);
    tr.stage("geo");
    expect(tr.phase).toBe("out");
    expect(tr.to).toBe(null);
    expect(tr.gatherWeight(0, 1)).toBeCloseTo(w, 5);
  });

  it("stageInstant() parks with no animation (flat-view boot)", () => {
    const tr = new ViewTransition();
    tr.stageInstant();
    expect(tr.phase).toBe("staged");
    expect(tr.gatherWeight(3, 8)).toBe(1);
    expect(tr.place("hyper")).toBe("immediate");
  });
});

describe("holdCamera (OUT-phase camera gate, spec A#6)", () => {
  it("is false settled, true through OUT, false again once the boundary flips to IN", () => {
    const tr = settled("hyper");
    expect(tr.holdCamera()).toBe(false);
    tr.start("hyper", "geo");
    expect(tr.holdCamera()).toBe(true);
    expect(tr.tick(DUR_OUT)).toBe(true); // boundary — tick() flips phase to "in" before returning
    expect(tr.holdCamera()).toBe(false);
    tr.tick(DUR_IN);
    expect(tr.phase).toBe("idle");
    expect(tr.holdCamera()).toBe(false);
  });

  it("holds through a parked gather too (stage()) and releases once instantly parked", () => {
    const tr = settled("hyper");
    tr.stage("hyper");
    expect(tr.holdCamera()).toBe(true); // out phase, gathering toward the grids
    expect(tr.tick(DUR_OUT)).toBe(false); // parks — no boundary
    expect(tr.phase).toBe("staged");
    expect(tr.holdCamera()).toBe(false); // parked isn't "out" — nothing left to hold against
  });

  it("stageInstant() (flat-view boot) never holds — there was no teardown to hide", () => {
    const tr = new ViewTransition();
    tr.stageInstant();
    expect(tr.holdCamera()).toBe(false);
  });

  it("stage() re-entering from IN drops back into out, so the hold resumes", () => {
    const tr = settled("hyper");
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT); // boundary → in
    expect(tr.holdCamera()).toBe(false);
    tr.stage("geo"); // re-gather with no destination
    expect(tr.phase).toBe("out");
    expect(tr.holdCamera()).toBe(true);
  });
});

describe("retargeting", () => {
  it("mid-OUT to a new destination just swaps `to` (gather continues uninterrupted)", () => {
    const tr = settled("hyper");
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT / 2);
    const w = tr.gatherWeight(3, 10);
    tr.start("hyper", "ledger");
    expect(tr.phase).toBe("out");
    expect(tr.to).toBe("ledger");
    expect(tr.gatherWeight(3, 10)).toBeCloseTo(w, 10); // weight untouched
  });

  it("mid-OUT back to the origin reverses into IN with weight continuity", () => {
    const tr = settled("hyper");
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT * 0.6);
    const w = tr.gatherWeight(0, 1);
    tr.start("geo", "hyper"); // user flipped back
    expect(tr.phase).toBe("in");
    expect(tr.to).toBe("hyper");
    expect(tr.gatherWeight(0, 1)).toBeCloseTo(w, 5); // no jump for the base node
  });

  it("mid-IN to a third view re-enters OUT seeded from the current weight", () => {
    const tr = settled("hyper");
    tr.start("hyper", "geo");
    tr.tick(DUR_OUT);
    tr.tick(DUR_IN * 0.4); // 40% into IN via the real frame path (weight descending)
    const w = tr.gatherWeight(0, 1);
    tr.start("geo", "ledger");
    expect(tr.phase).toBe("out");
    expect(tr.from).toBe("geo");
    expect(tr.to).toBe("ledger");
    expect(tr.gatherWeight(0, 1)).toBeCloseTo(w, 5); // base-weight continuity
  });
});

describe("is3D", () => {
  it("narrows the three scene views and rejects the flat placeholders", () => {
    expect(["hyper", "geo", "ledger"].every(is3D)).toBe(true);
    expect(is3D("soon")).toBe(false);
  });
});

describe("settleAlpha (the nodes' own arrival ramp)", () => {
  it("is 1 at idle, 0 while gathered toward, and ramps across the IN phase", () => {
    const tr = new ViewTransition();
    expect(tr.settleAlpha("geo")).toBe(1); // idle: data rebuilds outside transitions unaffected
    tr.start("hyper", "geo");
    expect(tr.settleAlpha("geo")).toBe(0); // OUT: the destination's nodes are being gathered
    expect(tr.settleAlpha("hyper")).toBe(1); // the from-view keeps its settle (its own fades rule)
    while (!tr.tick(0.1)) { /* run to the boundary */ }
    // The boundary tick carries its leftover dt into IN (the clock is continuous), so the
    // ramp has just barely begun rather than sitting at exactly 0.
    expect(tr.settleAlpha("geo")).toBeLessThan(0.1);
    tr.tick(1.5);
    const mid = tr.settleAlpha("geo");
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.8);
    tr.tick(10); // run the IN phase out
    expect(tr.settleAlpha("geo")).toBe(1);
  });
});
