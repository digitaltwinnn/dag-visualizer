import type { NotableKind, NoteDay } from "@/src/data/noteTypes";

// A NOTABLE DAY, MET ELSEWHERE (user, 2026-10-30: "if the moment is a notable day, either navigated
// by a click on the row in the AI card or any other means, can we show the marker on the cards as
// well?"). The note's days are the AI card's rows and the timeline's diamonds; these two lookups
// let the Moment card say its bucket falls on one and the Range card say its span IS one, and the
// chart planes draw them (`TrendChart marks`). Pure, over the note's own days; the kind's word is
// the one home for the row's screen-reader text and the chip.

const DAY_MS = 86_400_000;

/** The kind's word, short enough for a chip and plain enough to read aloud. */
export const NOTE_KIND_WORD: Record<NotableKind, string> = {
  high: "spike",
  peak: "busiest day",
  low: "dip",
  trough: "quietest day",
  first: "first day",
  last: "last day",
  pause: "pause",
  longest: "longest wait",
  broadest: "most networks",
};

/** The range a notable day commits: its whole UTC day. */
export const notableDaySpan = (dayMs: number): { fromMs: number; toMs: number } => ({ fromMs: dayMs, toMs: dayMs + DAY_MS });

/** The notable day whose UTC day holds `ms`, the first listed when two fall on one day. */
export function notableDayAt(days: readonly NoteDay[] | null | undefined, ms: number | null | undefined): NoteDay | null {
  if (!days || ms == null) return null;
  const dayMs = Math.floor(ms / DAY_MS) * DAY_MS;
  return days.find((d) => d.dayMs === dayMs) ?? null;
}

/** The notable day a range IS — exactly that UTC day, as a day row commits it — else null. */
export function notableDayOfRange(days: readonly NoteDay[] | null | undefined, range: { fromMs: number; toMs: number } | null | undefined): NoteDay | null {
  if (!days || !range || range.toMs - range.fromMs !== DAY_MS) return null;
  return days.find((d) => d.dayMs === range.fromMs) ?? null;
}
