import { describe, expect, it } from "vitest";
import { FUTURE_WINDOW, inServedWindow } from "./ordinalWindow";

// The served-window bound, POST-2026-08-14: the PAST bound is dropped by user decision — the
// anchor log pages a network's whole history and the payload follows the rows; the accepted
// cost (any historical ordinal is a valid anonymous ~2.5 MB pull, once, then cached) is theirs
// to re-tighten via the Pro plan's protections. What remains: the FUTURE bound (nonsense is not
// history) and the fail-open rule.

describe("inServedWindow", () => {
  const latest = 6_757_440;

  it("accepts the whole history down to ordinal 1 (the past bound is dropped — user, 2026-08-14)", () => {
    expect(inServedWindow(latest, latest)).toBe(true);
    expect(inServedWindow(1_000_000, latest)).toBe(true);
    expect(inServedWindow(1, latest)).toBe(true);
    expect(inServedWindow(0, latest)).toBe(false); // ordinals start at 1
  });

  it("tolerates small feed-vs-LB skew into the future, and no more", () => {
    expect(inServedWindow(latest + FUTURE_WINDOW, latest)).toBe(true);
    expect(inServedWindow(latest + FUTURE_WINDOW + 1, latest)).toBe(false);
  });

  // Fail OPEN on a missing reference: the route's own upstream fetch is about to fail honestly
  // on the same host, and a closed gate would only stack a second failure mode in front of it.
  it("fails open when the reference read is unavailable", () => {
    expect(inServedWindow(1, null)).toBe(true);
    expect(inServedWindow(6_757_440, null)).toBe(true);
  });
});

// The staleness defect this module was rewritten for (2026-08-31). `inServedWindow` is the pure
// half and was never wrong; what failed was the REFERENCE feeding it, which went stale and stopped
// revalidating over a long-lived process — measured 148 ordinals (~70 min) behind on a dev server
// up a few hours, snapping back to 0 on restart. These pin the property that makes the gate safe
// to be wrong about: the direction of its errors.
describe("the window's error direction", () => {
  it("a STALE-LOW reference is what refuses real ordinals — the failure the re-read exists for", () => {
    const trueLatest = 6856080;
    const stale = trueLatest - 148; // the measured staleness
    // A live ordinal, refused against the stale reference…
    expect(inServedWindow(trueLatest - 2, stale)).toBe(false);
    // …and accepted the moment the reference is current. withinServedWindow forces exactly that
    // re-read before it refuses, so this row can no longer be reached with a fresh reference.
    expect(inServedWindow(trueLatest - 2, trueLatest)).toBe(true);
  });

  it("fails OPEN with no reference — an unreadable reference must never deny history", () => {
    expect(inServedWindow(1, null)).toBe(true);
    expect(inServedWindow(9_999_999, null)).toBe(true);
  });

  it("still refuses nonsense above the future bound", () => {
    expect(inServedWindow(6856080 + FUTURE_WINDOW + 1, 6856080)).toBe(false);
    expect(inServedWindow(6856080 + FUTURE_WINDOW, 6856080)).toBe(true);
  });
});
