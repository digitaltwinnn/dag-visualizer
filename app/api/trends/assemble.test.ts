import { describe, it, expect } from "vitest";
import { assemble, assembleSpan, WINDOWS } from "./assemble";

describe("assemble", () => {
  const now = Date.UTC(2026, 8, 6, 14, 12);
  it("pins the window→tier contract", () => {
    expect(WINDOWS["24h"].tier).toBe("5m");
    expect(WINDOWS["7d"].tier).toBe("1h");
    expect(WINDOWS["30d"].tier).toBe("1h");
    expect(WINDOWS["90d"].tier).toBe("1d");
    expect(WINDOWS["90d"].ms).toBe(90 * 86400000);
    expect(WINDOWS["180d"].tier).toBe("1d");
    expect(WINDOWS["180d"].ms).toBe(180 * 86400000);
    expect(WINDOWS["1y"].tier).toBe("1d");
    // "all" spans far past the store's own birth — the honest span is the consumer's leading
    // trim, so the table only promises daily tier and room (≥ the global chain's 2022 genesis).
    expect(WINDOWS["all"].tier).toBe("1d");
    expect(WINDOWS["all"].ms).toBeGreaterThan(4 * 365 * 86400000);
  });
  it("null for uncovered buckets, 0 for covered-but-absent counters, null for absent gauges", () => {
    const p = assemble("mainnet", "24h", now, {
      "t:mainnet:5m:2026-09-06": {
        "14:00|g.ticks": "2", "14:00|g.anchors": "5", "14:00|m.abc.snaps": "1",
        "14:05|g.ticks": "0", // covered, empty
      },
    });
    const i = p.buckets.indexOf(Date.UTC(2026, 8, 6, 14, 0));
    const j = p.buckets.indexOf(Date.UTC(2026, 8, 6, 14, 5));
    const k = p.buckets.indexOf(Date.UTC(2026, 8, 6, 13, 55)); // never sampled
    expect(p.series["g.anchors"][i]).toBe(5);
    expect(p.series["m.abc.snaps"][i]).toBe(1);
    expect(p.series["g.anchors"][j]).toBe(0);      // covered → honest zero
    expect(p.series["m.abc.snaps"][j]).toBe(0);    // covered → honest zero
    expect(p.series["g.anchors"][k]).toBeNull();   // not measured → null
    expect(p.series["g.ticks"][k]).toBeNull();
  });
  it("gauges are value-or-null, never zero-filled", () => {
    const p = assemble("mainnet", "7d", now, {
      "t:mainnet:1h:2026-09": { "06-14|g.ticks": "120", "06-14|f.nodes": "195", "06-13|g.ticks": "118" },
    });
    const i14 = p.buckets.indexOf(Date.UTC(2026, 8, 6, 14, 0));
    const i13 = p.buckets.indexOf(Date.UTC(2026, 8, 6, 13, 0));
    expect(p.series["f.nodes"][i14]).toBe(195);
    expect(p.series["f.nodes"][i13]).toBeNull(); // covered hour, but the gauge wasn't sampled
  });
  it("spans window length at tier resolution with the newest bucket last", () => {
    const p = assemble("mainnet", "24h", now, {});
    expect(p.tier).toBe("5m");
    expect(p.stepMs).toBe(300000);
    expect(p.buckets.length).toBe(24 * 12 + 1);
    expect(p.buckets[p.buckets.length - 1]).toBe(Date.UTC(2026, 8, 6, 14, 10));
  });
});

describe("assembleSpan (the tile body)", () => {
  it("serves an arbitrary calendar unit with the same honesty contract", () => {
    const day = Date.UTC(2026, 8, 8);
    const p = assembleSpan("mainnet", "tile", "5m", day, day + 86400000, Date.UTC(2026, 8, 10), {
      "t:mainnet:5m:2026-09-08": {
        "10:00|g.ticks": "3", "10:00|g.anchors": "9",
        "10:05|g.ticks": "0",
      },
    });
    expect(p.buckets.length).toBe(288);
    const i = p.buckets.indexOf(day + 10 * 3600000);
    expect(p.series["g.anchors"][i]).toBe(9);
    expect(p.series["g.anchors"][i + 1]).toBe(0); // covered, empty → honest zero
    expect(p.series["g.anchors"][i + 2]).toBeNull(); // never sampled → null
    expect(p.window).toBe("tile");
  });
});
