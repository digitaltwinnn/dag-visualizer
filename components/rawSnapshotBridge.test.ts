import { describe, it, expect } from "vitest";
import { backfillOrdinals, BACKFILL_N, BACKFILL_GAP_MS } from "./RawSnapshotBridge";

describe("backfillOrdinals", () => {
  it("asks for the previous eight ticks, newest first", () => {
    expect(backfillOrdinals(100, {})).toEqual([99, 98, 97, 96, 95, 94, 93, 92]);
    expect(BACKFILL_N).toBe(8);
  });

  it("skips ticks already read", () => {
    // Fixed-window semantics: scan the previous n ordinals, not n fetches.
    // Already-held ticks consume window slots. With n=4 and have={99,97},
    // the window is [99,98,97,96]; skip 99 and 97; collect [98,96].
    expect(backfillOrdinals(100, { 99: {}, 97: {} }, 4)).toEqual([98, 96]);
  });

  it("asks for nothing before the feed is live, or below ordinal 1", () => {
    expect(backfillOrdinals(null, {})).toEqual([]);
    expect(backfillOrdinals(3, {}, 8)).toEqual([2, 1]);
  });

  it("paces the backfill so a cold load never bursts the route", () => {
    expect(BACKFILL_GAP_MS).toBeGreaterThanOrEqual(400);
  });
});
