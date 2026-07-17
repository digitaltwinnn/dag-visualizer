import { describe, it, expect } from "vitest";
import { ViewTransition, DUR_OUT, DUR_IN, STAGGER_SPREAD } from "./viewTransition";

const settled = (v: "hyper" | "geo" | "ledger" = "hyper") => {
  const tr = new ViewTransition();
  tr.settle(v);
  return tr;
};

describe("phase sequencing", () => {
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
    tr.tick(DUR_OUT + 1e-6); // boundary crossed
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
    tr.tick(DUR_OUT + DUR_IN * 0.4); // 40% into IN (weight descending)
    const w = tr.gatherWeight(0, 1);
    tr.start("geo", "ledger");
    expect(tr.phase).toBe("out");
    expect(tr.from).toBe("geo");
    expect(tr.to).toBe("ledger");
    expect(tr.gatherWeight(0, 1)).toBeCloseTo(w, 5); // base-weight continuity
  });
});
