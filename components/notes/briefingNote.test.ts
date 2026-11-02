import { describe, expect, it } from "vitest";
import type { NoteResponse } from "@/src/data/noteTypes";
import { BRIEFING_STOPS, LINE_MAX } from "@/src/engine/domain/briefing";
import { briefingReq, briefingWords, openingOf } from "./briefingNote";

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

  it("fall back to the note's opening", () => {
    expect(briefingWords("geo", ok("A long note. With more."))).toEqual({ text: "A long note. With more.", ai: true });
  });

  it("are plain, without the AI's mark, when the note's opening overruns the caption", () => {
    const w = briefingWords("hyper", ok(`${"And this sentence goes on at length ".repeat(6)}until it ends.`));
    expect(w.ai).toBe(false);
    expect(w.text.length).toBeLessThanOrEqual(LINE_MAX);
  });

  it("are plain, without the AI's mark, when there is no note", () => {
    for (const res of [null, { state: "pending" }, { state: "none" }, { state: "unavailable" }] as NoteResponse[]) {
      const w = briefingWords("hyper", res);
      expect(w.ai).toBe(false);
      expect(w.text).not.toMatch(/\d/);
    }
  });
});

describe("a note's opening", () => {
  const short = "Located nodes fell 9% from 91 to 83.";

  it("does not stop inside a figure", () => {
    expect(openingOf("Each snapshot held 5.8 anchors. More.")).toBe("Each snapshot held 5.8 anchors. More.");
  });

  it("takes a note of one sentence whole", () => {
    expect(openingOf("No full stop here")).toBe("No full stop here");
  });

  it("takes the second sentence when both fit the caption", () => {
    expect(openingOf(`${short} United States dropped 9% from 34 to 31. Finland held.`)).toBe(`${short} United States dropped 9% from 34 to 31. Finland held.`);
  });

  it("stops before a sentence that would overrun it", () => {
    const long = `${"And this sentence goes on at length ".repeat(5)}until it ends.`;
    expect(openingOf(`${short} ${long}`)).toBe(short);
  });

  it("has no opening when even the first sentence overruns the caption", () => {
    expect(openingOf(`${"And this sentence goes on at length ".repeat(6)}until it ends.`)).toBeNull();
  });
});
