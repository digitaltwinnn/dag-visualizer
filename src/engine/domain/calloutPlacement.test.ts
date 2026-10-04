import { describe, expect, it } from "vitest";
import {
  CALLOUT_LEG_INSET,
  CALLOUT_OFF_X,
  CALLOUT_OFF_Y,
  CALLOUT_REACH_X,
  CALLOUT_REACH_Y,
  CALLOUT_HANG_K,
  CALLOUT_HANG_REACH_X,
  CALLOUT_HANG_REACH_Y,
  CALLOUT_PHONE_K,
  calloutHangs,
  calloutPlacement,
  calloutPhonePlacement,
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

describe("calloutHangs — the second Snapshots label, below-left of its bar", () => {
  // Measured live at 1600×900: the global snapshot's bar projects to about (772, 574) and the
  // bottom band's top edge sits at 770.
  const BAR = { x: 772, y: 574 };
  const BAND_TOP = 770;

  it("hangs into the strip between the floor and the band on a desktop frame", () => {
    expect(calloutHangs(BAR.x, BAR.y, DESKTOP.l, DESKTOP.r, BAND_TOP - 10)).toBe(true);
  });

  it("declines when the strip is too short, so the caller stands the label where it always stood", () => {
    // A 780px-high window: the band rides up and the floor's bar sits close above it.
    expect(calloutHangs(BAR.x, 520, DESKTOP.l, DESKTOP.r, 650)).toBe(false);
  });

  it("declines when the panel would run off the band's left edge", () => {
    expect(calloutHangs(CALLOUT_HANG_REACH_X - 1, BAR.y, DESKTOP.l, DESKTOP.r, BAND_TOP)).toBe(false);
    expect(calloutHangs(TABLET_EXPLORE.l + 40, BAR.y, TABLET_EXPLORE.l, TABLET_EXPLORE.r, 2000)).toBe(false);
  });

  it("declines an anchor outside the band, and a band that does not exist", () => {
    expect(calloutHangs(100, BAR.y, TABLET_EXPLORE.l, TABLET_EXPLORE.r, 2000)).toBe(false);
    expect(calloutHangs(BAR.x, BAR.y, 600, 600, 2000)).toBe(false);
  });

  it("shortens BOTH axes by one factor — the leader keeps the standing label's angle", () => {
    // The reach is the scaled standoff plus the panel, on each axis. A factor applied to one
    // axis alone would turn the line, which is the one thing the hang must not do.
    expect(CALLOUT_HANG_K).toBeGreaterThan(0);
    expect(CALLOUT_HANG_K).toBeLessThan(1);
    expect(CALLOUT_HANG_REACH_X - (CALLOUT_REACH_X - CALLOUT_OFF_X)).toBe(Math.round(CALLOUT_OFF_X * CALLOUT_HANG_K));
    expect(CALLOUT_HANG_REACH_Y).toBeGreaterThan(Math.round(CALLOUT_OFF_Y * CALLOUT_HANG_K));
  });

  it("mirrors the factor app/globals.css hardcodes", () => {
    // :is(#callout, #callout-2)[data-hang] { --co-k: 0.55 } — change both or neither.
    expect(CALLOUT_HANG_K).toBe(0.55);
  });
});

describe("calloutPhonePlacement — the label straight above its subject", () => {
  // A phone has no room for the diagonal standoff: a 200px panel beside its anchor fits only near
  // an edge. So the label stands DIRECTLY over its subject on a short vertical leader, centred on
  // it and nudged to stay on screen (user, 2026-10-04: "it should fit, can also shorten the line").
  // A leader pointing straight down at its subject still says WHERE — the reason the phone used to
  // get no callout at all was a panel that could only point sideways at nothing.
  const W = 390, TOP = 64, BOTTOM = 500, PW = 180, PH = 56;
  const rise = Math.round(CALLOUT_OFF_Y * CALLOUT_PHONE_K);
  const place = (x: number, y: number) => calloutPhonePlacement(x, y, 0, W, TOP, BOTTOM, PW, PH);

  it("centres the panel over a subject in the middle", () => {
    const p = place(195, 300);
    expect(p).toEqual({ show: true, drop: false, left: -PW / 2 });
  });
  it("nudges the panel inside the band near an edge, keeping 8px of air", () => {
    expect(place(20, 300).left).toBe(8 - 20);
    expect(place(380, 300).left).toBe(W - 8 - PW - 380);
  });
  it("drops below a subject too close to the top bar", () => {
    const y = TOP + rise + PH - 1;
    expect(place(195, y)).toMatchObject({ show: true, drop: true });
  });
  it("hides when neither above nor below has room, or the subject is under the sheet", () => {
    expect(calloutPhonePlacement(195, 150, 0, W, TOP, 200, PW, PH).show).toBe(false);
    expect(place(195, BOTTOM + 10).show).toBe(false);
    expect(place(-5, 300).show).toBe(false);
  });
});
