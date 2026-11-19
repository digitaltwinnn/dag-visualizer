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
    useStore.getState().setTrendFocus("dor");
    expect(useStore.getState().selStack).toEqual(["range"]);
    // A cursor set afterwards is the newer commit and leads, as any commit does.
    useStore.getState().setTrendCursor(1_000);
    expect(useStore.getState().selStack).toEqual(["instant", "range"]);
  });
  // THE MOMENT KEEPS THE BOX (user, 2026-10-30: "moment card, clicking a row sets the explorer
  // focus correctly but the card itself also goes out of focus and the range card gets it
  // instead"). A plane focus still ranks the Range card, but never over the Moment card that is
  // the box: the Moment is the finer rung and the reader's own commit, and its rows re-scope it.
  it("a plane focus made while the Moment card is the box leaves the Moment the box, the Range ranked behind it", () => {
    useStore.getState().setTrendRange({ fromMs: 0, toMs: 86_400_000 });
    useStore.getState().setTrendCursor(1_000);
    expect(useStore.getState().selStack).toEqual(["instant", "range"]);
    useStore.getState().setTrendFocus("dor");
    expect(useStore.getState().selStack).toEqual(["instant", "range"]);
    // …and with no range brushed, the Range card is ranked in behind the Moment, not over it.
    useStore.setState({ selStack: ["instant"], trendRange: null, trendFocus: null });
    useStore.getState().setTrendFocus("dor");
    expect(useStore.getState().selStack).toEqual(["instant", "range"]);
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
  it("a searched span outranks the plane that comes back with it", () => {
    useStore.setState({ mode: "ledger", rawReturnMode: "trend", rawReturnFocus: "dor", logCut: { fromMs: 0, toMs: 86_400_000 }, trendRange: null, metaSnap: null, selStack: [] });
    useStore.getState().setSection("scene");
    expect(useStore.getState().selStack[0]).toBe("range");
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
  it("the LIVE BLOCK (the Blocks register's follow, D3) never enters the stack, and its arrival is loud; a pinned block ranks", () => {
    const blk = (hash: string) => ({ chain: "dag", hash, ordinal: 7, anchorOrd: 7 });
    useStore.setState({ selStack: [], block: null, navQuiet: true });
    useStore.getState().advanceBlock(blk("a"));
    expect(useStore.getState().block?.hash).toBe("a");
    expect(useStore.getState().selStack).toEqual([]);
    // A new block ARRIVING lifts a stale quiet gesture, as a new tick does (advanceSnap's rule)…
    expect(useStore.getState().navQuiet).toBe(false);
    // …and a re-advance onto the same block is not an arrival.
    useStore.setState({ navQuiet: true });
    useStore.getState().advanceBlock(blk("a"));
    expect(useStore.getState().navQuiet).toBe(true);
    useStore.getState().setBlock(blk("b"));
    expect(useStore.getState().selStack).toEqual(["block"]);
    useStore.getState().advanceBlock(blk("c"));
    expect(useStore.getState().selStack).toEqual(["block"]);
    useStore.getState().advanceBlock(null);
    expect(useStore.getState().selStack).toEqual([]);
  });
});

describe("a data block is in exactly one snapshot — the store's setters keep it so (2026-11-08)", () => {
  const ms = { metaId: "dor", ordinal: 7, hash: "h", globalOrdinal: 42, ts: "t" };
  it("setMetaSnap onto another snapshot, or onto none, drops the data block and its rank; its own snapshot keeps it", () => {
    useStore.setState({ metaSnap: ms, dataBlock: { snap: ms, index: 0 }, selStack: ["dataBlock", "metaSnap"] });
    useStore.getState().setMetaSnap({ ...ms, ordinal: 8 });
    expect(useStore.getState().dataBlock).toBeNull();
    expect(useStore.getState().selStack).not.toContain("dataBlock");
    useStore.setState({ metaSnap: ms, dataBlock: { snap: ms, index: 0 }, selStack: ["dataBlock", "metaSnap"] });
    useStore.getState().setMetaSnap(ms);
    expect(useStore.getState().dataBlock).toEqual({ snap: ms, index: 0 });
    useStore.getState().setMetaSnap(null);
    expect(useStore.getState().dataBlock).toBeNull();
  });
});
