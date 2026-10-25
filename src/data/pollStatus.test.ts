import { describe, it, expect } from "vitest";
import { pollStatusOf, STALE_FACTOR, PULSE_WINDOW_MS, PULSE_AHEAD_MS, pulseOrder, pulseLane, pulseVerdict, type PollStatus } from "./pollStatus";
import type { PollHealth } from "./api";

const row = (p: Partial<PollHealth>): PollHealth => ({
  id: "global", label: "Global snapshots", everyMs: 4000,
  when: null, tempoMs: 4000, lastOkAt: null, lastErrAt: null, ok: 0, err: 0, beats: [], ...p,
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

describe("pulseOrder (fastest first)", () => {
  it("sorts by tempo, once-per-visit last, ties in registry order", () => {
    const rows = [row({ id: "geo", tempoMs: null }), row({ id: "dir", tempoMs: 300_000 }), row({ id: "a", tempoMs: 4000 }), row({ id: "b", tempoMs: 4000 })];
    expect(pulseOrder(rows).map((r) => r.id)).toEqual(["a", "b", "dir", "geo"]);
  });
});

describe("pulseLane (the axis geometry)", () => {
  const span = PULSE_WINDOW_MS + PULSE_AHEAD_MS;
  it("places beats on the window and drops the ones before it", () => {
    const r = row({ lastOkAt: NOW - 1000, ok: 2, beats: [{ at: NOW - PULSE_WINDOW_MS - 5, ok: true }, { at: NOW - 1000, ok: true }] });
    const l = pulseLane(r, NOW);
    expect(l.beats).toHaveLength(1);
    expect(l.beats[0]!.x).toBeCloseTo((PULSE_WINDOW_MS - 1000) / span, 6);
    expect(l.nowX).toBeCloseTo(PULSE_WINDOW_MS / span, 6);
  });
  it("draws the next due one cadence after the last attempt, inside the ahead room", () => {
    const l = pulseLane(row({ lastOkAt: NOW - 1000, ok: 1 }), NOW);
    expect(l.dueX).toBeCloseTo((PULSE_WINDOW_MS + 3000) / span, 6);
    expect(l.lateX).toBeNull();
  });
  it("an unscheduled feed has no due mark", () => {
    expect(pulseLane(row({ everyMs: null, lastOkAt: NOW - 1000, ok: 1 }), NOW).dueX).toBeNull();
  });
  it("a stale feed is late from its due mark to now", () => {
    const l = pulseLane(row({ lastOkAt: NOW - 40_000, ok: 1 }), NOW);
    expect(l.lateX).toBeCloseTo((PULSE_WINDOW_MS - 36_000) / span, 6);
  });
  it("a failing feed is late from its last good answer", () => {
    const l = pulseLane(row({ lastOkAt: NOW - 20_000, lastErrAt: NOW - 2000, ok: 3, err: 2 }), NOW);
    expect(l.lateX).toBeCloseTo((PULSE_WINDOW_MS - 20_000) / span, 6);
  });
});

describe("pulseVerdict (the strip's one sentence)", () => {
  const ok = (id: string) => row({ id, label: id, lastOkAt: NOW - 1000, ok: 1 });
  it("says Live when every feed answered on time", () => {
    expect(pulseVerdict([ok("a"), ok("b")], NOW)).toEqual({ tone: "ok", title: "Live", detail: "All 2 feeds answered on time." });
  });
  it("names the one failing feed, since when, and the rest", () => {
    const v = pulseVerdict([ok("a"), ok("b"), row({ id: "x", label: "Snapshot reads", lastOkAt: NOW - 20_000, lastErrAt: NOW - 1000, ok: 1, err: 1 })], NOW);
    expect(v.tone).toBe("bad");
    expect(v.title).toBe("Snapshot reads failing");
    expect(v.detail).toMatch(/^Last good answer .+ ago\. The other 2 feeds are live\.$/);
  });
  it("failing outranks late", () => {
    const v = pulseVerdict([row({ id: "s", label: "S", lastOkAt: NOW - 60_000, ok: 1 }), row({ id: "f", label: "F", lastErrAt: NOW - 1, err: 1 })], NOW);
    expect(v.title).toBe("F failing");
  });
  it("counts several late feeds rather than naming them", () => {
    const late = (id: string) => row({ id, label: id, lastOkAt: NOW - 60_000, ok: 1 });
    expect(pulseVerdict([late("a"), late("b")], NOW)).toMatchObject({ tone: "warn", title: "2 feeds late" });
  });
  it("never claims a connecting feed live", () => {
    expect(pulseVerdict([], NOW).tone).toBe("acquiring");
    expect(pulseVerdict([row({})], NOW).tone).toBe("acquiring");
    expect(pulseVerdict([ok("a"), row({ id: "b" })], NOW).detail).toBe("1 feed answered on time. 1 still connecting.");
  });
});
