import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { metaSnapDeepKey } from "@/src/data/types";

describe("store.live / lastGoodAt", () => {
  it("records lastGoodAt on a live read and keeps it through a drop", () => {
    useStore.getState().setLive(true, 1000);
    expect(useStore.getState().live).toBe(true);
    expect(useStore.getState().lastGoodAt).toBe(1000);
    useStore.getState().setLive(false); // drop — no new timestamp
    expect(useStore.getState().live).toBe(false);
    expect(useStore.getState().lastGoodAt).toBe(1000); // preserved
  });
});

describe("store.engineReady", () => {
  it("defaults false and flips true once", () => {
    expect(useStore.getState().engineReady).toBe(false);
    useStore.getState().setEngineReady(true);
    expect(useStore.getState().engineReady).toBe(true);
  });
});

describe("the metagraph-snapshot slot", () => {
  it("holds one metagraph snapshot and bumps the selection stack like every other slot", () => {
    const sel = { metaId: "DAG0", ordinal: 745190, hash: "abc", globalOrdinal: 4200, ts: "t" };
    useStore.getState().setMetaSnap(sel);
    expect(useStore.getState().metaSnap).toEqual(sel);
    expect(useStore.getState().selStack[0]).toBe("metaSnap");
    useStore.getState().setMetaSnap(null);
    expect(useStore.getState().metaSnap).toBeNull();
    expect(useStore.getState().selStack).not.toContain("metaSnap");
  });
});

describe("the deep channel read cache", () => {
  it("keys a decode by tick + metagraph + the snapshot's OWN ordinal, keeping the first value", () => {
    const d = {
      globalOrdinal: 42, metaId: "DAG0", ordinal: 7, height: 8, subHeight: 9, epochProgress: 10,
      lastSnapshotHash: "h", fee: 1, bytes: 2, blocks: 0, signers: ["04917e4b"],
      stateKeys: [{ key: "updates", count: 3 }], stateBytes: 929, stateProof: "p",
      state: "{}", dataBlockSigners: [], dataTxCount: 0, dataTx: "",
    };
    expect(metaSnapDeepKey(42, "DAG0", 7)).toBe("42:DAG0:7");
    useStore.getState().setMetaSnapDeep(d);
    expect(useStore.getState().metaSnapDeep[metaSnapDeepKey(42, "DAG0", 7)]).toEqual(d);
    useStore.getState().setMetaSnapDeep({ ...d, bytes: 999 });
    expect(useStore.getState().metaSnapDeep[metaSnapDeepKey(42, "DAG0", 7)].bytes).toBe(2);
  });
});

describe("the trends view's channels", () => {
  // Each test is self-contained: reset the trend channels (and mode) here rather than relying
  // on ordering between tests — a shared singleton store persists state across `it` blocks.
  beforeEach(() => {
    useStore.setState({
      mode: "hyper",
      trendCursorMs: null,
      trendMetric: "snapshots",
      trendLayout: "stack",
      trendScroll: 0,
      trendFocus: null,
      trendScale: "shared",
    });
  });

  it("defaults to no cursor, the snapshots metric and a stacked layout", () => {
    const s = useStore.getState();
    expect(s.trendCursorMs).toBeNull();
    expect(s.trendMetric).toBe("snapshots");
    expect(s.trendLayout).toBe("stack");
    expect(s.trendScroll).toBe(0);
    expect(s.trendFocus).toBeNull();
    // SHARED IS THE DEFAULT (the document's own rule): a column of charts is read AS a column
    // first, and autoscaled per-plane it says "these are the same size" about networks that are
    // nothing of the kind. The honest reading is the one that needs no gesture.
    expect(s.trendScale).toBe("shared");
  });

  it("the scale preference flips, and a view switch leaves it alone", () => {
    useStore.getState().setTrendScale("own");
    expect(useStore.getState().trendScale).toBe("own");
    // NOT view-scoped, unlike `trendFocus`: it is how the reader likes their charts drawn, not a
    // rung of the ladder, so leaving and returning must not silently undo their choice.
    useStore.getState().setMode("hyper");
    expect(useStore.getState().trendScale).toBe("own");
    useStore.getState().setTrendScale("shared");
    expect(useStore.getState().trendScale).toBe("shared");
  });

  it("committing a focus does not move the cursor", () => {
    useStore.getState().setTrendCursor(1_700_000_000_000);
    useStore.getState().setTrendFocus("dor-metagraph");
    expect(useStore.getState().trendCursorMs).toBe(1_700_000_000_000);
    expect(useStore.getState().trendFocus).toBe("dor-metagraph");
  });

  it("leaving the trends view clears the focus but keeps the cursor", () => {
    useStore.getState().setTrendCursor(1_700_000_000_000);
    useStore.getState().setTrendFocus("dor-metagraph");
    useStore.getState().setMode("hyper");
    expect(useStore.getState().trendFocus).toBeNull();
    expect(useStore.getState().trendCursorMs).toBe(1_700_000_000_000);
  });
});
