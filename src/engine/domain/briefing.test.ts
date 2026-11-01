import { describe, expect, it } from "vitest";
import { BRIEFING_COVER, BRIEFING_PACE, BRIEFING_RELEASE_MS, BRIEFING_STOPS, LINE_MAX, SCENE_WAIT_MS, STOP_MS, briefsOn, mayAdvance, nextStop, prevStop } from "./briefing";

const on = { pathname: "/", net: "mainnet", seen: false };

describe("the tour's route", () => {
  it("visits every 3D view, starting on the globe", () => {
    expect(BRIEFING_STOPS).toEqual(["geo", "ledger", "hyper", "trend"]);
  });

  it("steps through the stops and stops after the last", () => {
    expect(nextStop(0)).toBe(1);
    expect(nextStop(2)).toBe(3);
    expect(nextStop(3)).toBeNull();
  });

  it("steps back to the stop before, and no further than the first", () => {
    expect(prevStop(3)).toBe(2);
    expect(prevStop(1)).toBe(0);
    expect(prevStop(0)).toBeNull();
  });
});

describe("when the tour plays", () => {
  it("plays on the landing URL, once a session, on mainnet", () => {
    expect(briefsOn(on)).toBe(true);
  });

  it("a deep link goes straight to its view", () => {
    expect(briefsOn({ ...on, pathname: "/snapshots" })).toBe(false);
    expect(briefsOn({ ...on, pathname: "/about" })).toBe(false);
  });

  it("a second landing in the session does not replay it", () => {
    expect(briefsOn({ ...on, seen: true })).toBe(false);
  });

  it("the notes are mainnet's, so another network has no briefing", () => {
    expect(briefsOn({ ...on, net: "testnet" })).toBe(false);
  });
});

describe("the tour's clock", () => {
  it("holds a stop for its full time", () => {
    expect(mayAdvance(STOP_MS - 1, null)).toBe(false);
    expect(mayAdvance(STOP_MS, null)).toBe(true);
  });

  it("never leaves a view the scene has not finished entering", () => {
    expect(mayAdvance(STOP_MS * 3, "in")).toBe(false);
    expect(mayAdvance(STOP_MS * 3, "out")).toBe(false);
  });
});

describe("the tour's words", () => {
  it("run past a single line of the desktop caption, about 55 characters", () => {
    expect(LINE_MAX).toBeGreaterThan(2 * 55);
    expect(LINE_MAX).toBeLessThanOrEqual(3 * 55);
  });

  it("stand for the stop the user chose, brisker than subtitle pace on the longest line", () => {
    expect(STOP_MS).toBe(4875);
    expect(LINE_MAX / (STOP_MS / 1000)).toBeLessThan(30);
  });
});

describe("the tour's staging", () => {
  it("stands down when the HUD's boot ladder would, so a dead feed never hides the controls longer", () => {
    expect(SCENE_WAIT_MS).toBe(8000);
  });

  it("runs the transition faster, never slower", () => {
    expect(BRIEFING_PACE).toBeGreaterThan(1);
  });

  it("lands inside its stop, with the view left standing for over a second and a half", () => {
    const choreographyMs = 3300; // DUR_OUT + DUR_IN, `domain/viewTransition.ts`
    expect(BRIEFING_PACE).toBe(1.09);
    expect(STOP_MS - choreographyMs / BRIEFING_PACE).toBeGreaterThan(1500);
  });

  it("leaves the scene the upper part of the screen", () => {
    expect(BRIEFING_COVER).toBeGreaterThan(0);
    expect(BRIEFING_COVER).toBeLessThan(0.5);
  });

  it("holds the lift until the HUD has landed, so the scene eases once, with no dip and rise", () => {
    expect(BRIEFING_RELEASE_MS).toBeGreaterThan(550); // the band's slide back, measured
    expect(BRIEFING_RELEASE_MS).toBeLessThan(1000);
  });
});
