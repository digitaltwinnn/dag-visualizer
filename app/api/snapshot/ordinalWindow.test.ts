import { describe, expect, it } from "vitest";
import { FUTURE_WINDOW, PAST_WINDOW, inServedWindow } from "./ordinalWindow";

// The served-window bound: the snapshot routes refuse ordinals the app could never legitimately
// ask about, so the ~6.7M-ordinal history (the LB serves ALL of it — verified 2026-08-13) is not
// an anonymous walk of cold ~2.5 MB pulls. The window is generous on purpose: the client's
// deepest real ask is the 52-tick retained buffer, and PAST_WINDOW is ~100× that.

describe("inServedWindow", () => {
  const latest = 6_757_440;

  it("accepts the whole legitimate client range around the live tick", () => {
    expect(inServedWindow(latest, latest)).toBe(true);
    expect(inServedWindow(latest - 52, latest)).toBe(true); // the retained strip buffer
    expect(inServedWindow(latest - PAST_WINDOW, latest)).toBe(true); // the bound itself, inclusive
  });

  it("tolerates small feed-vs-LB skew into the future, and no more", () => {
    expect(inServedWindow(latest + FUTURE_WINDOW, latest)).toBe(true);
    expect(inServedWindow(latest + FUTURE_WINDOW + 1, latest)).toBe(false);
  });

  it("refuses the deep-history walk", () => {
    expect(inServedWindow(latest - PAST_WINDOW - 1, latest)).toBe(false);
    expect(inServedWindow(1_000_000, latest)).toBe(false);
    expect(inServedWindow(1, latest)).toBe(false);
  });

  // Fail OPEN on a missing reference: the route's own upstream fetch is about to fail honestly
  // on the same host, and a closed gate would only stack a second failure mode in front of it.
  it("fails open when the reference read is unavailable", () => {
    expect(inServedWindow(1, null)).toBe(true);
    expect(inServedWindow(6_757_440, null)).toBe(true);
  });
});
