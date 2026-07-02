import { describe, it, expect } from "vitest";
import { relativeAge } from "./relativeAge";

describe("relativeAge", () => {
  it("formats seconds/minutes/hours coarsely", () => {
    expect(relativeAge(5_000)).toBe("5s ago");
    expect(relativeAge(90_000)).toBe("2m ago");     // rounds
    expect(relativeAge(3 * 3_600_000)).toBe("3h ago");
  });
  it("floors sub-second to 1s", () => {
    expect(relativeAge(200)).toBe("1s ago");
  });
  it("returns empty for NaN / negative (unparseable/future)", () => {
    expect(relativeAge(NaN)).toBe("");
    expect(relativeAge(-5)).toBe("");
  });
});
