import { describe, it, expect } from "vitest";
import { useStore } from "./store";

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
