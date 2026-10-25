import { describe, expect, it } from "vitest";
import type { RawMetaSnapshot } from "@/src/data/types";
import { isQuiet, quietSetFor, QUIET_REBUILD_MS } from "./quiet";

const DAY = 86_400_000;
const now = Date.parse("2026-10-25T00:00:00Z");
const snap = (daysAgo: number) => [{ timestamp: new Date(now - daysAgo * DAY).toISOString() } as RawMetaSnapshot];

describe("isQuiet", () => {
  it("is true for an empty list", () => expect(isQuiet([], now)).toBe(true));
  it("is true when the newest is 8 days old", () => expect(isQuiet(snap(8), now)).toBe(true));
  it("is true at exactly the threshold", () => expect(isQuiet(snap(7), now)).toBe(true));
  it("is false when the newest is 6 days old", () => expect(isQuiet(snap(6), now)).toBe(false));
});

describe("quietSetFor", () => {
  it("keeps a network's set until the hour is up, then rebuilds it empty", () => {
    const a = quietSetFor("t-net", now);
    a.add("X");
    expect(quietSetFor("t-net", now + QUIET_REBUILD_MS - 1).has("X")).toBe(true);
    expect(quietSetFor("t-net", now + QUIET_REBUILD_MS).has("X")).toBe(false);
  });
  it("is per network", () => {
    quietSetFor("n1", now).add("Y");
    expect(quietSetFor("n2", now).has("Y")).toBe(false);
  });
});
