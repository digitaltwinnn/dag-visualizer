import { describe, expect, it } from "vitest";
import { blockSpanWord, snapshotSpanWord, spanWords, windowWords } from "@/src/data/ledgerSpan";
import type { GlobalSnapshot } from "@/src/data/types";

const at = (ms: number, ordinal = ms) => ({ ordinal, timestamp: new Date(ms).toISOString(), hash: "h" }) as GlobalSnapshot;
const MIN = 60_000;
const H = 60 * MIN;
const NOW = Date.parse("2026-11-07T12:00:00Z");

describe("spanWords — the span a list covers", () => {
  it("newest back to oldest, in minutes, hours or days", () => {
    expect(spanWords([at(NOW), at(NOW - 11 * MIN)])).toBe("last 11 min");
    expect(spanWords([at(NOW), at(NOW - 13 * H)])).toBe("last 13 h");
    expect(spanWords([at(NOW), at(NOW - 72 * H)])).toBe("last 3 days");
  });
  it("from now back to the oldest when given the clock (a live window's silence is part of it)", () => {
    expect(spanWords([at(NOW - 2 * H)], NOW)).toBe("last 2 h");
  });
  it("no stretch to state is 'latest'", () => {
    expect(spanWords([at(NOW)])).toBe("latest");
    expect(spanWords([])).toBe("latest");
  });
});

describe("windowWords — a past window's own stretch", () => {
  it("how long it spans, and how long ago it ended", () => {
    expect(windowWords([at(NOW - 2 * 24 * H - 5 * H), at(NOW - 2 * 24 * H)], NOW)).toBe("5 h, 2d ago");
    expect(windowWords([], NOW)).toBe("");
  });
});

describe("the register switch's two halves", () => {
  it("Snapshots: the live list's span, a past window's stretch, or its read state", () => {
    const live = [at(NOW), at(NOW - 11 * MIN)];
    expect(snapshotSpanWord({ pastStatus: null, past: null, live })).toBe("last 11 min");
    expect(snapshotSpanWord({ pastStatus: "ready", past: [at(NOW - 25 * H - 8 * MIN), at(NOW - 25 * H)], live, nowMs: NOW })).toBe("8 min, 1d ago");
    expect(snapshotSpanWord({ pastStatus: "loading", past: null, live })).toBe("reading that time…");
    expect(snapshotSpanWord({ pastStatus: "failed", past: null, live })).toBe("couldn't read that time");
  });
  it("Blocks: the live window measured to now, a pinned window's stretch, or the instrument state", () => {
    const globals = [at(NOW - 13 * H), at(NOW - 20 * MIN)];
    expect(blockSpanWord({ status: { around: null, status: "ready" }, globals, nowMs: NOW })).toBe("last 13 h");
    expect(blockSpanWord({ status: { around: 5, status: "ready" }, globals, nowMs: NOW })).toBe("13 h, 20m ago");
    expect(blockSpanWord({ status: { around: 5, status: "loading" }, globals, nowMs: NOW })).toBe("reading that time…");
    expect(blockSpanWord({ status: { around: null, status: "failed" }, globals, nowMs: NOW })).toBe("read failed");
    expect(blockSpanWord({ status: { around: null, status: "unread" }, globals: [], nowMs: NOW })).toBe("not read");
    expect(blockSpanWord({ status: { around: 5, status: "beyond" }, globals: [], nowMs: NOW })).toBe("not reached");
    expect(blockSpanWord({ status: { around: 5, status: "failed" }, globals: [], nowMs: NOW })).toBe("couldn't read that time");
    expect(blockSpanWord({ status: { around: null, status: "ready" }, globals: [], nowMs: NOW })).toBe("no blocks");
    expect(blockSpanWord({ status: null, globals: [], nowMs: NOW })).toBe("reading…");
  });
});
