// A metagraph L0's snapshots by ordinal, `pool` reads in flight (2026-11-27). Each L0 is one public
// load balancer, so the sampler is a polite client: a bounded pool, never a burst.
//
// THE CONTIGUOUS PREFIX IS THE ANSWER. The records come in oldest-first; a read that fails (a throw,
// or a body that is not a JSON object) ends the answer at that record, and only the records before
// it are returned — so the caller counts exactly a gapless run and can move its cursor to the last
// one, and the next run resumes AT the failure with no hole and no double count (the submitters
// design's Review Focus 2). Once a failure is seen no record after it is started; reads already in
// flight are let finish and dropped.
//
// A TIME BUDGET (review, 2026-11-27): `shouldStop`, asked before each new read, ends the batch
// early — reads in flight finish, none is started, and the answer is the prefix read so far with
// `failedAt: null` (a truncation, like the caller's `maxRecs`, never a failure). Without it a slow
// L0 after an outage, exactly when a backlog exists, would outlive the function and commit nothing.
import type { MetaRec } from "../trends/bucketing";

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

export async function readL0Snapshots(
  recs: MetaRec[],
  fetchSnap: (ordinal: number) => Promise<unknown>,
  pool: number,
  shouldStop: () => boolean = () => false,
): Promise<{ read: { rec: MetaRec; root: Record<string, unknown> }[]; failedAt: number | null }> {
  const roots: (Record<string, unknown> | undefined)[] = new Array(recs.length);
  let firstFail = recs.length; // index of the earliest failure seen
  let next = 0;
  const worker = async () => {
    while (next < recs.length && next < firstFail && !shouldStop()) {
      const i = next++;
      try {
        const body = await fetchSnap(recs[i].ordinal);
        if (!isObj(body)) throw new Error("not a snapshot");
        roots[i] = body;
      } catch {
        firstFail = Math.min(firstFail, i);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(pool, recs.length)) }, worker));
  // The prefix ends at the first record not read: a failure, or (budget spent) one never started.
  const read: { rec: MetaRec; root: Record<string, unknown> }[] = [];
  let i = 0;
  for (; i < recs.length && roots[i] !== undefined; i++) read.push({ rec: recs[i], root: roots[i]! });
  return { read, failedAt: i === firstFail && i < recs.length ? recs[i].ordinal : null };
}
