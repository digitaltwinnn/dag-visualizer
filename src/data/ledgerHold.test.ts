import { describe, it, expect } from "vitest";
import { heldTicks, nextHoldTop } from "./ledgerHold";

const tick = (ordinal: number) => ({ ordinal });
const buffer = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => tick(from + i)); // oldest → newest

describe("nextHoldTop (where the list's head freezes while a tick is pinned)", () => {
  it("is null while following — the list is the live buffer", () => {
    expect(nextHoldTop(null, null, 110)).toBeNull();
    expect(nextHoldTop(105, null, 110)).toBeNull(); // releasing the pin releases the hold
  });

  it("freezes at the NEWEST tick on screen at the moment of the pin, not at the pin itself", () => {
    // Pinning 105 while 110 is the head keeps 106…110 in the list: nothing the reader could see
    // disappears, the list only stops GROWING.
    expect(nextHoldTop(null, 105, 110)).toBe(110);
  });

  it("holds through later live ticks", () => {
    expect(nextHoldTop(110, 105, 117)).toBe(110);
  });

  it("rises only when the pin itself steps above it (the pager's › past the held head)", () => {
    expect(nextHoldTop(110, 112, 117)).toBe(112);
    expect(nextHoldTop(110, 108, 117)).toBe(110);
  });
});

describe("heldTicks (the rows the explorer lists, and how many newer ones wait)", () => {
  it("is the whole buffer with nothing waiting while not held", () => {
    const snaps = buffer(100, 110);
    expect(heldTicks(snaps, null, null)).toEqual({ ticks: snaps, newer: 0 });
  });

  it("hides the ticks newer than the hold and counts them", () => {
    const snaps = buffer(100, 117);
    const h = heldTicks(snaps, 110, 105);
    expect(h.ticks.map((t) => t.ordinal)).toEqual(buffer(100, 110).map((t) => t.ordinal));
    expect(h.newer).toBe(7);
  });

  it("keeps the caller's order (oldest → newest in, the same out)", () => {
    const h = heldTicks(buffer(100, 104), 102, 101);
    expect(h.ticks.map((t) => t.ordinal)).toEqual([100, 101, 102]);
  });

  // The buffer is a rolling window: after enough live ticks the pinned one is evicted, and a held
  // list would shrink to nothing behind a pin it can no longer show. Then the hold lets go and the
  // list is the live buffer again — an honest list over an empty frozen one (rule 10).
  it("lets go once the pinned tick has left the buffer", () => {
    const snaps = buffer(120, 171); // 105 and the hold at 110 are long gone
    expect(heldTicks(snaps, 110, 105)).toEqual({ ticks: snaps, newer: 0 });
  });
});
