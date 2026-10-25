import { describe, expect, it } from "vitest";
import { POLL } from "@/src/engine/config";
import { CLUSTER_WINDOW, SNAPSHOT_WINDOW, cacheControl, cacheWindow, worstAgeMs } from "./windows";

describe("the live feed's cache windows, derived from the poll", () => {
  it("keeps the edge under the poll, so a tab's next poll never shares an answer", () => {
    expect(SNAPSHOT_WINDOW.sMaxAge * 1000).toBeLessThan(POLL.pollMs);
    expect(CLUSTER_WINDOW.sMaxAge * 1000).toBeLessThan(POLL.clusterMs);
  });
  it("keeps the memo short, so the edge is the one real window", () => {
    expect(SNAPSHOT_WINDOW.memoMs).toBeLessThanOrEqual(5000);
    expect(CLUSTER_WINDOW.memoMs).toBeLessThanOrEqual(5000);
  });
  it("states today's numbers: 5s poll → memo 4s, edge 4s + 2s; 30s poll → memo 5s, edge 25s + 5s", () => {
    expect(cacheWindow(5000)).toEqual({ memoMs: 4000, sMaxAge: 4, swr: 2 });
    expect(cacheWindow(30000)).toEqual({ memoMs: 5000, sMaxAge: 25, swr: 5 });
    expect(cacheControl(cacheWindow(5000))).toBe("public, s-maxage=4, stale-while-revalidate=2");
  });
  it("bounds the oldest answer a tab can get", () => {
    expect(worstAgeMs(SNAPSHOT_WINDOW)).toBe(10_000);
    expect(worstAgeMs(CLUSTER_WINDOW)).toBe(35_000);
  });
});
