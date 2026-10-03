import { describe, it, expect } from "vitest";
import { okShare } from "./pollShare";

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
