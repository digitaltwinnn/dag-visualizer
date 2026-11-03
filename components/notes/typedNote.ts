import type { NoteResponse } from "@/src/data/noteTypes";

// THE NOTE WRITES ITSELF IN (user, 2026-10-31: "when it finished loading, can you make the text appear
// letter by letter as if it's written by the AI?"). How fast, as pure arithmetic: a steady hand for a
// short note, and a ceiling so a long one never holds the reader up.

/** One letter's time, for a note short enough to take it. */
const MS_PER_CHAR = 16;
/** The longest a note takes to write itself in. */
export const MAX_TYPE_MS = 2400;

/** How long a text of `total` characters takes; `slow` stretches the whole clock, its ceiling
 *  included (the Briefing's words, `BRIEFING_TYPE_SLOW`). */
export const typeDuration = (total: number, slow = 1): number => Math.min(total * MS_PER_CHAR, MAX_TYPE_MS) * slow;

/** How many characters stand after `elapsedMs`. */
export function typedLength(elapsedMs: number, total: number, slow = 1): number {
  const d = typeDuration(total, slow);
  return d === 0 ? total : Math.min(total, Math.floor((elapsedMs / d) * total));
}

export interface WaitState {
  /** Whether the note on hand is one the reader watched arrive. */
  waited: boolean;
  /** The note last seen, so a different one with no wait between stands rather than types. */
  text: string | null;
}

/** One render's step: a wait arms the typing, a note keeps it, a different note with no wait between
 *  (a held one, stepped back to) drops it, and a failure ends it. */
export function nextWait(s: WaitState, res: NoteResponse | null): WaitState {
  if (res == null || res.state === "pending" || res.state === "request") return { waited: true, text: null };
  if (res.state !== "ok") return { waited: false, text: null };
  return { waited: s.waited && (s.text == null || s.text === res.text), text: res.text };
}
