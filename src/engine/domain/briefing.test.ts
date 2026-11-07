import { describe, expect, it } from "vitest";
import { BRIEFING_COVER, BRIEFING_LAND_MAX_MS, BRIEFING_NO_MOTION_MS, BRIEFING_PACE, BRIEFING_RELEASE_MS, BRIEFING_SETTLE_MS, BRIEFING_STOPS, BRIEFING_TYPE_SLOW, BRIEFING_WORDS_OUT_MS, HANDOVER_MS, HANDOVER_SHEET_GROW_MS, LINE_MAX, SCENE_WAIT_MS, STOP_MS, briefsOn, handoverHand, handoverPulses, hasLanded, liftSettling, mayAdvance, nextStop, prevStop, stopRegister } from "./briefing";

const on = { pathname: "/", net: "mainnet", seen: false };

describe("how long a stop stands", () => {
  // user, 2026-11-02: 4.9 seconds asked 21 to 25 characters a second of the live lines, past a subtitle's
  // 20, and the stop went back to 6 seconds; 2026-11-03: "make it 5", the rest of the timing
  // unchanged — read live, the lines were on screen in time with time left.
  it("stands the 5 seconds the user set", () => {
    expect(STOP_MS).toBe(5000);
  });
});

describe("the tour's route", () => {
  it("visits every 3D view, starting on the globe", () => {
    expect(BRIEFING_STOPS).toEqual([{ mode: "geo" }, { mode: "ledger" }, { mode: "ledger", register: "blocks" }, { mode: "hyper" }, { mode: "trend" }]);
    expect(BRIEFING_STOPS[2]).toEqual({ mode: "ledger", register: "blocks" });
  });

  it("puts the Snapshots view in the Snapshots register at any stop that names none", () => {
    expect(stopRegister(BRIEFING_STOPS[1]!)).toBe("snapshots");
    expect(stopRegister(BRIEFING_STOPS[2]!)).toBe("blocks");
    expect(stopRegister(BRIEFING_STOPS[3]!)).toBe("snapshots");
  });

  it("steps through the stops and stops after the last", () => {
    expect(nextStop(0)).toBe(1);
    expect(nextStop(3)).toBe(4);
    expect(nextStop(4)).toBeNull();
  });

  it("steps back to the stop before, and no further than the first", () => {
    expect(prevStop(4)).toBe(3);
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

describe("the tour's ending, three beats: the words go, the scene moves, the HUD arrives", () => {
  it("lets the words go quickly, before anything else starts", () => {
    expect(BRIEFING_WORDS_OUT_MS).toBeGreaterThanOrEqual(300);
    expect(BRIEFING_WORDS_OUT_MS).toBeLessThanOrEqual(500);
  });

  it("brings the HUD back once the scene has moved and landed", () => {
    expect(hasLanded(100, true, "out")).toBe(false);
    expect(hasLanded(100, true, "in")).toBe(false);
    expect(hasLanded(100, true, null)).toBe(true);
  });

  it("does not take the moment before the switch for a landing", () => {
    expect(hasLanded(100, false, null)).toBe(false);
  });

  it("gives up waiting for a move that never comes, past a slow renderer's frame", () => {
    expect(BRIEFING_NO_MOTION_MS).toBeGreaterThanOrEqual(500);
    expect(hasLanded(BRIEFING_NO_MOTION_MS, false, null)).toBe(true);
  });

  it("never holds the controls behind a slow renderer's transition", () => {
    expect(BRIEFING_LAND_MAX_MS).toBeLessThanOrEqual(SCENE_WAIT_MS);
    expect(BRIEFING_LAND_MAX_MS).toBeGreaterThan(3300 / BRIEFING_PACE); // a normal landing fits
    expect(hasLanded(BRIEFING_LAND_MAX_MS, true, "in")).toBe(true);
  });
});

// user, 2026-11-01: measured 5.4px in the first frame and most of the way in 0.2s after a stand-still.
describe("the lift letting go", () => {
  const at = (ms: number) => liftSettling(81, 32, ms);

  it("starts from where it stood and lands where the scene rests", () => {
    expect(at(0)).toBe(81);
    expect(at(BRIEFING_SETTLE_MS)).toBeCloseTo(32, 9);
    expect(at(BRIEFING_SETTLE_MS * 2)).toBe(32);
  });

  it("eases in: the first frame barely moves", () => {
    expect(81 - at(16)).toBeLessThan(0.1);
  });

  it("eases out the same way, half the distance at half the time", () => {
    expect(at(BRIEFING_SETTLE_MS / 2)).toBeCloseTo((81 + 32) / 2, 9);
    expect(at(BRIEFING_SETTLE_MS - 16) - 32).toBeLessThan(0.1);
  });

  it("is slow enough to read as a settle, and quick enough not to outstay it", () => {
    expect(BRIEFING_SETTLE_MS).toBeGreaterThanOrEqual(800);
    expect(BRIEFING_SETTLE_MS).toBeLessThanOrEqual(1500);
  });
});


describe("the hand-over", () => {
  it("pulses the desktop's three surfaces, then the phone's two, half a second apart, after the caption", () => {
    expect(handoverPulses(false).map((p) => p.target)).toEqual(["explore", "rail", "band"]);
    expect(handoverPulses(true).map((p) => p.target)).toEqual(["sheet", "dock"]);
    const at = handoverPulses(false).map((p) => p.atMs);
    expect(at[0]).toBeGreaterThan(0);
    expect(at[1]! - at[0]!).toBe(500);
  });

  it("traces the drag once, after the last pulse, and is done well inside the hand-over", () => {
    for (const phone of [false, true]) {
      const hand = handoverHand(phone);
      const last = handoverPulses(phone).at(-1)!.atMs;
      expect(hand.atMs).toBeGreaterThan(last);
      expect(hand.atMs + hand.durMs).toBeLessThan(HANDOVER_MS);
    }
  });
});

describe("the tour's typing", () => {
  it("runs 15% slower than a note's", () => {
    expect(BRIEFING_TYPE_SLOW).toBe(1.15);
  });
});

describe("the hand-over's sheet grow", () => {
  it("is slower than the dock's usual 550 ms entry and ends inside the hand-over", () => {
    expect(HANDOVER_SHEET_GROW_MS).toBeGreaterThan(550);
    expect(HANDOVER_SHEET_GROW_MS).toBeLessThan(HANDOVER_MS);
  });
});
