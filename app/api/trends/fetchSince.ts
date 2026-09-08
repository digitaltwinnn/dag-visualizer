// The sampler's grow-until-cursor pager — the same self-healing pattern the client's
// _refreshOneMeta uses (src/data/api.ts:414-451): reach provably back to the cursor, capped.
// Past the cap the gap is ACCEPTED and stays a gap in the series (rule 10: an honest hole
// beats a fabricated bridge). A COLD cursor (-1) takes one page — history before the
// feature's deploy simply doesn't exist (no backfill, per spec).
//
// THE CAP IS THE SELF-HEAL DEPTH (30,000 records/chain — ~a day of the busiest chain, DOR at
// ~29K/day; weeks of everything else), and it is walked by CURSOR PAGES, not one giant
// request: probed live 2026-09-07, the explorer's `limit` has a hard 10K ceiling on the
// global list (larger asks return EMPTY — a single-request design would retry that empty
// rung forever) and DOR's chain 504s at 10K (the query is too slow upstream). A tiny tip
// page covers the normal 15-min run in 1-2 requests; a catch-up walks `meta.next` cursors
// (server-issued cursors are exclusive — no overlap, verified live) at PAGE-sized steps.
// Beyond the cap, `scripts/rebuild-trends.ts --recompute-from` repairs the affected days.

/** One page of a chain, newest-first, plus the cursor for the next-older page. */
export interface ChainPage<T> {
  data: T[];
  next?: string;
}

const CAP = 30000;
const PAGE = 1000;

export async function listSince<T extends { ordinal: number }>(
  page: (limit: number, next?: string) => Promise<ChainPage<T>>,
  sinceOrdinal: number,
): Promise<{ recs: T[]; gap: boolean }> {
  // The cheap tip probe — the every-15-minutes case, one request.
  let res = await page(60);
  let all = res.data;
  if (!all.length) return { recs: [], gap: false };
  if (sinceOrdinal < 0) return { recs: all.slice().reverse(), gap: false }; // cold cursor
  // Not reached yet: walk older pages by cursor until the cursor is provably covered,
  // the chain ends, or the self-heal depth is spent.
  while (all[all.length - 1].ordinal > sinceOrdinal + 1 && all.length < CAP && res.next) {
    res = await page(PAGE, res.next);
    if (!res.data.length) break;
    all = all.concat(res.data);
  }
  // Reached = the batch's oldest record provably touches the cursor. Anything else — cap
  // spent, chain end short of the cursor, an empty page — is a REAL gap and says so.
  const gap = all[all.length - 1].ordinal > sinceOrdinal + 1;
  return { recs: all.filter((r) => r.ordinal > sinceOrdinal).reverse(), gap };
}
