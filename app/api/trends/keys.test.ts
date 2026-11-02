import { describe, it, expect } from "vitest";
import { chainReadField, chainReadsOf, slotOf, fieldOf, slotsInWindow, stepMsOf, cursorKeyOf, lockKeyOf, geoSitesSlotOf, geoSlotOf, ispNamesKeyOf, TTL_S } from "./keys";

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

describe("the geo family", () => {
  it("keeps a provider's cities in one hash per month, read a week at a time", () => {
    expect(geoSitesSlotOf("mainnet", Date.UTC(2026, 9, 31, 23, 59))).toEqual({ key: "geo:mainnet:sites:2026-10", bucket: "10-31" });
    expect(geoSitesSlotOf("mainnet", Date.UTC(2026, 10, 1)).key).toBe("geo:mainnet:sites:2026-11");
  });
  it("is one hash per UTC year, one bucket per UTC day, outside the t:{net}:* tiers a rebuild wipes", () => {
    const s = geoSlotOf("mainnet", Date.UTC(2026, 9, 27, 23, 59));
    expect(s).toEqual({ key: "geo:mainnet:2026", bucket: "10-27" });
    expect(geoSlotOf("mainnet", Date.UTC(2027, 0, 1, 0, 0)).key).toBe("geo:mainnet:2027");
    expect(s.key.startsWith("t:")).toBe(false);
  });
  it("keeps provider names beside it, per network", () => {
    expect(ispNamesKeyOf("mainnet")).toBe("geo:mainnet:isp");
  });
});

// Silence is only measured where the chain was read (notes, the review of 2026-11-02): a chain with
// nothing new and a chain that failed leave the same store otherwise.
describe("chainReadsOf", () => {
  it("collects each chain's last read from the cursor hash, and nothing else", () => {
    expect(chainReadsOf({ v: "1", g: "102", "m.abc": "9", [chainReadField("abc")]: "1000", [chainReadField("def")]: 2000 })).toEqual({ abc: 1000, def: 2000 });
  });
  it("is empty for a store with no cursor, and for one from before the first run that keeps a read", () => {
    expect(chainReadsOf(null)).toEqual({});
    expect(chainReadsOf({ v: "1", g: "102" })).toEqual({});
  });
});
