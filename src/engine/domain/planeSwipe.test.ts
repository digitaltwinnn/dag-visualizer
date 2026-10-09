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

describe("swipeIntent — what a swipe on a card asks for", () => {
  const deck = { front: "a", behind: "b", focus: null };
  it("down on any card brings IT forward", () => {
    expect(swipeIntent("down", "c", deck)).toEqual({ kind: "forward", id: "c" });
    expect(swipeIntent("down", "a", deck)).toEqual({ kind: "forward", id: "a" });
  });
  it("down on the card that already is the focus asks nothing — the focus write is a toggle (review)", () => {
    expect(swipeIntent("down", "a", { front: "a", behind: "b", focus: "a" })).toBeNull();
    expect(swipeIntent("down", "c", { front: "a", behind: "b", focus: "a" })).toEqual({ kind: "forward", id: "c" });
  });
  it("up on the front card sends it back by bringing the card behind it forward", () => {
    expect(swipeIntent("up", "a", deck)).toEqual({ kind: "forward", id: "b" });
  });
  it("up on a card already behind, or on a lone front card, asks nothing", () => {
    expect(swipeIntent("up", "c", deck)).toBeNull();
    expect(swipeIntent("up", "a", { front: "a", behind: null, focus: null })).toBeNull();
  });
  it("left is the next measure, right the previous — the keys' own steps", () => {
    expect(swipeIntent("left", "a", deck)).toEqual({ kind: "measure", step: 1 });
    expect(swipeIntent("right", "a", deck)).toEqual({ kind: "measure", step: -1 });
  });
});
