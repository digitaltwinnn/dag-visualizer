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
export function windowWords(snaps: readonly GlobalSnapshot[], nowMs: number = Date.now(), short = false): string {
  if (!snaps.length) return "";
  const end = Date.parse(snaps[snaps.length - 1]!.timestamp);
  if (short) return relativeAge(nowMs - end);
  return `${spanWords(snaps.slice().reverse()).replace("last ", "")}, ${relativeAge(nowMs - end)}`;
}

/** THE PHONE'S SHORT FORM (D6 carry, measured 2026-11-07): at 390px the switch with "Metagraph
 *  snapshots" lit and both snapshot halves on a pinned stretch ("9 min, 1d ago") ran 370px, past the
 *  16px gutters. So on the phone an UNLIT half states a pinned stretch by WHEN alone ("1d ago" — the
 *  lit half and the explorer's foot keep its length) and a read state in one word ("reading…", "read
 *  failed"); a live span is short already and is unchanged. One rule, both halves' words. */
export interface SpanOpts {
  short?: boolean;
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
} & SpanOpts): string {
  if (s.pastStatus === "loading") return s.short ? "reading…" : "reading that time…";
  if (s.pastStatus === "failed") return s.short ? "read failed" : "couldn't read that time";
  if (s.past) return windowWords(s.past, s.nowMs, s.short);
  return spanWords(s.live);
}

/** THE BLOCKS REGISTER'S SPAN: the block window's stretch — "last N h" at the live edge (measured to
 *  now: the silence since its newest block tick is part of it), a pinned window's own stretch — and,
 *  while a window is held, its read state ("reading that time…" around a pin, "reading…" for a live
 *  read such as a filter's refetch, or what failed). With no window
 *  held, the instrument state in a word or two, for the switch's half (rule 10): "not read" (the
 *  unlisted filter), "not reached" (deeper than the trail walks), "reading…", "read failed", or
 *  "no blocks" for a read that held none. */
export function blockSpanWord(s: {
  status: { around: number | null; status: "loading" | "ready" | "failed" | "beyond" | "unread" } | null;
  /** The held block window's globals, oldest first (empty with none held). */
  globals: readonly GlobalSnapshot[];
  nowMs: number;
  /** The HELD window's own `around` (review M1) — whether its stretch is a pinned one; the request's
   *  when not given. */
  around?: number | null;
} & SpanOpts): string {
  const st = s.status?.status ?? null;
  const asked = s.status?.around != null;
  const failed = s.short ? "read failed" : asked ? "couldn't read that time" : "read failed";
  if (s.globals.length) {
    const pinned = s.around !== undefined ? s.around != null : asked;
    // "that time" only for a read around a pin: a live read (a filter's refetch) has no time (N5).
    if (st === "loading") return s.short || !asked ? "reading…" : "reading that time…";
    if (st === "failed") return failed;
    return pinned ? windowWords(s.globals, s.nowMs, s.short) : spanWords([...s.globals].reverse(), s.nowMs);
  }
  if (st === "unread") return "not read";
  if (st === "beyond") return "not reached";
  if (st === "failed") return failed;
  if (st === "ready") return "no blocks";
  return "reading…";
}

/** THE SWITCH'S COUNT beside a half's span (user, 2026-11-07: "last 9 min | 52 snapshots, last 15 days
 *  | 53 blocks"): what fills the stretch — the source's ticks for the two snapshot registers (the live
 *  buffer's depth, or a past window's), the window's blocks for Transaction blocks. Null for nothing
 *  to count, or while the span is a read state rather than a stretch. */
export function countWord(n: number | null, unit: "snapshot" | "block" | "data block", floor = false): string | null {
  if (n == null || n <= 0) return null;
  // A FLOOR is labelled (rule 10): "31+ data blocks" while the window's reads are still landing.
  return `${n.toLocaleString("en-US")}${floor ? "+" : ""} ${unit}${n === 1 ? "" : "s"}`;
}

/** Under the unlisted filter the block window reads nothing: every surface says the floor, never
 *  "no blocks". */
export const BLOCKS_UNREAD = "Unlisted networks' blocks are not read";

/** THE BLOCK WINDOW ISN'T HERE — one sentence per instrument state (rule 10), shared by the
 *  explorer's list, RAW's table and the band's cells (refactor round R1, P3: the three had drifted —
 *  "Too far back for the block trail" beside "Blocks this far back are not reached"). Not read (the
 *  unlisted filter), deeper than the trail walks, a read that failed (around a pin, or at the live
 *  edge), a read still running or nothing held yet, and a held window that holds no block. `held`:
 *  is a window held (`getBlockWindow()`)? */
export function blockAbsence(
  status: { around: number | null; status: "loading" | "ready" | "failed" | "beyond" | "unread" } | null,
  held: boolean,
): string {
  const st = status?.status ?? null;
  if (st === "unread") return BLOCKS_UNREAD;
  if (st === "beyond") return "Blocks this far back are not reached";
  if (st === "failed") return status?.around != null ? "The blocks at that time could not be read" : "The block window could not be read";
  if (st === "loading" || !held) return "Reading the blocks…";
  return "No blocks in this stretch";
}
