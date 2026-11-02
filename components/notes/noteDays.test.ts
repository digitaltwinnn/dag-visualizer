import { describe, expect, it } from "vitest";
import type { NoteDay } from "@/src/data/noteTypes";
import { NOTE_KIND_WORD, daysByDate, notableDayAt, notableDayOfRange, notableDaySpan } from "./noteDays";

// A NOTABLE DAY, MET ELSEWHERE (user, 2026-10-30: "if the moment is a notable day … can we show the
// marker on the cards as well?"): the Moment card asks which notable day its bucket falls in, the
// Range card whether its span IS one notable day. Pure, over the note's own days.
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 20);
const day = (dayMs: number, kind: NoteDay["kind"], networkId: string | null = null): NoteDay => ({ dayMs, kind, networkId, caption: "c" });
const days = [day(T0, "last", "paca"), day(T0 + 2 * DAY, "peak"), day(T0 + 2 * DAY, "first", "bio")];

describe("notableDayAt", () => {
  it("answers the notable day whose UTC day holds the instant, the first of two on one day", () => {
    expect(notableDayAt(days, T0 + 5 * 3_600_000)).toBe(days[0]);
    expect(notableDayAt(days, T0 + 2 * DAY + 23 * 3_600_000)).toBe(days[1]);
  });
  it("answers null off every notable day, with no instant, or with no days", () => {
    expect(notableDayAt(days, T0 + DAY)).toBeNull();
    expect(notableDayAt(days, null)).toBeNull();
    expect(notableDayAt(null, T0)).toBeNull();
  });
});

describe("notableDayOfRange", () => {
  it("answers the day when the range is exactly that UTC day, as a day row commits it", () => {
    expect(notableDayOfRange(days, { fromMs: T0, toMs: T0 + DAY })).toBe(days[0]);
  });
  it("answers null for a longer span, a span inside the day, or no range", () => {
    expect(notableDayOfRange(days, { fromMs: T0, toMs: T0 + 2 * DAY })).toBeNull();
    expect(notableDayOfRange(days, { fromMs: T0 + 3_600_000, toMs: T0 + DAY })).toBeNull();
    expect(notableDayOfRange(days, null)).toBeNull();
  });
});

describe("notableDaySpan", () => {
  it("is the day's whole UTC span, the range a click commits", () => {
    expect(notableDaySpan(T0)).toEqual({ fromMs: T0, toMs: T0 + DAY });
    expect(notableDayOfRange(days, notableDaySpan(T0))).toBe(days[0]);
  });
});

describe("NOTE_KIND_WORD", () => {
  it("has a short word for every kind, none saying make-up", () => {
    expect(Object.keys(NOTE_KIND_WORD).sort()).toEqual(["broadest", "first", "high", "last", "longest", "low", "pause", "peak", "trough"]);
    for (const w of Object.values(NOTE_KIND_WORD)) expect(w).toMatch(/^[a-z ]{3,14}$/);
  });
});

describe("daysByDate", () => {
  const day = (dayMs: number, kind: NoteDay["kind"] = "high"): NoteDay => ({ dayMs, kind, networkId: null, caption: "" });

  it("reads oldest first, as the chart does left to right", () => {
    expect(daysByDate([day(30), day(10), day(20)]).map((d) => d.dayMs)).toEqual([10, 20, 30]);
  });

  it("keeps two on one day in the order they came", () => {
    expect(daysByDate([day(10, "last"), day(10, "low")]).map((d) => d.kind)).toEqual(["last", "low"]);
  });

  it("leaves the note's own list alone", () => {
    const days = [day(30), day(10)];
    daysByDate(days);
    expect(days.map((d) => d.dayMs)).toEqual([30, 10]);
  });
});

