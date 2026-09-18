import { describe, it, expect, vi } from "vitest";
import { shouldRelease, subjectPairing } from "./useSubjectPairing";

describe("subjectPairing", () => {
  it("is paired when the key matches the active channel value, exposing the hue var", () => {
    const p = subjectPairing("1.2.3.4", "1.2.3.4", () => {}, "#36e29a");
    expect(p.paired).toBe(true);
    expect(p.className).toBe("subject-paired");
    expect(p.style).toEqual({ "--row-hue": "#36e29a" });
  });
  it("is NOT paired when values differ or the key is null; no hue var at rest", () => {
    expect(subjectPairing(42, 7, () => {}, "#fff").paired).toBe(false);
    expect(subjectPairing(5, null, () => {}, "#fff").paired).toBe(false);
    expect(subjectPairing(5, 7, () => {}, "#fff").className).toBe("");
    expect(subjectPairing(5, 7, () => {}, "#fff").style).toBeUndefined();
  });
  it("onMouseEnter sets the key, onMouseLeave clears it", () => {
    const set = vi.fn();
    const p = subjectPairing<number>(null, 42, set, "#fff");
    p.onMouseEnter(); expect(set).toHaveBeenCalledWith(42);
    p.onMouseLeave(); expect(set).toHaveBeenCalledWith(null);
  });

  it("onMouseMove re-arms a swapped-in element under a stationary pointer, once", () => {
    // Not yet paired (active !== key): the first move writes the key — the swap-under-pointer
    // healer (a pager step replaces the keyed card; mouseenter never fires on the new element).
    const set = vi.fn();
    const unpaired = subjectPairing<number>(null, 42, set, "#fff");
    unpaired.onMouseMove();
    expect(set).toHaveBeenCalledWith(42);
    // Already paired (active === key): moves are no-ops, not a store write per pixel.
    const paired = subjectPairing<number>(42, 42, set, "#fff");
    set.mockClear();
    paired.onMouseMove();
    expect(set).not.toHaveBeenCalled();
  });
});

// ── WHO OWNS A HOVER (2026-09-19, fix round 2) ──────────────────────────────────────────────
// `hoverFilter` is ONE shared channel (convention 9): the top bar's filter strip writes it over
// every catalog metagraph, the History rails over the whole roster, the chart stack over only the
// planes currently on screen. So "is this id in MY list" is a DOMAIN question, and using it as an
// OWNERSHIP question is wrong in both directions — a surface whose domain is narrower wipes a
// hover it never set, and a surface that is unmounting wipes whatever the pointer moved on to.
//
// The rule is therefore about the WRITE, not the value: a surface releases only the key IT set,
// only while the channel still holds it, and only once nothing of that surface renders it any more
// (an unmounting surface renders nothing, so it passes an empty set).
describe("shouldRelease — a surface releases only the hover it set", () => {
  it("never releases a value this surface did not set", () => {
    expect(shouldRelease({ mine: null, active: "dor", present: ["ded"] })).toBe(false);
    expect(shouldRelease({ mine: null, active: null, present: [] })).toBe(false);
  });

  it("never releases while the subject is still rendered here", () => {
    expect(shouldRelease({ mine: "dor", active: "dor", present: ["dor", "ded"] })).toBe(false);
  });

  it("releases once the subject has left this surface's rendered set", () => {
    expect(shouldRelease({ mine: "dor", active: "dor", present: ["ded"] })).toBe(true);
  });

  it("releases at unmount, where the surface renders nothing at all", () => {
    expect(shouldRelease({ mine: "dor", active: "dor", present: [] })).toBe(true);
  });

  it("never releases once the channel has moved on to another id", () => {
    // The reviewer's sequence: hover a cursor-card row, move onto a Layers row, close the card.
    // The card's cleanup must not wipe the hover the pointer is now on, even though that id is in
    // its own roster.
    expect(shouldRelease({ mine: "dor", active: "ded", present: [] })).toBe(false);
    expect(shouldRelease({ mine: "dor", active: "ded", present: ["dor", "ded"] })).toBe(false);
  });

  it("never releases a channel that is already clear", () => {
    expect(shouldRelease({ mine: "dor", active: null, present: [] })).toBe(false);
  });
});
