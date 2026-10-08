import { describe, expect, it } from "vitest";

import { LIVE_ARRIVAL_MS, liveArrivals } from "./arrivals";

describe("liveArrivals — a batch is split against its own newest stamp", () => {
  const base = Date.parse("2026-10-08T12:00:00Z");
  const at = (secondsBeforeNewest: number) => new Date(base - secondsBeforeNewest * 1000).toISOString();

  it("counts the snapshots within the window of the batch's newest stamp", () => {
    expect(liveArrivals([at(0), at(30), at(59)])).toBe(3);
    expect(liveArrivals([at(0), at(600), at(3600)])).toBe(1);
    expect(liveArrivals([at(0), at(10), at(3600), at(7200)])).toBe(2);
  });

  it("is indifferent to the wall clock: an old batch still counts its own last minute", () => {
    // Stamps hours old (an explorer lagging, a slow client clock) are still arrivals among themselves.
    expect(liveArrivals([at(5), at(0)])).toBe(2);
  });

  it("the window is a minute by default and can be narrowed", () => {
    expect(LIVE_ARRIVAL_MS).toBe(60_000);
    expect(liveArrivals([at(0), at(45)])).toBe(2);
    expect(liveArrivals([at(0), at(45)], 30_000)).toBe(1);
  });

  it("an unparsable stamp is not an arrival, and an empty batch has none", () => {
    expect(liveArrivals(["not a date", ""])).toBe(0);
    expect(liveArrivals([])).toBe(0);
    expect(liveArrivals([at(0), "nope"])).toBe(1);
  });
});
