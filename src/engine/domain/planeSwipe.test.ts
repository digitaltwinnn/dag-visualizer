import { describe, expect, it } from "vitest";
import { SWIPE_MAX_MS, SWIPE_MIN_PX, swipeIntent, swipeOf } from "./planeSwipe";

// A SWIPE ON A HISTORY CARD (user, 2026-10-09: "swipe the chart cards up/down … moves from/to the
// back of the stack; swipe left/right changes what the chart displays"). A flick, never a drag:
// the front card's horizontal drag is the brush, and one gesture cannot mean both.
describe("swipeOf — a flick along one axis", () => {
  it("names the four directions past the floor, inside the time", () => {
    expect(swipeOf(0, SWIPE_MIN_PX, 200)).toBe("down");
    expect(swipeOf(0, -SWIPE_MIN_PX, 200)).toBe("up");
    expect(swipeOf(-SWIPE_MIN_PX, 0, 200)).toBe("left");
    expect(swipeOf(SWIPE_MIN_PX, 0, 200)).toBe("right");
  });
  it("is nothing under the floor, or past the time: a slow drag is the brush", () => {
    expect(swipeOf(0, SWIPE_MIN_PX - 1, 200)).toBeNull();
    expect(swipeOf(0, SWIPE_MIN_PX, SWIPE_MAX_MS + 1)).toBeNull();
  });
  it("rejects a diagonal: the other axis must stay under half the travel", () => {
    expect(swipeOf(30, 50, 200)).toBeNull();
    expect(swipeOf(20, 50, 200)).toBe("down");
  });
  it("a surface whose horizontal drag is spoken for answers only the vertical", () => {
    expect(swipeOf(SWIPE_MIN_PX, 0, 200, { horizontal: false })).toBeNull();
    expect(swipeOf(0, SWIPE_MIN_PX, 200, { horizontal: false })).toBe("down");
  });
});

describe("swipeIntent — what a swipe asks for", () => {
  it("up turns the deck forward (the front to the back), down turns it back — whatever card the finger was on", () => {
    expect(swipeIntent("up")).toEqual({ kind: "rotate", step: 1 });
    expect(swipeIntent("down")).toEqual({ kind: "rotate", step: -1 });
  });
  it("left is the next measure, right the previous — the keys' own steps", () => {
    expect(swipeIntent("left")).toEqual({ kind: "measure", step: 1 });
    expect(swipeIntent("right")).toEqual({ kind: "measure", step: -1 });
  });
});
