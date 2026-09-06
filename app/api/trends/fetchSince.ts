// The sampler's grow-until-cursor pager — the same self-healing pattern the client's
// _refreshOneMeta uses (src/data/api.ts:414-451): grow the page until it provably reaches
// back to the cursor, capped. Past the cap the gap is ACCEPTED and stays a gap in the
// series (rule 10: an honest hole beats a fabricated bridge). A COLD cursor (-1) takes one
// page — history before the feature's deploy simply doesn't exist (no backfill, per spec).
export async function listSince<T extends { ordinal: number }>(
  page: (limit: number) => Promise<T[]>,
  sinceOrdinal: number,
): Promise<{ recs: T[]; gap: boolean }> {
  const CAP = 600;
  let limit = 60;
  let list: T[] = [];
  for (;;) {
    list = await page(limit); // newest-first, the explorer's order
    if (!list.length) return { recs: [], gap: false };
    const oldest = list[list.length - 1].ordinal;
    if (sinceOrdinal < 0 || oldest <= sinceOrdinal + 1 || list.length < limit) break;
    if (limit >= CAP) {
      return { recs: list.filter((r) => r.ordinal > sinceOrdinal).reverse(), gap: true };
    }
    limit = Math.min(CAP, limit * 3);
  }
  return { recs: list.filter((r) => r.ordinal > sinceOrdinal).reverse(), gap: false };
}
