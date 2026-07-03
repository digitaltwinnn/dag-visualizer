import { describe, it, expect } from "vitest";
import { formatVital, formatVitalInt } from "./odometer";

describe("formatVital", () => {
  it("renders an em-dash for nullish", () => {
    expect(formatVital(null)).toBe("—");
    expect(formatVital(undefined)).toBe("—");
    expect(formatVital(NaN)).toBe("—");
  });
  it("keeps one decimal below 10", () => {
    expect(formatVital(9.42)).toBe("9.4");
    expect(formatVital(0)).toBe("0.0");
  });
  it("rounds and groups at/above 10", () => {
    expect(formatVital(10)).toBe("10");
    expect(formatVital(1203.7)).toBe("1,204");
  });
});

describe("formatVitalInt", () => {
  it("renders an em-dash for nullish", () => {
    expect(formatVitalInt(null)).toBe("—");
    expect(formatVitalInt(undefined)).toBe("—");
    expect(formatVitalInt(NaN)).toBe("—");
  });
  it("shows a whole count with no decimal (never '9.0')", () => {
    expect(formatVitalInt(9)).toBe("9");
    expect(formatVitalInt(0)).toBe("0");
  });
  it("rounds and groups", () => {
    expect(formatVitalInt(1203.7)).toBe("1,204");
  });
});
