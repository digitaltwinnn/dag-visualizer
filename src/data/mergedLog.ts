// THE ANCHOR LOG UNDER ALL: EVERY NETWORK'S CHAIN, MERGED BY TIME (user, 2026-10-07 — "I care about
// actual real totals not technical implementation … that should be solved under the hood and
// indifferent to the user"). Each network's chain is complete and pageable on its own; under All the
// log pages them together, newest first. Pure: the caller fetches, this decides.
//
// A PAGE BOUNDARY IS A CURSOR PER CHAIN. A page takes its rows from every chain at its cursor and
// the next page starts where each chain's take ended, so the newest page, the oldest page and each
// step between are exact. What a merged list cannot do is jump to an arbitrary page number — that
// would mean walking there — so the pager offers the ends and the steps.
//
// ⚠️ ONE TOTAL ORDER, so the two directions agree where a page ends: newest first is time
// descending, then the chain's place in the list, then the ordinal; oldest first is its exact
// reverse.

/** One snapshot as a chain page returns it. */
export interface LogRow {
  ordinal: number;
  hash: string;
  parent: string;
  ts: string;
  fee: number;
  sizeInKB: number;
}

/** The ordinals of one chain the log covers — the whole chain, or the part a range holds. */
export interface ChainSpan {
  addr: string;
  lo: number;
  hi: number;
}

/** One chain's rows from its cursor: newest first for "down", oldest first for "up". */
export interface ChainRun {
  addr: string;
  rows: readonly LogRow[];
}

/** Merge one page from every chain's run. `take` is the page size; the result is listed newest
 *  first whichever way it was read, and `taken` says how far each chain's cursor moves. */
export function mergePage(
  runs: readonly ChainRun[],
  take: number,
  dir: "down" | "up",
): { rows: (LogRow & { addr: string })[]; taken: Record<string, number> } {
  const all: (LogRow & { addr: string; ms: number; idx: number })[] = [];
  runs.forEach((run, idx) => {
    for (const r of run.rows) all.push({ ...r, addr: run.addr, ms: Date.parse(r.ts), idx });
  });
  // Newest first: time desc, chain order asc, ordinal desc. Oldest first is the exact reverse.
  const newestFirst = (a: (typeof all)[number], b: (typeof all)[number]) => b.ms - a.ms || a.idx - b.idx || b.ordinal - a.ordinal;
  all.sort(dir === "down" ? newestFirst : (a, b) => newestFirst(b, a));
  const picked = all.slice(0, take);
  const taken: Record<string, number> = {};
  for (const r of picked) taken[r.addr] = (taken[r.addr] ?? 0) + 1;
  if (dir === "up") picked.reverse();
  return { rows: picked.map(({ ms: _ms, idx: _idx, ...r }) => r), taken };
}

/** The oldest page's size when the pages are counted newest first: the remainder, or a full page. */
export function lastPageSize(total: number, size: number): number {
  if (total <= 0) return 0;
  return total % size || size;
}
