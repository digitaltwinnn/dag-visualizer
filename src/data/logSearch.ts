// THE RAW LOG'S SEARCH RULES, PURE (2026-10-07). They lived only in AnchorLogTable's state and
// effects until a tester pass found four bugs in them in one sitting; here each is a function with
// a test that names the bug it pins (`logSearch.test.ts`). The component keeps the fetching and the
// React state; every DECISION about what a search means is made here.
import { dayEndMs, dayStartMs } from "@/src/data/chainSeek";
import { UNLISTED_ID } from "@/src/data/unlistedId";

/** Which rows the log reads: one network's chain, or several chains merged by time — every catalog
 *  chain under All, every UNLISTED chain under the Unlisted lens (2026-10-08: the explorer lists
 *  them, so they page like any network) — or, for any other lens, the latest rows the live buffer
 *  holds. */
export function logMode(s: { chain: string | null; lens: string }): "chain" | "merged" | "latest" {
  if (s.chain) return "chain";
  return s.lens === "all" || s.lens === UNLISTED_ID ? "merged" : "latest";
}

export type Criterion = "snapshot" | "tick" | "date";

/** The search a press runs: the most specific criterion typed (an exact snapshot, then a global
 *  snapshot, then a date), or null when nothing is typed. */
export function searchCriterion(q: { snapshot: string; tick: string; from: string }): Criterion | null {
  if (q.snapshot) return "snapshot";
  if (q.tick) return "tick";
  if (q.from) return "date";
  return null;
}

/** ONE SEARCH AT A TIME: running a criterion clears the others, so the applied chips only ever say
 *  what is in force. */
export function clearedBy(c: Criterion): Criterion[] {
  return (["snapshot", "tick", "date"] as const).filter((x) => x !== c);
}

/** What a date search spans: a door's EXACT span while its words stand, else the typed fields as
 *  whole UTC days (the end exclusive; a from-date alone runs to now). Null without a from-date. */
export function spanOfSearch(q: { door: { fromMs: number; toMs: number } | null; from: string; to: string }): { fromMs: number; toMs: number | null } | null {
  if (q.door) return { fromMs: q.door.fromMs, toMs: q.door.toMs };
  const fromMs = dayStartMs(q.from);
  if (fromMs == null) return null;
  return { fromMs, toMs: q.to ? dayEndMs(q.to) : null };
}

/** A page inside a range, counted from the range's NEWEST snapshot: the ordinal its read starts
 *  from, how many pages the range has, and the 1-based position of its first row. */
export function rangePage(span: { first: number; last: number }, page: number, size: number): { before: number | null; pages: number; fromPos: number } {
  const count = Math.max(0, span.last - span.first + 1);
  if (count === 0) return { before: null, pages: 1, fromPos: 0 };
  return { before: span.last - (page - 1) * size, pages: Math.ceil(count / size), fromPos: (page - 1) * size + 1 };
}

const ord = (v: string) => Number(v.replace(/[^\d]/g, "")).toLocaleString();

/** What the toolbar says is applied, one chip per criterion: the chain it counts on beside a
 *  snapshot number and a date range (as the fields pair them), a door's own words in place of the
 *  dates it filled, the day picker's own words otherwise. */
export function appliedChips(
  q: { snapshot: string; tick: string; from: string; to: string; chain: string | null; doorLabel: string | null },
  ticker: (id: string) => string,
  day: (yyyyMmDd: string) => string,
): { key: Criterion; text: string }[] {
  const on = q.chain ? `${ticker(q.chain)} ` : "";
  const out: { key: Criterion; text: string }[] = [];
  if (q.snapshot) out.push({ key: "snapshot", text: `${on}${ord(q.snapshot)}` });
  if (q.tick) out.push({ key: "tick", text: `in global ${ord(q.tick)}` });
  if (q.from || q.to) {
    const days = q.from && q.to ? (q.from === q.to ? day(q.from) : `${day(q.from)} – ${day(q.to)}`) : q.from ? `from ${day(q.from)}` : `to ${day(q.to)}`;
    out.push({ key: "date", text: `${on}${q.doorLabel ?? days}` });
  }
  return out;
}
