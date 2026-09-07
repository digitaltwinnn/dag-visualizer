// The sampler's grow-until-cursor pager — the same self-healing pattern the client's
// _refreshOneMeta uses (src/data/api.ts:414-451): grow the page until it provably reaches
// back to the cursor, capped. Past the cap the gap is ACCEPTED and stays a gap in the
// series (rule 10: an honest hole beats a fabricated bridge). A COLD cursor (-1) takes one
// page — history before the feature's deploy simply doesn't exist (no backfill, per spec).
//
// THE CAP IS THE SELF-HEAL DEPTH (raised 600 → 30,000, 2026-09-07): it decides how much
// downtime a deploy gap or outage recovers from without leaving a hole. The explorer serves
// 10K-record pages (probed live), and the busiest chain (DOR, ~29K records/day) sets the
// clock — 30K covers ~a day of DOR downtime and weeks of everything else; the sampler's
// maxDuration rose to 300 s to pay for the worst case. Beyond the cap the gap is accepted,
// and scripts/rebuild-trends.ts --recompute-from repairs the affected days whole.
export async function listSince<T extends { ordinal: number }>(
  page: (limit: number) => Promise<T[]>,
  sinceOrdinal: number,
): Promise<{ recs: T[]; gap: boolean }> {
  const CAP = 30000;
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
  // A short page (list.length < limit) is only PROOF of reaching the chain start when the
  // oldest record it returned actually lands at/before the cursor. Upstream can also hand
  // back a short page because it clamped the limit or pruned history behind the cursor (cron
  // paused for weeks, then resumed) — in that case the loop still exits here, but the batch
  // provably never reached sinceOrdinal, so reporting `gap: false` would fabricate a bridge
  // over a real hole (rule 10). Recompute from what actually came back, not from why the loop
  // stopped.
  const gap = sinceOrdinal >= 0 && list.length > 0 && list[list.length - 1].ordinal > sinceOrdinal + 1;
  return { recs: list.filter((r) => r.ordinal > sinceOrdinal).reverse(), gap };
}
