import { describe, it, expect } from "vitest";
import { BAR_TUNE_DEFAULTS, SNAP_PREVIEW, SNAP_ONNET } from "./ByteBar";
import { RIBBON_TUNE_DEFAULTS } from "./Ribbons";
import { FOCUS_TUNE_DEFAULTS } from "../../domain/dimModel";
import { TILE_TUNE_DEFAULTS } from "../views/LedgerView";

// The off-filter tier is now the ledger's own `elem` knob (2026-08-11), so it is derived from the
// DEFAULTS exactly as offNetMul() derives it from the live row — tests pin the shipped look, never
// the tuned struct, so turning the knob can never make this file pass or fail.
const OFF_NET = 1 - FOCUS_TUNE_DEFAULTS.ledger.elem;

// The chamber's COLOUR-TIER CONTRACT (2026-08-08): emphasis is brightness in four legible
// tiers — the ACTIVE row's full identity, the HOVER preview, the off-filter colored dim, and
// the neutral trail. Future tuning may move the numbers, but the ORDER is the design; a swap
// (a preview dimmer than the off-filter tier, a rest brighter than a preview) silently breaks
// the hierarchy the eye reads, so it fails here instead.
describe("the ledger's colour-tier hierarchy", () => {
  it("hover preview sits between full colour and the off-filter dim", () => {
    expect(SNAP_PREVIEW).toBeLessThan(1);
    expect(SNAP_PREVIEW).toBeGreaterThan(OFF_NET);
    expect(OFF_NET).toBeGreaterThan(0);
  });

  it("hot leads rest on both snapshot instruments (the shared vocabulary)", () => {
    expect(BAR_TUNE_DEFAULTS.hot).toBeGreaterThan(BAR_TUNE_DEFAULTS.rest);
    expect(TILE_TUNE_DEFAULTS.hot).toBeGreaterThan(TILE_TUNE_DEFAULTS.rest);
  });

  it("the preview TIER outshines the resting trail (hot × preview > rest)", () => {
    expect(BAR_TUNE_DEFAULTS.hot * SNAP_PREVIEW).toBeGreaterThan(BAR_TUNE_DEFAULTS.rest);
    expect(TILE_TUNE_DEFAULTS.hot * SNAP_PREVIEW).toBeGreaterThan(TILE_TUNE_DEFAULTS.rest);
  });

  // The committed network's own resting rows (user, 2026-08-09): loud enough that its hue reads
  // down the whole trail, quiet enough that a hover still previews louder than a standing
  // commitment and the hot row still leads.
  it("the committed-network resting tier sits between the neutral rest and the hover preview", () => {
    expect(SNAP_ONNET).toBeLessThan(SNAP_PREVIEW);
    expect(BAR_TUNE_DEFAULTS.hot * SNAP_ONNET).toBeGreaterThan(BAR_TUNE_DEFAULTS.rest);
    expect(TILE_TUNE_DEFAULTS.hot * SNAP_ONNET).toBeGreaterThan(TILE_TUNE_DEFAULTS.rest);
  });

  it("ribbons rest visible and dim below rest", () => {
    expect(RIBBON_TUNE_DEFAULTS.restOp).toBeGreaterThan(0);
    expect(OFF_NET).toBeLessThan(1);
  });
});
