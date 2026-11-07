import { describe, expect, it } from "vitest";
import { BLOCKS_UNREAD, blockAbsence, blockSpanWord, countWord, snapshotSpanWord, spanWords, windowWords } from "@/src/data/ledgerSpan";
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
    // A LIVE read over a held window (a filter's refetch) has no "time" (N5).
    expect(blockSpanWord({ status: { around: null, status: "loading" }, globals, nowMs: NOW })).toBe("reading…");
    expect(blockSpanWord({ status: { around: null, status: "failed" }, globals, nowMs: NOW })).toBe("read failed");
    expect(blockSpanWord({ status: { around: null, status: "unread" }, globals: [], nowMs: NOW })).toBe("not read");
    expect(blockSpanWord({ status: { around: 5, status: "beyond" }, globals: [], nowMs: NOW })).toBe("not reached");
    expect(blockSpanWord({ status: { around: 5, status: "failed" }, globals: [], nowMs: NOW })).toBe("couldn't read that time");
    expect(blockSpanWord({ status: { around: null, status: "ready" }, globals: [], nowMs: NOW })).toBe("no blocks");
    expect(blockSpanWord({ status: null, globals: [], nowMs: NOW })).toBe("reading…");
  });
});

describe("the phone's short form (D6 carry: the switch with a pinned stretch ran past the gutters)", () => {
  const live = [at(NOW), at(NOW - 11 * MIN)];
  const past = [at(NOW - 25 * H - 8 * MIN), at(NOW - 25 * H)];
  it("a pinned stretch says WHEN alone, a read state one word; a live span is unchanged", () => {
    expect(windowWords(past, NOW, true)).toBe("1d ago");
    expect(snapshotSpanWord({ pastStatus: "ready", past, live, nowMs: NOW, short: true })).toBe("1d ago");
    expect(snapshotSpanWord({ pastStatus: "loading", past: null, live, short: true })).toBe("reading…");
    expect(snapshotSpanWord({ pastStatus: "failed", past: null, live, short: true })).toBe("read failed");
    expect(snapshotSpanWord({ pastStatus: null, past: null, live, short: true })).toBe("last 11 min");
    const globals = [at(NOW - 13 * H), at(NOW - 20 * MIN)];
    expect(blockSpanWord({ status: { around: 5, status: "ready" }, globals, nowMs: NOW, short: true })).toBe("20m ago");
    expect(blockSpanWord({ status: { around: 5, status: "loading" }, globals, nowMs: NOW, short: true })).toBe("reading…");
    expect(blockSpanWord({ status: { around: 5, status: "failed" }, globals: [], nowMs: NOW, short: true })).toBe("read failed");
    expect(blockSpanWord({ status: { around: null, status: "ready" }, globals, nowMs: NOW, short: true })).toBe("last 13 h");
  });
  it("whether a block stretch is pinned is the HELD window's own provenance when given (review M1)", () => {
    const globals = [at(NOW - 13 * H), at(NOW - 20 * MIN)];
    // A resume: the request says live, the window held is still the pin's.
    expect(blockSpanWord({ status: { around: null, status: "ready" }, globals, nowMs: NOW, around: 5 })).toBe("13 h, 20m ago");
    expect(blockSpanWord({ status: { around: 5, status: "ready" }, globals, nowMs: NOW, around: null })).toBe("last 13 h");
  });
});

describe("blockAbsence — the block window isn't here: one sentence per state, every surface (P3)", () => {
  it("names each instrument state once", () => {
    expect(blockAbsence({ around: null, status: "unread" }, false)).toBe(BLOCKS_UNREAD);
    expect(BLOCKS_UNREAD).toBe("Unlisted networks' blocks are not read");
    expect(blockAbsence({ around: 5, status: "beyond" }, false)).toBe("Blocks this far back are not reached");
    expect(blockAbsence({ around: null, status: "failed" }, false)).toBe("The block window could not be read");
    expect(blockAbsence({ around: 5, status: "failed" }, true)).toBe("The blocks at that time could not be read");
    expect(blockAbsence({ around: null, status: "loading" }, true)).toBe("Reading the blocks…");
    expect(blockAbsence(null, false)).toBe("Reading the blocks…");
    // A held window that holds no block says so — never "reading" once it has landed.
    expect(blockAbsence({ around: null, status: "ready" }, true)).toBe("No blocks in this stretch");
    // Nothing held yet reads as reading, whatever the request last said.
    expect(blockAbsence({ around: null, status: "ready" }, false)).toBe("Reading the blocks…");
  });
  it("speaks in plain words — no tick, no cache", () => {
    const states = ["unread", "beyond", "failed", "loading", "ready"] as const;
    for (const st of states) for (const around of [null, 5]) for (const held of [false, true]) {
      expect(blockAbsence({ around, status: st }, held)).not.toMatch(/tick|cache/i);
    }
  });
});

describe("countWord — the switch's count beside a span", () => {
  it("pluralises, and says nothing for none or while a span is a read state", () => {
    expect(countWord(52, "snapshot")).toBe("52 snapshots");
    expect(countWord(1, "block")).toBe("1 block");
    expect(countWord(1234, "block")).toBe("1,234 blocks");
    expect(countWord(0, "block")).toBeNull();
    expect(countWord(null, "snapshot")).toBeNull();
  });
});
