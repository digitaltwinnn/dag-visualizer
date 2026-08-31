import { describe, it, expect } from "vitest";
import {
  backfillOrdinals,
  BACKFILL_N,
  BACKFILL_GAP_MS,
  retryDelay,
  RETRY_MAX,
  RETRY_BASE_MS,
} from "./RawSnapshotBridge";

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

// The backfill's misses are usually the LB not having propagated the newest ordinals yet, so they
// get a BOUNDED retry. These pin the bounds, not the pacing: the budget must stay finite (or the
// retry becomes the poll the deep-read rule forbids) and must stay inside one snapshot cadence
// (~28s measured), or a retry lands after the next tick has already moved the trail on.
describe("retryDelay", () => {
  it("spends a finite budget and then gives up for good", () => {
    expect(retryDelay(RETRY_MAX)).toBeNull();
    expect(retryDelay(RETRY_MAX + 5)).toBeNull();
    expect(RETRY_MAX).toBeGreaterThan(0);
  });

  it("backs off, so a struggling upstream is not asked twice at the same moment", () => {
    const delays = Array.from({ length: RETRY_MAX }, (_, i) => retryDelay(i) as number);
    expect(delays.every((d) => d > 0)).toBe(true);
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThan(delays[i - 1]);
  });

  it("spends the whole budget inside one ~28s snapshot cadence", () => {
    const total = Array.from({ length: RETRY_MAX }, (_, i) => retryDelay(i) as number).reduce(
      (a, b) => a + b,
      0,
    );
    expect(total).toBeLessThan(28_000);
    expect(RETRY_BASE_MS).toBeGreaterThanOrEqual(1000); // never a tight loop against the route
  });
});
