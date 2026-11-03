import { describe, it, expect } from "vitest";
import { MAX_TYPE_MS, nextWait, typedLength, typeDuration, type WaitState } from "./typedNote";
import type { NoteResponse } from "@/src/data/noteTypes";

// THE NOTE WRITES ITSELF IN (user, 2026-10-31: "when it finished loading, can you make the text appear
// letter by letter as if it's written by the AI?"). A steady hand for a short note, and a ceiling,
// so a long one never holds the reader up.
describe("typedLength", () => {
  it("starts at nothing and ends on the whole text", () => {
    expect(typedLength(0, 100)).toBe(0);
    expect(typedLength(typeDuration(100), 100)).toBe(100);
    expect(typedLength(1e9, 100)).toBe(100);
  });
  it("grows steadily in between", () => {
    const d = typeDuration(100);
    expect(typedLength(d / 2, 100)).toBe(50);
  });
  it("never runs past the ceiling, however long the note", () => {
    expect(typeDuration(100_000)).toBe(MAX_TYPE_MS);
    expect(typedLength(MAX_TYPE_MS, 100_000)).toBe(100_000);
  });
  it("an empty text is finished at once", () => {
    expect(typedLength(0, 0)).toBe(0);
    expect(typeDuration(0)).toBe(0);
  });
});

// ONLY A NOTE THE READER WATCHED ARRIVE IS TYPED: stepping back to a held one must simply stand.
describe("nextWait", () => {
  const ok = (text: string) => ({ state: "ok", text, writtenAt: 0, spanFrom: 0, spanTo: 0, days: [] }) as NoteResponse;
  const run = (...steps: (NoteResponse | null)[]): WaitState => steps.reduce<WaitState>(nextWait, { waited: false, text: null });
  it("a note that lands after a wait is typed", () => {
    expect(run(null, ok("A")).waited).toBe(true);
    expect(run({ state: "pending" }, ok("A")).waited).toBe(true);
    expect(run({ state: "request" }, ok("A")).waited).toBe(true);
  });
  it("a note already held on first sight is not", () => {
    expect(run(ok("A")).waited).toBe(false);
  });
  it("re-rendering the same note keeps its answer", () => {
    expect(run(null, ok("A"), ok("A")).waited).toBe(true);
  });
  it("a different note with no wait between is not typed", () => {
    expect(run(null, ok("A"), ok("B")).waited).toBe(false);
  });
  it("a new wait types again", () => {
    expect(run(null, ok("A"), null, ok("B")).waited).toBe(true);
  });
  it("a failure ends the wait", () => {
    expect(run(null, { state: "unavailable" }, ok("A")).waited).toBe(false);
  });
});

describe("a slower clock", () => {
  it("stretches the whole run, its ceiling included", () => {
    expect(typeDuration(100, 1.15)).toBeCloseTo(typeDuration(100) * 1.15);
    expect(typeDuration(100_000, 1.15)).toBeCloseTo(MAX_TYPE_MS * 1.15);
    expect(typedLength(typeDuration(100), 100, 1.15)).toBeLessThan(100);
    expect(typedLength(typeDuration(100, 1.15), 100, 1.15)).toBe(100);
  });
});
