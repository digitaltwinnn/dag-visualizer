import { describe, it, expect } from "vitest";
import { BAR_TUNE_DEFAULTS, SNAP_PREVIEW } from "./ByteBar";
import { RIBBON_DIM, RIBBON_TUNE_DEFAULTS } from "./Ribbons";
import { TILE_TUNE_DEFAULTS } from "../views/LedgerView";

// The chamber's COLOUR-TIER CONTRACT (2026-08-08): emphasis is brightness in four legible
// tiers — the ACTIVE row's full identity, the HOVER preview, the off-filter colored dim, and
// the neutral trail. Future tuning may move the numbers, but the ORDER is the design; a swap
// (a preview dimmer than the off-filter tier, a rest brighter than a preview) silently breaks
// the hierarchy the eye reads, so it fails here instead.
describe("the ledger's colour-tier hierarchy", () => {
  it("hover preview sits between full colour and the off-filter dim", () => {
    expect(SNAP_PREVIEW).toBeLessThan(1);
    expect(SNAP_PREVIEW).toBeGreaterThan(RIBBON_DIM);
    expect(RIBBON_DIM).toBeGreaterThan(0);
  });

  it("hot leads rest on both snapshot instruments (the shared vocabulary)", () => {
    expect(BAR_TUNE_DEFAULTS.hot).toBeGreaterThan(BAR_TUNE_DEFAULTS.rest);
    expect(TILE_TUNE_DEFAULTS.hot).toBeGreaterThan(TILE_TUNE_DEFAULTS.rest);
  });

  it("the preview TIER outshines the resting trail (hot × preview > rest)", () => {
    expect(BAR_TUNE_DEFAULTS.hot * SNAP_PREVIEW).toBeGreaterThan(BAR_TUNE_DEFAULTS.rest);
    expect(TILE_TUNE_DEFAULTS.hot * SNAP_PREVIEW).toBeGreaterThan(TILE_TUNE_DEFAULTS.rest);
  });

  it("ribbons rest visible and dim below rest", () => {
    expect(RIBBON_TUNE_DEFAULTS.restOp).toBeGreaterThan(0);
    expect(RIBBON_DIM).toBeLessThan(1);
  });
});
