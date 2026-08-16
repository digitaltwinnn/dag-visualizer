import { describe, it, expect, vi } from "vitest";
import { subjectPairing } from "./useSubjectPairing";

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
