import { describe, expect, it } from "vitest";

import { LIVE_ARRIVAL_MS, liveArrivals } from "./arrivals";

describe("liveArrivals — a batch is split by the snapshots' own age", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();

  it("counts only the snapshots younger than the window", () => {
    expect(liveArrivals([at(2), at(30), at(59)], now)).toBe(3);
    expect(liveArrivals([at(2), at(600), at(3600)], now)).toBe(1);
    expect(liveArrivals([at(600), at(3600)], now)).toBe(0);
  });

  it("the window is a minute by default and can be narrowed", () => {
    expect(LIVE_ARRIVAL_MS).toBe(60_000);
    expect(liveArrivals([at(45)], now)).toBe(1);
    expect(liveArrivals([at(45)], now, 30_000)).toBe(0);
  });

  it("an unparsable stamp is not an arrival; a stamp from the future is", () => {
    expect(liveArrivals(["not a date", ""], now)).toBe(0);
    expect(liveArrivals([at(-5)], now)).toBe(1);
  });
});
