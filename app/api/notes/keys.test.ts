import { describe, expect, it } from "vitest";
import { KIND_TIMING, capKeyOf, failKeyOf, lockKeyOf, noteKeyOf, rateKeyOf, snapSpan, statsKeyOf, timingOf, NOTES_VERSION } from "./keys";

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const MIN = 60_000;
const DAY = 86_400_000;

describe("keys", () => {
  it("writes a note key in its own family", () => {
    expect(NOTES_VERSION).toBe(7);
    expect(noteKeyOf("mainnet", "trend", "dag", "7d")).toBe("ai:mainnet:v7:trend:dag:7d");
    expect(noteKeyOf("mainnet", "hyper", "all", "day")).toBe("ai:mainnet:v7:hyper:all:day");
  });

  it("keeps lock, stats, rate and cap keys inside the ai: family and apart from note keys", () => {
    const note = noteKeyOf("mainnet", "geo", "all", "day");
    expect(lockKeyOf(note)).toBe(`${note}:lock`);
    expect(failKeyOf(note)).toBe(`${note}:fail`);
    expect(statsKeyOf("mainnet", "2026-10-27")).toBe("ai:mainnet:stats:2026-10-27");
    expect(rateKeyOf("mainnet", "0123456789abcdef", "2026-10-27T12")).toBe("ai:mainnet:rate:0123456789abcdef:2026-10-27T12");
    expect(capKeyOf("mainnet", "2026-10-27")).toBe("ai:mainnet:cap:2026-10-27");
    for (const k of [lockKeyOf(note), failKeyOf(note), statsKeyOf("mainnet", "d"), rateKeyOf("mainnet", "h", "x"), capKeyOf("mainnet", "d")]) {
      expect(k.startsWith("ai:")).toBe(true);
      expect(k.startsWith("t:") || k.startsWith("geo:")).toBe(false);
    }
  });

  describe("snapSpan", () => {
    it("refuses a reversed, empty or future span", () => {
      expect(snapSpan(NOW - MIN, NOW - 2 * MIN, NOW)).toBeNull();
      expect(snapSpan(NOW - MIN, NOW - MIN, NOW)).toBeNull();
      expect(snapSpan(NOW + DAY, NOW + 2 * DAY, NOW)).toBeNull();
    });

    it("snaps two brushes a few minutes apart inside the same 5m buckets to equal spans", () => {
      const a0 = Date.UTC(2026, 9, 20, 10, 1, 10);
      const a1 = Date.UTC(2026, 9, 20, 14, 2, 20);
      const b0 = a0 + 3 * MIN; // 10:04:10, same bucket
      const b1 = a1 + 2 * MIN; // 14:04:20, same bucket
      const x = snapSpan(a0, a1, NOW)!;
      expect(x).toEqual({ fromMs: Date.UTC(2026, 9, 20, 10, 0), toMs: Date.UTC(2026, 9, 20, 14, 5) });
      expect(snapSpan(b0, b1, NOW)).toEqual(x);
    });

    it("snaps a 10-day range (daily grain) to whole days", () => {
      const from = Date.UTC(2025, 2, 1, 7, 30);
      const to = Date.UTC(2025, 2, 11, 3, 15);
      const s = snapSpan(from, to, NOW)!;
      expect(s.fromMs % DAY).toBe(0);
      expect(s.toMs % DAY).toBe(0);
      expect(s).toEqual({ fromMs: Date.UTC(2025, 2, 1), toMs: Date.UTC(2025, 2, 12) });
    });

    it("snaps a week at hourly grain to whole hours", () => {
      const from = Date.UTC(2026, 9, 1, 7, 30);
      const to = Date.UTC(2026, 9, 8, 3, 15);
      expect(snapSpan(from, to, NOW)).toEqual({ fromMs: Date.UTC(2026, 9, 1, 7), toMs: Date.UTC(2026, 9, 8, 4) });
    });

    it("clamps the end to the last whole bucket before now, so a brush ending now keeps one key", () => {
      const from = Date.UTC(2026, 9, 27, 9, 0);
      const now1 = NOW + 1 * MIN; // mid-bucket
      const now2 = NOW + 3 * MIN; // same bucket, later
      const a = snapSpan(from, now1, now1)!;
      expect(a.toMs).toBe(Math.floor(now1 / (5 * MIN)) * 5 * MIN);
      expect(a.toMs).toBe(NOW);
      expect(snapSpan(from, now2 + 10 * MIN, now2)).toEqual(a);
      expect(snapSpan(from, now2, now2)).toEqual(a);
    });

    it("re-snaps to itself, also when snapping carries a range across a tier boundary", () => {
      const from = Date.UTC(2026, 9, 20, 10, 1);
      const to = from + 2 * DAY; // exactly 2 days: the 5m tier
      const x = snapSpan(from, to, NOW)!;
      expect(x).toEqual({ fromMs: Date.UTC(2026, 9, 20, 10, 0), toMs: Date.UTC(2026, 9, 22, 11, 0) }); // now hourly
      expect(snapSpan(x.fromMs, x.toMs, NOW)).toEqual(x);
      const d = snapSpan(Date.UTC(2025, 2, 1, 7, 30), Date.UTC(2025, 2, 11, 3, 15), NOW)!;
      expect(snapSpan(d.fromMs, d.toMs, NOW)).toEqual(d);
    });

    it("refuses a span under one 5-minute bucket after snapping", () => {
      const now = NOW + 2.5 * MIN; // mid-bucket: a brush ending now clamps to 2.5 minutes of the open bucket
      expect(snapSpan(now - MIN, now, now)).toBeNull();
      expect(snapSpan(NOW - 2 * DAY, NOW - 2 * DAY + 1, NOW)).not.toBeNull(); // snaps outward to one whole bucket
    });
  });

  describe("timing", () => {
    it("holds the freshness table", () => {
      expect(KIND_TIMING.hyper).toEqual({ refreshMs: 86_400_000, ttlS: 259_200 });
      expect(KIND_TIMING.geo).toEqual({ refreshMs: 86_400_000, ttlS: 259_200 });
      expect(KIND_TIMING.ledger).toEqual({ refreshMs: 3_600_000, ttlS: 21_600 });
      expect(KIND_TIMING.trend24h).toEqual({ refreshMs: 3_600_000, ttlS: 21_600 });
      expect(KIND_TIMING.trendDaily).toEqual({ refreshMs: 86_400_000, ttlS: 259_200 });
      expect(KIND_TIMING.trend1h).toEqual({ refreshMs: null, ttlS: 900 });
      expect(KIND_TIMING.range).toEqual({ refreshMs: null, ttlS: 2_592_000 });
    });

    it("maps a view and span to its kind", () => {
      expect(timingOf("trend", "24h").refreshMs).toBe(3_600_000);
      expect(timingOf("trend", "r1-2").refreshMs).toBeNull();
      expect(timingOf("trend", "r1-2")).toBe(KIND_TIMING.range);
      expect(timingOf("trend", "1h")).toBe(KIND_TIMING.trend1h);
      for (const s of ["7d", "30d", "1y", "all"] as const) expect(timingOf("trend", s)).toBe(KIND_TIMING.trendDaily);
      expect(timingOf("hyper", "day")).toBe(KIND_TIMING.hyper);
      expect(timingOf("geo", "day")).toBe(KIND_TIMING.geo);
      expect(timingOf("ledger", "hours")).toBe(KIND_TIMING.ledger);
    });
  });
});
