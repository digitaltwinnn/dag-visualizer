import { describe, expect, it } from "vitest";
import { SWIPE_MIN_PX, stepView, swipeDirection } from "./viewSwipe";

describe("swipeDirection", () => {
  it("counts a clear horizontal drag, left as next and right as previous", () => {
    expect(swipeDirection(-SWIPE_MIN_PX, 0)).toBe(-1);
    expect(swipeDirection(60, 10)).toBe(1);
  });
  it("is not a swipe below the travel floor, or when the drag is mostly vertical", () => {
    expect(swipeDirection(-SWIPE_MIN_PX + 1, 0)).toBe(0);
    expect(swipeDirection(-50, 40)).toBe(0);
  });
});

describe("stepView", () => {
  const order = ["hyper", "geo", "ledger", "trend"];
  it("a left swipe steps to the next view, a right swipe to the previous", () => {
    expect(stepView(order, "geo", -1)).toBe("ledger");
    expect(stepView(order, "geo", 1)).toBe("hyper");
  });
  it("clamps at both ends rather than wrapping", () => {
    expect(stepView(order, "trend", -1)).toBeNull();
    expect(stepView(order, "hyper", 1)).toBeNull();
  });
  it("from a view outside the row, steps onto the nearest end", () => {
    expect(stepView(order, "soon", -1)).toBe("hyper");
    expect(stepView(order, "soon", 1)).toBe("trend");
  });
});
