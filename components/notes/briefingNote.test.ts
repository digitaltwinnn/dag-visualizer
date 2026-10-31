import { describe, expect, it } from "vitest";
import type { NoteResponse } from "@/src/data/noteTypes";
import { BRIEFING_STOPS } from "@/src/engine/domain/briefing";
import { briefingReq, briefingWords, firstSentence } from "./briefingNote";

const ok = (text: string, line?: string): NoteResponse => ({ state: "ok", text, writtenAt: 1, spanFrom: 0, spanTo: 1, days: [], ...(line ? { line } : {}) });

describe("the note a stop reads", () => {
  it("is the same note a visitor with no filter gets", () => {
    expect(briefingReq("geo")).toEqual({ view: "geo", subject: "all", span: null });
    expect(briefingReq("ledger")).toEqual({ view: "ledger", subject: "all", span: null });
    expect(briefingReq("hyper")).toEqual({ view: "hyper", subject: "all", span: null });
    expect(briefingReq("trend")).toEqual({ view: "trend", subject: "dag", span: "30d" });
  });

  it("exists for every stop", () => {
    for (const stop of BRIEFING_STOPS) expect(briefingReq(stop).view).toBe(stop);
  });
});

describe("the words at a stop", () => {
  it("are the model's line when it wrote one", () => {
    expect(briefingWords("geo", ok("A long note. With more.", "A line."))).toEqual({ text: "A line.", ai: true });
  });

  it("fall back to the note's first sentence", () => {
    expect(briefingWords("geo", ok("A long note. With more."))).toEqual({ text: "A long note.", ai: true });
  });

  it("are plain, without the AI's mark, when there is no note", () => {
    for (const res of [null, { state: "pending" }, { state: "none" }, { state: "unavailable" }] as NoteResponse[]) {
      const w = briefingWords("hyper", res);
      expect(w.ai).toBe(false);
      expect(w.text).not.toMatch(/\d/);
    }
  });
});

describe("a note's first sentence", () => {
  it("does not stop inside a figure", () => {
    expect(firstSentence("Each snapshot held 5.8 anchors. More.")).toBe("Each snapshot held 5.8 anchors.");
  });

  it("takes a note of one sentence whole", () => {
    expect(firstSentence("No full stop here")).toBe("No full stop here");
  });
});
