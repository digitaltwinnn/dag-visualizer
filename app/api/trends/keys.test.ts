import { describe, it, expect } from "vitest";
import { slotOf, fieldOf, slotsInWindow, stepMsOf, cursorKeyOf, lockKeyOf, TTL_S } from "./keys";

const T = Date.UTC(2026, 8, 6, 14, 37, 22); // 2026-09-06T14:37:22Z

describe("trends keys", () => {
  it("floors 5m buckets and keys per UTC day", () => {
    expect(slotOf("mainnet", "5m", T)).toEqual({ key: "t:mainnet:5m:2026-09-06", bucket: "14:35" });
  });
  it("keys 1h per month, 1d per year", () => {
    expect(slotOf("mainnet", "1h", T)).toEqual({ key: "t:mainnet:1h:2026-09", bucket: "06-14" });
    expect(slotOf("mainnet", "1d", T)).toEqual({ key: "t:mainnet:1d:2026", bucket: "09-06" });
  });
  it("builds fields and utility keys", () => {
    expect(fieldOf("14:35", "g.ticks")).toBe("14:35|g.ticks");
    expect(cursorKeyOf("mainnet")).toBe("t:mainnet:cursor");
    expect(lockKeyOf("mainnet")).toBe("t:mainnet:lock");
  });
  // EVERY tier keeps forever since 2026-09-10: the range zoom sharpens to the finest grain
  // that exists, and a null TTL also means applyWrites never re-arms an expiry on a
  // PERSISTed key (the one-time sweep that lifted the finite era's pending expiries).
  it("pins the retention contract — every tier keeps forever", () => {
    expect(TTL_S["5m"]).toBeNull();
    expect(TTL_S["1h"]).toBeNull();
    expect(TTL_S["1d"]).toBeNull();
  });
  it("enumerates window slots inclusively and in order, crossing key boundaries", () => {
    const from = Date.UTC(2026, 8, 5, 23, 50);
    const to = Date.UTC(2026, 8, 6, 0, 5);
    const slots = slotsInWindow("mainnet", "5m", from, to);
    expect(slots.map((s) => s.bucket)).toEqual(["23:50", "23:55", "00:00", "00:05"]);
    expect(new Set(slots.map((s) => s.key)).size).toBe(2); // two day keys
    expect(slots[0].tsMs).toBe(from);
    expect(stepMsOf("5m")).toBe(300000);
  });
});
