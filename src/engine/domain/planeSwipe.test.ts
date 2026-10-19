import { describe, expect, it } from "vitest";
import { planeStep, SWIPE_MAX_MS, SWIPE_MIN_PX, swipeIntent, swipeOf } from "./planeSwipe";

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

describe("planeStep — one step along the roster from the front, wrapping", () => {
  const order = ["a", "b", "c", "d"];
  it("up brings the NEXT card forward, down the PREVIOUS — from the resting front", () => {
    expect(planeStep(order, "a", "up")).toBe("b");
    expect(planeStep(order, "a", "down")).toBe("d");
  });
  it("walks from a focused card by rank, not from the re-dealt slot behind it", () => {
    expect(planeStep(order, "c", "up")).toBe("d");
    expect(planeStep(order, "c", "down")).toBe("b");
  });
  it("wraps at both ends, so repeated swipes visit every card", () => {
    expect(planeStep(order, "d", "up")).toBe("a");
    let f: string | null = "a";
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) { f = planeStep(order, f, "up"); seen.push(f!); }
    expect(seen).toEqual(["b", "c", "d", "a"]);
  });
  it("an unknown front counts as the first card; a lone card has nowhere to go", () => {
    expect(planeStep(order, null, "up")).toBe("b");
    expect(planeStep(order, "zz", "down")).toBe("d");
    expect(planeStep(["a"], "a", "up")).toBeNull();
    expect(planeStep([], null, "up")).toBeNull();
  });
});

describe("swipeIntent — what a swipe asks for", () => {
  const deck = { order: ["a", "b", "c"], front: "a" };
  it("up and down are the deck's walk, whatever card the finger was on", () => {
    expect(swipeIntent("up", deck)).toEqual({ kind: "forward", id: "b" });
    expect(swipeIntent("down", deck)).toEqual({ kind: "forward", id: "c" });
  });
  it("a lone card asks nothing vertically", () => {
    expect(swipeIntent("up", { order: ["a"], front: "a" })).toBeNull();
  });
  it("left is the next measure, right the previous — the keys' own steps", () => {
    expect(swipeIntent("left", deck)).toEqual({ kind: "measure", step: 1 });
    expect(swipeIntent("right", deck)).toEqual({ kind: "measure", step: -1 });
  });
});
