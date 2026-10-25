import { describe, it, expect } from "vitest";
import { dataTime } from "./liveAge";

describe("dataTime", () => {
  it("subtracts the edge Age (seconds) and the memo age", () => {
    expect(dataTime(10_000, "3", 500)).toBe(6_500);
  });
  it("counts a missing, non-numeric or non-finite age as 0", () => {
    expect(dataTime(10_000, null, 0)).toBe(10_000);
    expect(dataTime(10_000, "x", undefined)).toBe(10_000);
    expect(dataTime(10_000, null, Number.NaN)).toBe(10_000);
  });
  it("is never later than receivedAt", () => {
    expect(dataTime(10_000, "-2", 0)).toBe(10_000);
    expect(dataTime(10_000, null, -400)).toBe(10_000);
  });
});
