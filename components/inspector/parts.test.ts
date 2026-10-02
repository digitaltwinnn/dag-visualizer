import { describe, it, expect } from "vitest";
import { shareWords, countable } from "./parts";

// The lead sentences state a share in words, so rounding must never make them false.
describe("shareWords", () => {
  it("rounds an ordinary share", () => {
    expect(shareWords(15, 18)).toBe("83%");
    expect(shareWords(18, 18)).toBe("100%");
  });
  it("never says 0% for a part that exists, nor 100% for one that is not the whole", () => {
    expect(shareWords(1, 300)).toBe("under 1%");
    expect(shareWords(299, 300)).toBe("over 99%");
    expect(shareWords(0, 300)).toBe("0%");
  });
  it("says nothing when there is no whole", () => {
    expect(shareWords(0, 0)).toBeNull();
  });
});

describe("countable", () => {
  it("draws squares up to 60 and bars above", () => {
    expect(countable(60)).toBe(true);
    expect(countable(61)).toBe(false);
  });
});
