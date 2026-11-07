import type { GlobalSnapshot } from "@/src/data/types";
import { relativeAge } from "@/src/util/relativeAge";

// THE SNAPSHOTS VIEW'S SPAN WORDS — one home (D3, 2026-11-07). The explorer's foot states the span
// its rows cover, and the register switch on the scene states each register's span on its own half
// ("Snapshots · last 11 min", "Blocks · last 13 hours"; with a pin, the pinned stretch — "5 h, 2d
// ago"). Two surfaces, one vocabulary: they were the explorer's private helpers until the switch
// needed the same words, and a second formatter would be two chances to say different things about
// the same window. Pure: the windows and the clock come in, the words go out.

/** "last 12 min" / "last 2 h" / "last 9 days" — the time the listed snapshots span, newest back to
 *  oldest (`ordered` NEWEST FIRST), or from `nowMs` back to the oldest: the live block window of a
 *  quiet network reaches back days, and its silence since its newest tick is part of the stretch it
 *  vouches for. "latest" when there is no stretch to state. */
export function spanWords(ordered: readonly GlobalSnapshot[], nowMs?: number): string {
  if (ordered.length < (nowMs != null ? 1 : 2)) return "latest";
  const ms = (nowMs ?? Date.parse(ordered[0]!.timestamp)) - Date.parse(ordered[ordered.length - 1]!.timestamp);
  if (!(ms > 0)) return "latest";
  const min = Math.max(1, Math.round(ms / 60_000));
  const h = Math.round(min / 60);
  return min < 90 ? `last ${min} min` : h < 48 ? `last ${h} h` : `last ${Math.round(h / 24)} days`;
}

/** A past window's own stretch (`snaps` OLDEST FIRST): how long it spans and how long ago it ended —
 *  "8 min, 1d ago", the card head's age register. A clock span would not fit the foot's room, and
 *  the card names the pinned snapshot's own time. Empty for no window. */
export function windowWords(snaps: readonly GlobalSnapshot[], nowMs: number = Date.now()): string {
  if (!snaps.length) return "";
  const end = Date.parse(snaps[snaps.length - 1]!.timestamp);
  return `${spanWords(snaps.slice().reverse()).replace("last ", "")}, ${relativeAge(nowMs - end)}`;
}

/** THE SNAPSHOTS REGISTER'S SPAN: a past window's read state while it is read or failed, its stretch
 *  once held (a window around an old pin makes no claim about now), else the live list's span. */
export function snapshotSpanWord(s: {
  pastStatus: "loading" | "ready" | "failed" | null;
  /** The held past window's globals, oldest first — null at the live edge. */
  past: readonly GlobalSnapshot[] | null;
  /** The live list, NEWEST FIRST. */
  live: readonly GlobalSnapshot[];
  nowMs?: number;
}): string {
  if (s.pastStatus === "loading") return "reading that time…";
  if (s.pastStatus === "failed") return "couldn't read that time";
  if (s.past) return windowWords(s.past, s.nowMs);
  return spanWords(s.live);
}

/** THE BLOCKS REGISTER'S SPAN: the block window's stretch — "last N h" at the live edge (measured to
 *  now: the silence since its newest block tick is part of it), a pinned window's own stretch — and,
 *  while a window is held, its read state ("reading that time…", or what failed). With no window
 *  held, the instrument state in a word or two, for the switch's half (rule 10): "not read" (the
 *  unlisted filter), "not reached" (deeper than the trail walks), "reading…", "read failed", or
 *  "no blocks" for a read that held none. */
export function blockSpanWord(s: {
  status: { around: number | null; status: "loading" | "ready" | "failed" | "beyond" | "unread" } | null;
  /** The held block window's globals, oldest first (empty with none held). */
  globals: readonly GlobalSnapshot[];
  nowMs: number;
}): string {
  const st = s.status?.status ?? null;
  const pinned = s.status?.around != null;
  const failed = pinned ? "couldn't read that time" : "read failed";
  if (s.globals.length) {
    if (st === "loading") return "reading that time…";
    if (st === "failed") return failed;
    return pinned ? windowWords(s.globals, s.nowMs) : spanWords([...s.globals].reverse(), s.nowMs);
  }
  if (st === "unread") return "not read";
  if (st === "beyond") return "not reached";
  if (st === "failed") return failed;
  if (st === "ready") return "no blocks";
  return "reading…";
}
