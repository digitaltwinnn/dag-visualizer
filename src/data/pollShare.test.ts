import { describe, it, expect } from "vitest";
import { neverConnected } from "./pollShare";

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
