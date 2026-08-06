import { describe, it, expect } from "vitest";
import { classifyActivity, activityLine } from "./currencyActivity";

const NOW = Date.parse("2026-08-04T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = 86400000;

describe("classifyActivity", () => {
  it("separates a live token from a dormant one from no token at all", () => {
    expect(classifyActivity(ago(3600_000), NOW)).toBe("active");
    expect(classifyActivity(ago(6 * DAY), NOW)).toBe("active");
    expect(classifyActivity(ago(40 * DAY), NOW)).toBe("dormant");
    expect(classifyActivity(null, NOW)).toBe("none");
  });
});

describe("activityLine", () => {
  it("states the absolute age, never a window-relative one", () => {
    expect(activityLine({ metaId: "m", state: "dormant", lastTs: ago(330 * DAY) }, "PACA", NOW))
      .toBe("PACA · DORMANT 11 MONTHS");
    expect(activityLine({ metaId: "m", state: "active", lastTs: ago(2 * 3600_000) }, "DOR", NOW))
      .toBe("DOR · ACTIVE 2 HOURS AGO");
    expect(activityLine({ metaId: "m", state: "none", lastTs: null }, "DED", NOW))
      .toBe("DED · NO CURRENCY");
  });

  it("says so honestly while the read is missing", () => {
    expect(activityLine(null, "SWAP", NOW)).toBe("SWAP · NO SIGNAL");
  });
});
