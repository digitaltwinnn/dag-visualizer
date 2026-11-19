import { describe, it, expect } from "vitest";
import { BAR_LOOK } from "./ByteBar";
import { RIBBON_LOOK } from "./Ribbons";
import { snapBright, snapFocusOf, focusWeightOf, FOCUS_ROWS } from "../../domain/dimModel";
import { TILE_LOOK } from "../views/LedgerView";

// The chamber's BRIGHTNESS-TIER CONTRACT. Since 2026-08-11 the snapshots read the NODE
// vocabulary — a snapshot is data, so its off-filter dim, focus boost and dim-back are the ledger
// row's own knobs, the same ones the chips in the trays answer to — and each instrument keeps only
// its own resting level (the bar's is an opacity, the tiles' a colour multiplier, so they stay two
// numbers). What this file pins is the ORDER those tiers must keep, resolved through the shipped
// DEFAULTS: tuning may move the numbers, but a swap (a hover preview dimmer than a resting row, a
// stepped-back row brighter than a resting one) silently breaks the hierarchy the eye reads.
//
// COLOUR is deliberately absent here. Identity hue vs the neutral trail is the chamber's own
// independent reading, decided at the call sites, and it must stay unentangled from these knobs.
const tiers = (rest: number) => ({
  primary: snapBright(rest, false, focusWeightOf(true, false), true),
  group: snapBright(rest, false, focusWeightOf(false, true), true),
  rest: snapBright(rest, false),
  stepped: snapBright(rest, false, 0, true),
  offFilter: snapBright(rest, true),
});

describe("the ledger's brightness-tier hierarchy", () => {
  for (const [what, rest] of [
    ["the byte bar's bands", BAR_LOOK.rest],
    ["the lane tiles", TILE_LOOK.rest],
  ] as const) {
    it(`${what}: primary > hover preview > resting > stepped back`, () => {
      const t = tiers(rest);
      expect(t.primary).toBeGreaterThan(t.group);
      expect(t.group).toBeGreaterThan(t.rest);
      expect(t.rest).toBeGreaterThan(t.stepped);
      expect(t.stepped).toBeGreaterThan(0);
    });

    // A hover previews what a click would pin, so it must stay BELOW a standing commitment — the
    // active row is never demoted by a passing pointer.
    it(`${what}: a hover never outshines the pinned row`, () => {
      const t = tiers(rest);
      expect(t.group).toBeLessThan(t.primary);
    });

    // The off-filter tier stays visible: the chamber's other networks drop to their own hue at a
    // dim level, they never go dark. That is what keeps the trail identifiable under a filter.
    it(`${what}: off-filter dims without vanishing`, () => {
      const t = tiers(rest);
      expect(t.offFilter).toBeLessThan(t.rest);
      expect(t.offFilter).toBeGreaterThan(0);
    });

    // A row is a TICK, and a tick holds every network's snapshot side by side. So the row's focus
    // is the COMMITTED network's (snapFocusOf) — the boost is undimmed, and a row-wide one lifted
    // every band together, leaving the committed one no lead at the moment it matters most.
    it(`${what}: a row focus lifts the committed network, not the whole row`, () => {
      const t = tiers(rest);
      expect(snapBright(rest, false, snapFocusOf(true, false, false), true)).toBe(t.primary);
      const off = snapBright(rest, true, snapFocusOf(true, false, true), true);
      expect(off).toBeLessThan(t.rest);
      expect(off).toBeGreaterThan(0);
    });

    // …but `back` is the ROW's own answer, so the focused row does not step ITSELF back: its
    // off-filter members take the dim alone — the very tier the RIBBON between them takes
    // (Ribbons._writeGeometry passes no focus at all). Compounding the two knobs made a band and
    // the tile above it read near-black under a ribbon that was only gently dimmed.
    it(`${what}: an off-filter member of the FOCUSED row takes the dim alone`, () => {
      const t = tiers(rest);
      expect(snapBright(rest, true, snapFocusOf(true, false, true), false)).toBe(t.offFilter);
      expect(t.offFilter).toBeGreaterThan(snapBright(rest, true, 0, true));
    });
  }

  // THE DATA BLOCKS SHEET (user, 2026-11-09, option A): stripes over a fill SUBTLER than the
  // snapshot sheet's, the stripes themselves standing above it.
  it("the striped sheet's fill is quieter than the snapshot sheet, and its stripes louder", () => {
    expect(RIBBON_LOOK.stripeFill).toBeGreaterThan(0);
    expect(RIBBON_LOOK.stripeFill).toBeLessThan(1);
    expect(RIBBON_LOOK.stripeFill + RIBBON_LOOK.stripeLine).toBeGreaterThan(1);
    expect(RIBBON_LOOK.stripeSp).toBeGreaterThan(0);
  });

  // THE SNAPSHOT SHEET'S LINING (user, 2026-11-09: "can we give it a outer lining?"): a step above
  // the fill, so the sheet reads as a shape, and still short of full ink.
  it("the snapshot sheet's lining stands above its fill and below full ink", () => {
    expect(RIBBON_LOOK.liningLine).toBeGreaterThan(0);
    expect(RIBBON_LOOK.restOp * (1 + RIBBON_LOOK.liningLine)).toBeLessThan(1);
  });

  it("ribbons rest visible, and dim on the same one knob", () => {
    expect(RIBBON_LOOK.restOp).toBeGreaterThan(0);
    expect(FOCUS_ROWS.ledger.dim).toBeGreaterThan(0);
    expect(FOCUS_ROWS.ledger.dim).toBeLessThan(1);
  });
});
