import { describe, expect, it } from "vitest";
import { chainNeedsCatchUp, globalsToAppend, missedGlobals } from "./liveMerge";
import type { GlobalSnapshot, RawMetaSnapshot } from "./types";

const snap = (ordinal: number) => ({ ordinal }) as GlobalSnapshot;
const shared = (hi: number, lo: number) => Array.from({ length: hi - lo + 1 }, (_, i) => snap(hi - i)); // newest first

describe("globalsToAppend", () => {
  it("appends every unseen ordinal oldest to newest when the window covers the gap", () => {
    const r = globalsToAppend(100, shared(112, 101));
    expect(r.append.map((s) => s.ordinal)).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]);
    expect(r.needCatchUp).toBeNull();
  });
  it("asks for a catch-up of the gap when the tab fell behind the window", () => {
    const r = globalsToAppend(80, shared(112, 101));
    expect(r.needCatchUp).toBe(32);
    expect(r.append).toHaveLength(12);
  });
  it("appends only the newest on the first read", () => {
    const r = globalsToAppend(null, shared(112, 101));
    expect(r.append.map((s) => s.ordinal)).toEqual([112]);
    expect(r.needCatchUp).toBeNull();
  });
  it("appends nothing when already current, and nothing for an empty window", () => {
    expect(globalsToAppend(112, shared(112, 101))).toEqual({ append: [], needCatchUp: null });
    expect(globalsToAppend(5, [])).toEqual({ append: [], needCatchUp: null });
    expect(globalsToAppend(null, [])).toEqual({ append: [], needCatchUp: null });
  });
});

describe("missedGlobals", () => {
  it("returns unseen ordinals oldest first, once each, and nothing without a prev", () => {
    expect(missedGlobals(10, [snap(13), snap(12), snap(12), snap(9)]).map((s) => s.ordinal)).toEqual([12, 13]);
    expect(missedGlobals(null, [snap(1)])).toEqual([]);
  });
});

describe("chainNeedsCatchUp", () => {
  const metas = (hi: number, lo: number) =>
    Array.from({ length: hi - lo + 1 }, (_, i) => ({ ordinal: hi - i }) as RawMetaSnapshot); // newest first
  it("catches up a cold buffer that the shared tail has snapshots for", () => {
    expect(chainNeedsCatchUp(-1, metas(250, 201))).toBe(true);
  });
  it("needs nothing when the shared tail reaches the held newest + 1", () => {
    expect(chainNeedsCatchUp(200, metas(250, 201))).toBe(false);
  });
  it("catches up when the shared tail starts past the held newest + 1", () => {
    expect(chainNeedsCatchUp(200, metas(300, 260))).toBe(true);
  });
  it("catches up a chain the shared answer did not carry", () => {
    expect(chainNeedsCatchUp(200, undefined)).toBe(true);
  });
  it("never catches up a chain whose shared tail is empty, even cold", () => {
    expect(chainNeedsCatchUp(-1, [])).toBe(false);
    expect(chainNeedsCatchUp(200, [])).toBe(false);
  });
});
