// One submitters sampler run (2026-11-27): for each network that names its submitters (DED's
// organisations, Dor's devices — `src/data/submitters.ts`), the chain's records since its cursor →
// each snapshot read from the network's OWN L0 by ordinal (`readL0.ts`) → the data blocks'
// submitters summed per record (`decodeSnapshotRoot`) → added into the `sub:` family's 1h and 1d
// fields (`bucket.ts`) → the measured span and cursor advanced. Dependency-injected like
// `trends/runSample.ts`, so the whole contract is unit-tested; the cron route provides the real deps.
//
// THE MEASURED SPAN (`sub:mainnet:<net>:span`, fields `from` / `to` / `cursor`) is what History reads
// as "measured" (rule 10: a bucket outside it is null, never 0). Its rulings:
// - R6, CONTIGUITY IS BY ORDINAL, not time: a run whose first record is cursor+1 (and the pager
//   reports no gap) extends the span to its last record's time (`nextSpan(prev, prev.to, lastMs)`);
//   any gap restarts the span at the first record read. (Records are always later than `to`, so a
//   test by time would restart the span every run.)
// - R7, A FIRST RUN (no cursor stored) starts at the START OF THE PREVIOUS UTC HOUR: it pages
//   newest-first until a record is older than that boundary, keeps the records at or after it, and
//   sets `from` to the boundary exactly, so the back-fill walk can end on an hour edge. Not
//   `listSince`'s cold mode, which reads back toward genesis, 30K records deep.
// - `maxRecs` (4000 a network a run, ≈ 2.5 h of DED today): the OLDEST records of the batch are
//   read and the rest are left for the next run — the cursor only advances over what was read, so
//   the span stays contiguous through a catch-up.
// - AN L0 READ THAT FAILS mid-batch (the design's Review Focus 2): only the contiguous prefix before
//   it is counted, the cursor is the last ordinal read and `to` its time, and `failed[net]` names the
//   failing ordinal — so the next run resumes there with no hole and no double count. A network
//   whose explorer list cannot be read reports `failed[net] = -1` and moves nothing.
// - A TIME BUDGET (review, 2026-11-27): `deadlineMs` (default 200 s after the run starts, under the
//   route's 300 s maxDuration) stops new L0 reads once passed; the prefix read so far is committed
//   exactly like a `maxRecs` truncation — cursor over what was read, span contiguous, no failure
//   reported. Without it a slow L0 during a catch-up would be killed before the one write, commit
//   nothing, and retry the same reads forever.
//
// The write phase is ALL-OR-NOTHING, `runSample`'s pattern: the lock (`subLockKeyOf`, its own, so the
// two samplers never wait on each other) excludes every other run, the counts are INCREMENTS merged
// onto the stored values read with `hmget`, and ONE `applyWrites` commits every network's fields,
// spans and cursors, plus DED's names when `dedLatest` is given (read once a run; a failed read
// writes no names and costs the run nothing). The family keeps forever: no TTL.
import { decodeSnapshotRoot } from "../snapshot/decodeChannel";
import type { MetaRec } from "../trends/bucketing";
import { listSince, type ChainPage } from "../trends/fetchSince";
import type { TrendsStore, TrendsWrite } from "../trends/store";
import { DED_ID } from "@/src/data/submitters";
import { bucketSubmitters, nextSpan } from "./bucket";
import { subLockKeyOf, subNamesKeyOf, subSpanKeyOf } from "./keys";
import { mergeNames, parseDedLatest } from "./names";
import { readL0Snapshots } from "./readL0";

export interface SubmittersDeps {
  store: TrendsStore;
  nets: string[];
  /** One page of a network's snapshot records, newest first (the explorer's list). */
  pageMeta(id: string, limit: number, next?: string): Promise<ChainPage<MetaRec>>;
  /** A network's snapshot by ordinal from its own L0 (`/snapshots/<n>`'s JSON). */
  fetchSnap(netId: string, ordinal: number): Promise<unknown>;
  /** DED's `/v1/fingerprints/latest` body; absent: no names are read. */
  dedLatest?(): Promise<unknown>;
  now(): number;
  /** L0 reads in flight per network (default 8). */
  pool?: number;
  /** Records read per network per run (default 4000). */
  maxRecs?: number;
  /** Epoch ms after which no new L0 read starts (default: 200 s after the run starts, by `now`). */
  deadlineMs?: number;
}

export interface SubmittersResult {
  skipped?: "locked";
  /** Snapshots read (and counted) per network this run. */
  read: Record<string, number>;
  /** Per network: the ordinal the run stopped at, -1 when its list could not be read, null when clean. */
  failed: Record<string, number | null>;
  /** DED names added or changed. */
  names: number;
}

const HOUR_MS = 3600000;
const TIP = 60;
const PAGE = 1000;
/** A first run's paging depth — far beyond two hours of any network today. */
const FIRST_CAP = 30000;
/** Lock TTL well above the route's maxDuration (300 s), per `store.ts`'s releaseLock invariant. */
const LOCK_TTL_S = 900;
/** The default read budget — leaves the merge and the one transaction ~100 s of the 300 s maxDuration. */
const READ_BUDGET_MS = 200000;

/** R7: the records at or after `boundaryMs`, oldest first, paged newest-first until one is older. */
async function listFromHour(page: (limit: number, next?: string) => Promise<ChainPage<MetaRec>>, boundaryMs: number): Promise<MetaRec[]> {
  let res = await page(TIP);
  let all = res.data;
  const reached = () => all.length > 0 && Date.parse(all[all.length - 1].timestamp) < boundaryMs;
  while (!reached() && all.length < FIRST_CAP && res.next) {
    res = await page(PAGE, res.next);
    if (!res.data.length) break;
    all = all.concat(res.data);
  }
  return all.filter((r) => Date.parse(r.timestamp) >= boundaryMs).reverse();
}

interface NetRun {
  net: string;
  read: { rec: MetaRec; tally: { id: string; updates: number }[] }[];
  failedAt: number | null;
  span: { from: number; to: number; cursor: number } | null;
}

async function runNet(deps: SubmittersDeps, net: string, prevSpan: Record<string, string> | null, deadlineMs: number): Promise<NetRun> {
  const page = (limit: number, next?: string) => deps.pageMeta(net, limit, next);
  const cursor = prevSpan?.cursor != null ? Number(prevSpan.cursor) : null;
  const prev = prevSpan?.from != null && prevSpan.to != null ? { from: Number(prevSpan.from), to: Number(prevSpan.to) } : null;

  let batch: MetaRec[];
  let startMs: number | null = null; // the span's start when it restarts on an hour edge (R7)
  let contiguous = false;
  if (cursor == null) {
    startMs = Math.floor(deps.now() / HOUR_MS) * HOUR_MS - HOUR_MS;
    batch = await listFromHour(page, startMs);
  } else {
    const r = await listSince(page, cursor);
    batch = r.recs;
    contiguous = !r.gap && batch.length > 0 && batch[0].ordinal === cursor + 1;
  }
  batch = batch.slice(0, deps.maxRecs ?? 4000);

  const got = await readL0Snapshots(batch, (o) => deps.fetchSnap(net, o), deps.pool ?? 8, () => deps.now() >= deadlineMs);
  let failedAt = got.failedAt;
  const read: NetRun["read"] = [];
  for (const { rec, root } of got.read) {
    let tally: Map<string, number>;
    try {
      tally = new Map();
      for (const row of decodeSnapshotRoot(root, net).dataBlockRows) {
        for (const s of row.submitters ?? []) tally.set(s.id, (tally.get(s.id) ?? 0) + s.updates);
      }
    } catch {
      failedAt = rec.ordinal; // a snapshot we cannot decode ends the prefix like a failed read
      break;
    }
    read.push({ rec, tally: [...tally].map(([id, updates]) => ({ id, updates })) });
  }
  if (!read.length) return { net, read, failedAt, span: null };

  const last = read[read.length - 1].rec;
  const lastMs = Date.parse(last.timestamp);
  const span =
    startMs != null ? { from: startMs, to: lastMs }
    : contiguous && prev ? nextSpan(prev, prev.to, lastMs)
    : nextSpan(null, Date.parse(read[0].rec.timestamp), lastMs);
  return { net, read, failedAt, span: { ...span, cursor: last.ordinal } };
}

export async function runSubmitters(deps: SubmittersDeps): Promise<SubmittersResult> {
  const { store } = deps;
  const read: Record<string, number> = {};
  const failed: Record<string, number | null> = {};
  if (!(await store.acquireLock(subLockKeyOf(), LOCK_TTL_S))) return { skipped: "locked", read, failed, names: 0 };
  try {
    const deadlineMs = deps.deadlineMs ?? deps.now() + READ_BUDGET_MS;
    const runs = await Promise.all(
      deps.nets.map(async (net): Promise<NetRun> => {
        try {
          return await runNet(deps, net, await store.hgetall(subSpanKeyOf(net)), deadlineMs);
        } catch {
          return { net, read: [], failedAt: -1, span: null }; // the list could not be read
        }
      }),
    );

    const inc = new Map<string, Map<string, number>>();
    const writes: TrendsWrite[] = [];
    for (const run of runs) {
      read[run.net] = run.read.length;
      failed[run.net] = run.failedAt;
      for (const { rec, tally } of run.read) {
        if (tally.length) bucketSubmitters(inc, run.net, Date.parse(rec.timestamp), tally);
      }
    }
    for (const [key, fields] of inc) {
      if (!fields.size) continue;
      const names = [...fields.keys()];
      const prevVals = await store.hmget(key, names);
      const map: Record<string, number> = {};
      names.forEach((f, i) => { map[f] = (prevVals[i] == null ? 0 : Number(prevVals[i])) + fields.get(f)!; });
      writes.push({ key, map, ttlS: null });
    }
    for (const run of runs) {
      if (run.span) writes.push({ key: subSpanKeyOf(run.net), map: run.span, ttlS: null });
    }

    let names = 0;
    if (deps.dedLatest) {
      const seen = parseDedLatest(await deps.dedLatest().catch(() => null));
      if (Object.keys(seen).length) {
        const prev = (await store.hgetall(subNamesKeyOf(DED_ID))) ?? {};
        const merged = mergeNames(prev, seen, "ded", deps.now());
        const changed = Object.fromEntries(Object.entries(merged).filter(([id, v]) => prev[id] !== v));
        names = Object.keys(changed).length;
        if (names) writes.push({ key: subNamesKeyOf(DED_ID), map: changed, ttlS: null });
      }
    }

    if (writes.length) await store.applyWrites(writes);
    return { read, failed, names };
  } finally {
    await store.releaseLock(subLockKeyOf());
  }
}
