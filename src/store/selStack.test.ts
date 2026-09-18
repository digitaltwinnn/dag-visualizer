import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "@/src/store/store";

// THE SELECTION RECENCY STACK'S IDENTITY (2026-09-19, fix round 1).
//
// `selStack` is subscribed by `useLadderFocus`, which every explorer row and the whole facts rail
// read. `bumpStack` rebuilt the array on EVERY write, so a channel that writes repeatedly with the
// slot already at the front — `setTrendCursor` during a scrub, at bucket frequency — handed zustand
// a fresh reference each time and re-rendered both rails for a list that had not moved.
//
// A no-op write must therefore be a no-op REFERENCE. The behaviour is unchanged: what moves still
// moves, and what is cleared is still dropped.
describe("selStack keeps its reference when nothing about it changed", () => {
  beforeEach(() => {
    useStore.setState({ selStack: [], trendCursorMs: null, filter: "all" });
  });

  it("a repeated cursor write does not mint a new stack", () => {
    const s = useStore.getState();
    s.setTrendCursor(1_000);
    const first = useStore.getState().selStack;
    expect(first).toEqual(["instant"]);
    s.setTrendCursor(2_000);
    expect(useStore.getState().selStack).toBe(first);
    s.setTrendCursor(3_000);
    expect(useStore.getState().selStack).toBe(first);
  });

  it("…and the same holds for every other slot that bumps", () => {
    const s = useStore.getState();
    s.setFilter("dor");
    const first = useStore.getState().selStack;
    s.setFilter("ded");
    expect(useStore.getState().selStack).toBe(first);
  });

  it("but a real move still moves, and a clear still drops", () => {
    const s = useStore.getState();
    s.setTrendCursor(1_000);
    s.setFilter("dor");
    expect(useStore.getState().selStack).toEqual(["network", "instant"]);
    s.setTrendCursor(2_000);
    expect(useStore.getState().selStack).toEqual(["instant", "network"]);
    s.setTrendCursor(null);
    expect(useStore.getState().selStack).toEqual(["network"]);
  });
});
