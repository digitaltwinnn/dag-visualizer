import { describe, expect, it } from "vitest";
import {
  CALLOUT_LEG_INSET,
  CALLOUT_OFF_X,
  CALLOUT_OFF_Y,
  CALLOUT_REACH_X,
  CALLOUT_REACH_Y,
  calloutPlacement,
} from "./calloutPlacement";

// The band the three supported tiers actually present, so the cases below read as real geometry
// rather than arithmetic. Desktop: rails sit BESIDE the canvas, so the band is the viewport.
// Tablet (measured live at 900px): the Explore sheet covers 0..300, the Details sheet 580..900.
const DESKTOP = { l: 0, r: 1600 };
const TABLET_EXPLORE = { l: 300, r: 900 };
const TABLET_BOTH = { l: 300, r: 580 };

const at = (x: number, band: { l: number; r: number }, y = 500, top = 0) =>
  calloutPlacement(x, y, band.l, band.r, top);

describe("callout standoff", () => {
  it("derives the reach from the standoff, never the other way round", () => {
    // The reach is the standoff plus the panel itself, so it must exceed it on both axes. This
    // is the guard on the "change all four together" hazard the constants were split across.
    expect(CALLOUT_REACH_X).toBeGreaterThan(CALLOUT_OFF_X);
    expect(CALLOUT_REACH_Y).toBeGreaterThan(CALLOUT_OFF_Y);
  });

  it("mirrors the standoff app/globals.css hardcodes", () => {
    // #callout .co-panel { left: 100px; bottom: 140px } — CSS can't import a const, so this is
    // the mirror's one executable reminder. Change both or neither.
    expect([CALLOUT_OFF_X, CALLOUT_OFF_Y]).toEqual([100, 140]);
  });
});

describe("calloutPlacement on desktop", () => {
  it("stands up-right in open space", () => {
    expect(at(700, DESKTOP)).toEqual({ show: true, flip: false, drop: false });
  });

  it("flips toward the left once the panel would overrun the right edge", () => {
    expect(at(DESKTOP.r - CALLOUT_REACH_X - 1, DESKTOP).flip).toBe(false);
    expect(at(DESKTOP.r - CALLOUT_REACH_X + 1, DESKTOP).flip).toBe(true);
  });

  it("drops below the anchor only near the top of the canvas", () => {
    expect(at(700, DESKTOP, CALLOUT_REACH_Y + 1).drop).toBe(false);
    expect(at(700, DESKTOP, CALLOUT_REACH_Y - 1).drop).toBe(true);
  });

  it("measures drop against the canvas top, not the viewport's", () => {
    // The canvas sits under the command bar (and its filter strip, when open), so `top` moves.
    expect(at(700, DESKTOP, 210, 0).drop).toBe(true);
    expect(at(700, DESKTOP, 210, 0 - CALLOUT_REACH_Y).drop).toBe(false);
  });

  it("shows everywhere across a desktop band — the tier never declines on width", () => {
    for (let x = DESKTOP.l; x <= DESKTOP.r; x += 25) {
      expect(at(x, DESKTOP).show).toBe(true);
    }
  });
});

describe("calloutPlacement against an overlaying sheet", () => {
  it("keeps the callout the Explore sheet leaves room for", () => {
    // The live case at 900px: anchor 450, panel 551..696, clear canvas. It rendered correctly
    // before this rule existed and must go on doing so.
    expect(at(450, TABLET_EXPLORE)).toEqual({ show: true, flip: false, drop: false });
  });

  it("declines the anchor hidden UNDER a sheet", () => {
    expect(at(200, TABLET_EXPLORE).show).toBe(false);
    expect(at(700, TABLET_BOTH).show).toBe(false);
  });

  it("declines rather than render the fragment between two sheets", () => {
    // The reported defect: 900px, both sheets open, a geo node at x=450. The panel had 25px.
    expect(at(450, TABLET_BOTH).show).toBe(false);
  });

  it("declines on the LEFT sheet alone too — the defect is not a both-sheets corner case", () => {
    // An anchor just inside the Explore sheet's edge has no room to its left and, on a narrow
    // enough band, none to its right either.
    expect(at(320, { l: 300, r: 600 }).show).toBe(false);
  });

  it("flips into the room the sheet leaves instead of declining", () => {
    // Explore open, anchor near the right of a wide-enough band: no room right, plenty left.
    expect(at(700, TABLET_EXPLORE)).toEqual({ show: true, flip: true, drop: false });
  });

  it("never flips into the sheet it just avoided", () => {
    const p = at(450, { l: 300, r: 820 });
    expect(p.show).toBe(true);
    expect(p.flip).toBe(false); // 450 + 360 = 810 fits right; flipping would land at 90, under the sheet
  });

  it("declines when the sheets leave no band at all", () => {
    expect(calloutPlacement(450, 500, 600, 300, 0).show).toBe(false);
    expect(calloutPlacement(450, 500, 450, 450, 0).show).toBe(false);
  });
});

// The leader-end inset — where the leader INK stops short of the panel corner. Both owners
// (SceneCallout's primary leader, Engine's multi-leader fan corner) read this one constant;
// the pin is that it stays a small positive inset, well inside the leader's own run.
describe("CALLOUT_LEG_INSET", () => {
  it("is a small positive inset inside the leader's run", () => {
    expect(CALLOUT_LEG_INSET).toBeGreaterThan(0);
    expect(CALLOUT_LEG_INSET).toBeLessThan(CALLOUT_OFF_Y);
  });
});
