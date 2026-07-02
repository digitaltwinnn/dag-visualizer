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
