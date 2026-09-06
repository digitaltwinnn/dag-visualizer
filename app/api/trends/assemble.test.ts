import { describe, it, expect } from "vitest";
import { assemble, WINDOWS } from "./assemble";

describe("assemble", () => {
  const now = Date.UTC(2026, 8, 6, 14, 12);
  it("pins the window→tier contract", () => {
    expect(WINDOWS["24h"].tier).toBe("5m");
    expect(WINDOWS["7d"].tier).toBe("1h");
    expect(WINDOWS["30d"].tier).toBe("1h");
    expect(WINDOWS["1y"].tier).toBe("1d");
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
