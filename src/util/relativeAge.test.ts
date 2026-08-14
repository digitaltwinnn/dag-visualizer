import { describe, it, expect } from "vitest";
import { relativeAge } from "./relativeAge";

describe("relativeAge", () => {
  it("formats seconds/minutes/hours coarsely", () => {
    expect(relativeAge(5_000)).toBe("5s ago");
    expect(relativeAge(90_000)).toBe("2m ago");     // rounds
    expect(relativeAge(3 * 3_600_000)).toBe("3h ago");
  });
  it("scales to days, months and rounded years for history-mode rows", () => {
    expect(relativeAge(3 * 86_400_000)).toBe("3d ago");
    expect(relativeAge(90 * 86_400_000)).toBe("3mo ago");
    // ~2.75y — the anchor log's genesis-era rows; single rounded unit, the common convention
    expect(relativeAge(24_118 * 3_600_000)).toBe("3y ago");
  });
  it("floors sub-second to 1s", () => {
    expect(relativeAge(200)).toBe("1s ago");
  });
  it("returns empty for NaN / negative (unparseable/future)", () => {
    expect(relativeAge(NaN)).toBe("");
    expect(relativeAge(-5)).toBe("");
  });
});
