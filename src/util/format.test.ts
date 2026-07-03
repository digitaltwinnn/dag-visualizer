import { describe, it, expect } from "vitest";
import { fmtScore } from "./format";

describe("fmtScore", () => {
  it("renders a 1–100 score as an integer percentage", () => {
    expect(fmtScore(100)).toBe("100%");
    expect(fmtScore(7)).toBe("7%");
    expect(fmtScore(42.6)).toBe("43%");
  });
  it("shows an em dash for no data (0 or null)", () => {
    expect(fmtScore(0)).toBe("—");
    expect(fmtScore(null)).toBe("—");
  });
});
