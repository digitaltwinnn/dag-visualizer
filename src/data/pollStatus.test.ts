import { describe, it, expect } from "vitest";
import { pollStatusOf, STALE_FACTOR, type PollStatus } from "./pollStatus";
import type { PollHealth } from "./api";

const row = (p: Partial<PollHealth>): PollHealth => ({
  id: "global", label: "Global snapshots", target: "block explorer", everyMs: 4000,
  lastOkAt: null, lastErrAt: null, ok: 0, err: 0, ...p,
});
const NOW = 1_000_000;

describe("pollStatusOf", () => {
  it("acquiring before any outcome", () => {
    expect(pollStatusOf(row({}), NOW)).toBe("acquiring");
  });
  it("ok within the grace window", () => {
    expect(pollStatusOf(row({ lastOkAt: NOW - 4000, ok: 1 }), NOW)).toBe("ok");
  });
  it("stale only past STALE_FACTOR × its own cadence — the grace absorbs tick jitter", () => {
    const justInside = row({ lastOkAt: NOW - 4000 * STALE_FACTOR + 1, ok: 1 });
    const past = row({ lastOkAt: NOW - 4000 * STALE_FACTOR - 1, ok: 1 });
    expect(pollStatusOf(justInside, NOW)).toBe("ok");
    expect(pollStatusOf(past, NOW)).toBe("stale");
  });
  it("an on-demand feed (everyMs null) never goes stale", () => {
    expect(pollStatusOf(row({ everyMs: null, lastOkAt: NOW - 3_600_000, ok: 1 }), NOW)).toBe("ok");
  });
  it("failing when the LAST outcome errored — an older success doesn't outrank fresh failure", () => {
    expect(pollStatusOf(row({ lastOkAt: NOW - 10_000, lastErrAt: NOW - 1000, ok: 5, err: 1 }), NOW)).toBe("failing");
  });
  it("a success after an error clears failing", () => {
    const r = row({ lastErrAt: NOW - 10_000, lastOkAt: NOW - 1000, ok: 6, err: 1 });
    expect(pollStatusOf(r, NOW)).toBe<PollStatus>("ok");
  });
  it("an error with no success ever is failing, not acquiring", () => {
    expect(pollStatusOf(row({ lastErrAt: NOW - 1000, err: 1 }), NOW)).toBe("failing");
  });
});
