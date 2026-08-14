import { describe, it, expect } from "vitest";
import { relativeAge } from "./relativeAge";

describe("relativeAge", () => {
  it("formats seconds/minutes/hours coarsely", () => {
    expect(relativeAge(5_000)).toBe("5s ago");
    expect(relativeAge(90_000)).toBe("2m ago");     // rounds
    expect(relativeAge(3 * 3_600_000)).toBe("3h ago");
  });
  it("scales to days and decimal years for history-mode rows", () => {
    expect(relativeAge(3 * 86_400_000)).toBe("3d ago");
    // ~2.75y — the anchor log's genesis-era rows; "24118h ago" was the bug this tier fixes
    expect(relativeAge(24_118 * 3_600_000)).toBe("2.8y ago");
  });
  it("floors sub-second to 1s", () => {
    expect(relativeAge(200)).toBe("1s ago");
  });
  it("returns empty for NaN / negative (unparseable/future)", () => {
    expect(relativeAge(NaN)).toBe("");
    expect(relativeAge(-5)).toBe("");
  });
});
