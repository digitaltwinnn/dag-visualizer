import { describe, it, expect } from "vitest";
import { fmtScore } from "./format";

describe("fmtScore", () => {
  it("renders a 0–1 score to two decimals", () => {
    expect(fmtScore(0.7234)).toBe("0.72");
    expect(fmtScore(1)).toBe("1.00");
    expect(fmtScore(0)).toBe("0.00");
  });
  it("shows an em dash for null", () => {
    expect(fmtScore(null)).toBe("—");
  });
});
