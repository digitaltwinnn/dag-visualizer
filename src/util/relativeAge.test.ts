import { describe, it, expect } from "vitest";
import { ageWords, relativeAge } from "./relativeAge";

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

describe("ageWords — the app's one long-form span", () => {
  const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
  // ⚠️ THE POINT IS THAT IT ESCALATES. A dormant chain is months or years old, and "315 days" is
  // the reading the user rejected — the tier table is what turns it into "10 months".
  it("escalates through the same tiers the archive census uses", () => {
    expect(ageWords(5 * MIN)).toBe("5 minutes");
    expect(ageWords(5 * HOUR)).toBe("5 hours");
    expect(ageWords(16 * DAY)).toBe("16 days");
    expect(ageWords(315 * DAY)).toBe("10 months");
    expect(ageWords(3 * 365 * DAY)).toBe("3 years");
  });

  it("says the unit in full and singularises it", () => {
    expect(ageWords(MIN)).toBe("1 minute");
    expect(ageWords(3 * HOUR)).toBe("3 hours");
    expect(ageWords(1.2 * DAY)).toBe("29 hours");
    expect(ageWords(400 * DAY)).toBe("13 months");
  });

  // Same guard as `relativeAge`: a bad clock states nothing rather than a negative age.
  it("refuses NaN and the future", () => {
    expect(ageWords(NaN)).toBe("");
    expect(ageWords(-1)).toBe("");
  });

  it("never rounds a real age down to zero", () => {
    expect(ageWords(10_000)).toBe("1 minute");
  });
});
