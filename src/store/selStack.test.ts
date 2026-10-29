import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "@/src/store/store";

// THE SELECTION RECENCY STACK'S IDENTITY (2026-09-19).
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

describe("the RANGE takes a place in the stack (History's Range card, 2026-10-07)", () => {
  beforeEach(() => {
    useStore.setState({ selStack: [], trendCursorMs: null, trendRange: null, filter: "all" });
  });
  it("a brushed range bumps it, and a window pick — which retires the range — drops it", () => {
    const s = useStore.getState();
    s.setTrendRange({ fromMs: 0, toMs: 86_400_000 });
    expect(useStore.getState().selStack).toEqual(["range"]);
    s.setTrendCursor(1_000);
    expect(useStore.getState().selStack).toEqual(["instant", "range"]);
    s.setTrendWindow("30d");
    expect(useStore.getState().selStack).toEqual(["instant"]);
  });
  it("clearing the range drops it", () => {
    const s = useStore.getState();
    s.setTrendRange({ fromMs: 0, toMs: 86_400_000 });
    s.setTrendRange(null);
    expect(useStore.getState().selStack).toEqual([]);
  });
});

describe("a plane focus bumps the RANGE slot (user, 2026-10-25 — a plane is its network's chart over the span, so the Range card is the focused plane's own card)", () => {
  beforeEach(() => useStore.setState({ selStack: [], trendFocus: null, filter: "all" }));
  it("focusing a plane makes the Range card the active card", () => {
    useStore.getState().setTrendCursor(1_000);
    useStore.getState().setTrendFocus("dor");
    expect(useStore.getState().selStack).toEqual(["range", "instant"]);
  });
  it("releasing the focus drops the Range rank, unless a brushed range holds it (R70 review, 2026-10-29)", () => {
    useStore.setState({ trendRange: null });
    useStore.getState().setTrendFocus("dor");
    useStore.getState().setTrendFocus(null);
    expect(useStore.getState().selStack).toEqual([]);
    useStore.getState().setTrendRange({ fromMs: 0, toMs: 86_400_000 });
    useStore.getState().setTrendFocus("dor");
    useStore.getState().setTrendFocus(null);
    expect(useStore.getState().selStack).toEqual(["range"]);
  });
  it("a second arrival does not inherit the last visit's plane rank", () => {
    useStore.setState({ mode: "hyper", trendRange: null });
    useStore.getState().setMode("trend");
    useStore.getState().setTrendFocus("dor");
    expect(useStore.getState().selStack).toEqual(["range"]);
    useStore.getState().setMode("hyper");
    useStore.getState().setMode("trend");
    expect(useStore.getState().trendFocus).toBe("dag");
    expect(useStore.getState().selStack).toEqual([]);
  });
  it("a span searched in the raw log comes back as a RANKED range (the Range card is the box, not folded under the note)", () => {
    useStore.setState({ mode: "ledger", rawReturnMode: "trend", logCut: { fromMs: 0, toMs: 86_400_000 }, trendRange: null, metaSnap: null, tickNet: null, rawReturnFocus: null });
    useStore.getState().setSection("scene");
    const s = useStore.getState();
    expect(s.mode).toBe("trend");
    expect(s.trendRange).not.toBeNull();
    expect(s.selStack[0]).toBe("range");
  });
});

// R70 (user, 2026-10-29): the stack is WHAT THE READER PICKED, and the AI notes card keeps the
// resting box over any card the view seated by itself (`focusSlotId` reads the stack as "chosen").
describe("what the view seats by itself is not in the stack (R70)", () => {
  beforeEach(() => useStore.setState({ selStack: [], trendFocus: null, filter: "all", mode: "hyper", snap: null }));
  it("arriving in History brings the entry plane forward but ranks nothing; a row click on a plane ranks its Range card", () => {
    useStore.getState().setMode("trend");
    expect(useStore.getState().trendFocus).toBe("dag");
    expect(useStore.getState().selStack).toEqual([]);
    useStore.getState().setTrendFocus("dor");
    expect(useStore.getState().selStack).toEqual(["range"]);
  });
  it("the live tick never enters the stack; a pinned tick does, and a tick going away drops the pin", () => {
    const tick = (ordinal: number) => ({ kind: "snapshot", title: `Global snapshot #${ordinal}`, data: { ordinal } }) as unknown as Parameters<ReturnType<typeof useStore.getState>["advanceSnap"]>[0] & object;
    useStore.getState().advanceSnap(tick(1));
    expect(useStore.getState().selStack).toEqual([]);
    useStore.getState().setSnap(tick(2));
    expect(useStore.getState().selStack).toEqual(["snap"]);
    useStore.getState().advanceSnap(tick(3));
    expect(useStore.getState().selStack).toEqual(["snap"]);
    useStore.getState().advanceSnap(null);
    expect(useStore.getState().selStack).toEqual([]);
  });
});
