import { describe, it, expect } from "vitest";
import { neverConnected, okShare } from "./pollShare";

describe("okShare", () => {
  it("states the share that succeeded", () => {
    expect(okShare(237, 2)).toBe("99.1%");
    expect(okShare(90, 10)).toBe("90%");
    expect(okShare(1, 2)).toBe("33%");
    expect(okShare(0, 5)).toBe("0%");
  });

  it("never says 100% while anything failed", () => {
    expect(okShare(1999, 1)).toBe("99.9%");
    expect(okShare(1_000_000, 1)).toBe("99.9%");
  });

  it("is 100% only with no failures, and a dash with no polls at all", () => {
    expect(okShare(12, 0)).toBe("100%");
    expect(okShare(0, 0)).toBe("—");
  });
});

describe("neverConnected", () => {
  it("is true only when the global feed has failed and never succeeded", () => {
    expect(neverConnected([{ id: "global", ok: 0, err: 3 }])).toBe(true);
    expect(neverConnected([{ id: "clusters", ok: 0, err: 3 }, { id: "global", ok: 0, err: 1 }])).toBe(true);
  });

  it("is false before the first poll returns — a boot is not an outage", () => {
    expect(neverConnected([])).toBe(false);
    expect(neverConnected([{ id: "global", ok: 0, err: 0 }])).toBe(false);
    expect(neverConnected([{ id: "clusters", ok: 0, err: 9 }])).toBe(false);
  });

  it("is false for good after one success — a later drop keeps its last readings", () => {
    expect(neverConnected([{ id: "global", ok: 1, err: 400 }])).toBe(false);
  });
});
