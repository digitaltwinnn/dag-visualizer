import { describe, expect, it } from "vitest";
import { POLL } from "@/src/engine/config";
import { META_CATCHUP_MAX, nextCatchUpLimit } from "@/src/data/liveMerge";
import { GLOBALS_LADDER, LIVE_GLOBALS, META_LADDER, clampLimit } from "./limit";

describe("the limit ladders", () => {
  it("meta: the client's own catch-up limits — tail and seed, each ×3 to the cap", () => {
    expect(META_LADDER).toEqual([50, 60, 150, 180, 450, 540, 600]);
  });
  it("meta: every limit the client's catch-up loop can send is a rung", () => {
    for (const start of [POLL.metaSnapTail, POLL.metaSnapSeed]) {
      let lim = start;
      for (let i = 0; i < 6; i++) {
        expect(META_LADDER).toContain(lim);
        if (lim >= META_CATCHUP_MAX) break;
        lim = nextCatchUpLimit(lim);
      }
    }
  });
  it("globals: the shared window and the whole retained buffer", () => {
    expect(GLOBALS_LADDER).toEqual([LIVE_GLOBALS, POLL.maxSnapshots]);
    expect(GLOBALS_LADDER).toEqual([12, 52]);
  });
});

describe("clampLimit", () => {
  it("rounds UP to the next rung", () => {
    expect(clampLimit("7", META_LADDER)).toBe(50);
    expect(clampLimit("8", META_LADDER)).toBe(50);
    expect(clampLimit("51", META_LADDER)).toBe(60);
    expect(clampLimit("60", META_LADDER)).toBe(60);
    expect(clampLimit("13", GLOBALS_LADDER)).toBe(52);
    expect(clampLimit("3", GLOBALS_LADDER)).toBe(12);
  });
  it("caps above the top rung", () => {
    expect(clampLimit("9999", META_LADDER)).toBe(600);
    expect(clampLimit("999", GLOBALS_LADDER)).toBe(52);
  });
  it("answers the smallest rung for an absent, zero, negative or junk limit", () => {
    for (const raw of [null, "", "0", "-5", "abc", "NaN", "Infinity"]) {
      expect(clampLimit(raw, META_LADDER)).toBe(50);
      expect(clampLimit(raw, GLOBALS_LADDER)).toBe(12);
    }
  });
});
