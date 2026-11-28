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
//   reports no gap) extends the span to its last record's time (`nextSpan(prev, prev.to, lastMs)`).
//   (Records are always later than `to`, so a test by time would see a gap every run.)
// - R20, A GAP IS A HOLE, never a restart: the span keeps its `from` (a restart off an hour edge
//   erased every walked hour before it and left the walk nothing to rejoin) and `to` moves on; the
//   hours the gap left unread, `holeOf(prev.to, first record)`, go into `sub:…:holes` in the same
//   transaction (a hole already stored from the same hour keeps the later end). The read side nulls
//   every bucket overlapping a hole; `walk-submitters --holes` (`walkHoles`) fills and deletes it.
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
// DOR'S DEVICES (R22) are SKETCHES, not fields (`sketch.ts`): for each hour and day the run touched,
// the stored sketch is read (GET; absent = empty), the new ids added, and the sketch SET with its
// bucket's count field (`estimate()`) in the same one transaction. A stored sketch that will not
// decode is never replaced by an empty one — that would silently drop its history: Dor's run is not
// committed (`unreadable` names the key, `failed` the ordinal the next run resumes at) and the other
// networks commit as usual.
import { decodeSnapshotRoot } from "../snapshot/decodeChannel";
import type { MetaRec } from "../trends/bucketing";
import { listSince, type ChainPage } from "../trends/fetchSince";
import type { TrendsStore, TrendsWrite } from "../trends/store";
import { DED_ID, SUBMITTERS } from "@/src/data/submitters";
import { bucketDevices, bucketSubmitters, holeOf, nextSpan, type DeviceAdds } from "./bucket";
import { parseHoles } from "./assemble";
import { subField, subHolesKeyOf, subLockKeyOf, subNamesKeyOf, subSketchKeyOf, subSlotOf, subSpanKeyOf, type SubTier } from "./keys";
import { mergeNames, parseDedLatest } from "./names";
import { readL0Snapshots } from "./readL0";
import { addIds, decodeSketch, encodeSketch, estimate, mergeInto, newSketch, type Sketch } from "./sketch";

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
  /** Per network whose run was not committed because a stored device sketch would not decode (R22):
   *  that key. Absent when every sketch read. */
  unreadable?: Record<string, string>;
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

type Tally = { id: string; updates: number }[];

/** Whether a network's submitters are DEVICES, counted in sketches (R22), not fields. */
const isDevices = (net: string): boolean => Object.hasOwn(SUBMITTERS, net) && SUBMITTERS[net]!.kind === "device";

/** A stored device sketch that will not decode (R22): never replaced by an empty one, which would drop
 *  its history without a trace. */
class UnreadableSketch extends Error {
  constructor(readonly key: string) { super(`unreadable device sketch at ${key}`); }
}

/** The stored sketch at `key` (absent = empty), or the throw. */
function storedSketch(key: string, raw: string | null): Sketch {
  if (raw == null) return newSketch();
  const s = decodeSketch(raw);
  if (!s) throw new UnreadableSketch(key);
  return s;
}

/** A device bucket's two writes (R22): its sketch SET as a string, and its count — `estimate()` of
 *  that sketch — as the bucket's field in the tier hash DED's fields live in (`subSlotOf`). */
function sketchWrites(net: string, tier: SubTier, tsMs: number, sketch: Sketch): TrendsWrite[] {
  const { key, bucket } = subSlotOf(net, tier, tsMs);
  return [
    { key: subSketchKeyOf(net, tier, tsMs), map: {}, ttlS: null, value: encodeSketch(sketch) },
    { key, map: { [bucket]: estimate(sketch) }, ttlS: null },
  ];
}

/** The sampler's device writes for one network's reads: each touched hour's and day's stored sketch
 *  (GET) with the new ids added. */
async function deviceWrites(store: TrendsStore, net: string, read: { rec: MetaRec; tally: Tally }[]): Promise<TrendsWrite[]> {
  const adds: DeviceAdds = new Map();
  for (const { rec, tally } of read) if (tally.length) bucketDevices(adds, net, Date.parse(rec.timestamp), tally);
  const entries = [...adds];
  const stored = await Promise.all(entries.map(([key]) => store.get(key)));
  return entries.flatMap(([key, { tier, tsMs, ids }], i) => sketchWrites(net, tier, tsMs, addIds(storedSketch(key, stored[i]!), ids)));
}

/** The records' snapshots read from L0 (`readL0Snapshots`' contiguous prefix), each summed into its
 *  submitters' updates. A snapshot that cannot be decoded ends the prefix like a failed read. The
 *  sampler and the back-fill walk count through this one door. */
async function readTallies(
  recs: MetaRec[],
  net: string,
  fetchSnap: (ordinal: number) => Promise<unknown>,
  pool: number,
  shouldStop?: () => boolean,
): Promise<{ read: { rec: MetaRec; tally: Tally }[]; failedAt: number | null }> {
  const got = await readL0Snapshots(recs, fetchSnap, pool, shouldStop);
  let failedAt = got.failedAt;
  const read: { rec: MetaRec; tally: Tally }[] = [];
  for (const { rec, root } of got.read) {
    let tally: Map<string, number>;
    try {
      tally = new Map();
      for (const row of decodeSnapshotRoot(root, net).dataBlockRows) {
        for (const s of row.submitters ?? []) tally.set(s.id, (tally.get(s.id) ?? 0) + s.updates);
      }
    } catch {
      failedAt = rec.ordinal;
      break;
    }
    read.push({ rec, tally: [...tally].map(([id, updates]) => ({ id, updates })) });
  }
  return { read, failedAt };
}

interface NetRun {
  net: string;
  read: { rec: MetaRec; tally: Tally }[];
  failedAt: number | null;
  span: { from: number; to: number; cursor: number } | null;
  /** The hours a gap left unread (R20), or null when the run was contiguous. */
  hole: { from: number; to: number } | null;
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

  const { read, failedAt } = await readTallies(batch, net, (o) => deps.fetchSnap(net, o), deps.pool ?? 8, () => deps.now() >= deadlineMs);
  if (!read.length) return { net, read, failedAt, span: null, hole: null };

  const last = read[read.length - 1].rec;
  const lastMs = Date.parse(last.timestamp);
  const firstMs = Date.parse(read[0].rec.timestamp);
  const span =
    startMs != null ? { from: startMs, to: lastMs }
    : contiguous && prev ? nextSpan(prev, prev.to, lastMs)
    : nextSpan(prev, firstMs, lastMs);
  const hole = startMs == null && !contiguous && prev ? holeOf(prev.to, firstMs) : null;
  return { net, read, failedAt, span: { ...span, cursor: last.ordinal }, hole };
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
          return { net, read: [], failedAt: -1, span: null, hole: null }; // the list could not be read
        }
      }),
    );

    const inc = new Map<string, Map<string, number>>();
    const writes: TrendsWrite[] = [];
    let unreadable: Record<string, string> | undefined;
    for (const run of runs) {
      read[run.net] = run.read.length;
      failed[run.net] = run.failedAt;
      if (isDevices(run.net)) {
        // Dor (R22): its sketches read and merged now, so an undecodable one drops Dor's run alone.
        try {
          writes.push(...(await deviceWrites(store, run.net, run.read)));
        } catch (e) {
          if (!(e instanceof UnreadableSketch)) throw e;
          (unreadable ??= {})[run.net] = e.key;
          read[run.net] = 0;
          failed[run.net] = run.read[0]!.rec.ordinal; // deviceWrites reads nothing without a record
          run.span = null;
          run.hole = null;
        }
        continue;
      }
      for (const { rec, tally } of run.read) if (tally.length) bucketSubmitters(inc, run.net, Date.parse(rec.timestamp), tally);
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
      if (run.hole) {
        const f = String(run.hole.from);
        const [had] = await store.hmget(subHolesKeyOf(run.net), [f]);
        writes.push({ key: subHolesKeyOf(run.net), map: { [f]: Math.max(run.hole.to, had == null ? 0 : Number(had)) }, ttlS: null });
      }
    }

    let names = 0;
    if (deps.dedLatest) {
      const seen = parseDedLatest(await deps.dedLatest().catch(() => null));
      if (Object.keys(seen).length) {
        // Names are optional: a names hash that cannot be read writes no names and costs the run's
        // counts nothing (it ran unguarded, and one throw dropped every network's reads).
        const prev = await store.hgetall(subNamesKeyOf(DED_ID)).then((h) => h ?? {}, () => null);
        if (prev) {
          const merged = mergeNames(prev, seen, "ded", deps.now());
          const changed = Object.fromEntries(Object.entries(merged).filter(([id, v]) => prev[id] !== v));
          names = Object.keys(changed).length;
          if (names) writes.push({ key: subNamesKeyOf(DED_ID), map: changed, ttlS: null });
        }
      }
    }

    if (writes.length) await store.applyWrites(writes);
    return { read, failed, names, ...(unreadable ? { unreadable } : {}) };
  } finally {
    await store.releaseLock(subLockKeyOf());
  }
}

// ---- THE BACK-FILL WALK (`scripts/walk-submitters.ts`) ------------------------------------------
// The sampler measures forward from its first run; the walk measures the hours BEFORE it, oldest
// first, and hands them to the sampler's span. Its write discipline:
// - It never reads or writes an hour at or after span.from: the sampler owns those. The walk ends on
//   the hour edge at or below span.from, whatever `toMs` asks.
// - An hour is written as a SET of that hour's full tally (`hset`), never an increment, so a rerun
//   (or a resume over an hour already written) writes the same values: idempotent. Dor's hour sketch
//   (R22) is likewise BUILT from the hour's ids alone and SET with its count field, never merged with
//   the stored one.
// - After each day it walked (and where it stops), the day's 1d fields are SET to the sum of ALL its
//   1h fields read back from the store — the 1d = Σ1h invariant (`bucket.ts`), including, on the
//   boundary day, the sampler's own hours. Its device form: the day's sketch is SET to the merge of
//   its 24 hour sketches (MGET; an absent hour is empty, an undecodable one fails the walk), day =
//   ∪ hours, with its 1d count field. That day's read-and-set runs under the sampler's lock,
//   or a sampler run between the read and the write would be lost from the day.
// - span.from is lowered to the walk's start only when the walk reached span.from CONTIGUOUSLY (no
//   failed hour between; a resumed walk passes the original start and `resumeMs`), under the same
//   lock — the sampler rewrites the span hash every run from what it read. A span.from that moved
//   meanwhile is left alone: the walk no longer meets it. (Since R20 a gap never moves it: a gap is
//   a hole, walked by `walkHoles` below.)
// - A failed read (the caller retries before it fails — the script wraps its reads in `retrying`)
//   stops the walk at that hour: `nextMs` is where a resume starts, nothing at or after it written.

export interface WalkDeps extends Pick<SubmittersDeps, "store" | "pageMeta" | "fetchSnap" | "pool"> {
  /** A `pageMeta` cursor landing ON the oldest record at/after `ms` (inclusive, the crafted
   *  `{hash}` cursor); undefined when every record is older (page from the tip); null when none is. */
  cursorAt(net: string, ms: number): Promise<string | undefined | null>;
  /** Waits between lock attempts (default a real timer). */
  sleep?(ms: number): Promise<void>;
  /** The store calls made WHILE THE SAMPLER'S LOCK IS HELD (default `store`). The script passes the
   *  raw, non-retrying client here: a retry loop of ~15 minutes inside the section could outlast
   *  LOCK_TTL_S, let a sampler run in, and lose its counts from the day being recomputed. A failed
   *  call there fails the walk instead, which a rerun resumes. */
  lockedStore?: TrendsStore;
}

export interface WalkResult {
  /** The walk's frontier: every hour before it is written; a resume starts here. */
  nextMs: number;
  /** The ordinal whose read failed (-1: a list read), null when the walk ran to its end. */
  failedAt: number | null;
  /** Whether span.from was lowered to the walk's start. */
  lowered: boolean;
  /** Snapshots read (and counted) this walk. */
  read: number;
}

const DAY_MS = 24 * HOUR_MS;
const WALK_PAGE = 1000;
const LOCK_WAIT_MS = 15000;
const LOCK_TRIES = 80; // 20 minutes — many sampler runs' worth

/** Runs `fn` holding the sampler's lock, waiting for a run that holds it. */
export async function withSubmittersLock<T>(store: TrendsStore, fn: () => Promise<T>, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (let i = 0; !(await store.acquireLock(subLockKeyOf(), LOCK_TTL_S)); i++) {
    if (i >= LOCK_TRIES) throw new Error("the submitters sampler's lock stayed held");
    await sleep(LOCK_WAIT_MS);
  }
  try {
    return await fn();
  } finally {
    await store.releaseLock(subLockKeyOf());
  }
}

/** The records with `a ≤ ts < b`, oldest first: paged newest-first from the cursor at `b`. */
async function listWindow(deps: WalkDeps, net: string, a: number, b: number): Promise<MetaRec[]> {
  const seed = await deps.cursorAt(net, b);
  if (seed === null) return [];
  const out: MetaRec[] = [];
  let res = await deps.pageMeta(net, WALK_PAGE, seed);
  for (;;) {
    for (const r of res.data) {
      const t = Date.parse(r.timestamp);
      if (t >= a && t < b) out.push(r);
    }
    const oldest = res.data[res.data.length - 1];
    if (!oldest || Date.parse(oldest.timestamp) < a || !res.next) break;
    res = await deps.pageMeta(net, WALK_PAGE, res.next);
  }
  return out.reverse();
}

/** The day's 1d fields as the sum of every 1h field of that day in the store (1d = Σ1h); for
 *  devices (R22) the day's sketch as the merge of its 24 hour sketches (day = ∪ hours) and its count.
 *  No hour stored: no write. */
async function dayWrite(store: TrendsStore, net: string, dayMs: number): Promise<TrendsWrite[]> {
  if (isDevices(net)) {
    const hours = Array.from({ length: 24 }, (_, i) => subSketchKeyOf(net, "1h", dayMs + i * HOUR_MS));
    const got = await store.mget(hours);
    if (got.every((v) => v == null)) return [];
    const day = newSketch();
    got.forEach((v, i) => { if (v != null) mergeInto(day, storedSketch(hours[i]!, v)); });
    return sketchWrites(net, "1d", dayMs, day);
  }
  const h1 = subSlotOf(net, "1h", dayMs);
  const day = h1.bucket.slice(0, 2); // the "DD" of "DD-HH"
  const sums = new Map<string, number>();
  for (const [f, v] of Object.entries((await store.hgetall(h1.key)) ?? {})) {
    const bar = f.indexOf("|"); // split on the bar, never a prefix match (the read route's rule)
    if (bar < 0 || f.slice(0, bar).split("-")[0] !== day) continue;
    const id = f.slice(bar + 1);
    if (id) sums.set(id, (sums.get(id) ?? 0) + Number(v));
  }
  if (!sums.size) return [];
  const d1 = subSlotOf(net, "1d", dayMs);
  const map: Record<string, number> = {};
  for (const [id, n] of sums) map[subField(d1.bucket, id)] = n;
  return [{ key: d1.key, map, ttlS: null }];
}

/** ONE HOUR OF THE WALK (the back-fill and the holes alike): the hour's records read from L0 and
 *  the hour's 1h fields SET to its full tally — never an increment, so a rerun writes the same. Dor's
 *  hour (R22): its sketch built from the hour's ids alone and SET with its count; no day write here. */
async function writeHour(deps: WalkDeps, net: string, h: number, hourRecs: MetaRec[]): Promise<{ read: number; failedAt: number | null }> {
  const got = await readTallies(hourRecs, net, (o) => deps.fetchSnap(net, o), deps.pool ?? 8);
  if (got.failedAt != null) return { read: 0, failedAt: got.failedAt };
  if (isDevices(net)) {
    const ids = new Set<string>();
    for (const { tally } of got.read) for (const { id } of tally) ids.add(id);
    if (ids.size) await deps.store.applyWrites(sketchWrites(net, "1h", h, addIds(newSketch(), ids)));
    return { read: got.read.length, failedAt: null };
  }
  const inc = new Map<string, number>();
  for (const { tally } of got.read) for (const { id, updates } of tally) inc.set(id, (inc.get(id) ?? 0) + updates);
  if (inc.size) {
    const { key, bucket } = subSlotOf(net, "1h", h);
    await deps.store.hset(key, Object.fromEntries([...inc].map(([id, n]) => [subField(bucket, id), n])));
  }
  return { read: got.read.length, failedAt: null };
}

export async function walkRange(
  deps: WalkDeps,
  net: string,
  fromMs: number,
  toMs: number,
  onProgress: (p: { ordinal: number; tsMs: number; read: number }) => void,
  resumeMs: number = fromMs,
): Promise<WalkResult> {
  const { store } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  if (fromMs % HOUR_MS || resumeMs % HOUR_MS) throw new Error("walkRange: from and resume must be hour edges");
  const spanFrom = Number((await store.hgetall(subSpanKeyOf(net)))?.from ?? NaN);
  if (!Number.isFinite(spanFrom)) throw new Error(`walkRange: ${net} has no measured span — the sampler must run first`);
  const endMs = Math.min(Math.floor(toMs / HOUR_MS) * HOUR_MS, Math.floor(spanFrom / HOUR_MS) * HOUR_MS);
  const samplerDay = Math.floor(spanFrom / DAY_MS) * DAY_MS;

  // A day's 1d recompute; the boundary day's (plus, when the walk reached span.from, the lowering)
  // under the sampler's lock, in one transaction.
  const flushDay = async (dayMs: number, lower: boolean): Promise<boolean> => {
    if (dayMs !== samplerDay && !lower) {
      const w = await dayWrite(store, net, dayMs);
      if (w.length) await store.applyWrites(w);
      return false;
    }
    return withSubmittersLock(store, async () => {
      const ls = deps.lockedStore ?? store; // no retry loop inside the lock
      const writes: TrendsWrite[] = await dayWrite(ls, net, dayMs);
      const now = (await ls.hgetall(subSpanKeyOf(net))) ?? {};
      const lowered = lower && Number(now.from) === spanFrom && fromMs < spanFrom;
      if (lowered) writes.push({ key: subSpanKeyOf(net), map: { from: fromMs }, ttlS: null });
      if (writes.length) await ls.applyWrites(writes);
      return lowered;
    }, sleep);
  };

  let cur = Math.max(resumeMs, fromMs);
  let read = 0;
  let lastOrdinal = -1;
  while (cur < endMs) {
    const dayMs = Math.floor(cur / DAY_MS) * DAY_MS;
    const dayEnd = Math.min(dayMs + DAY_MS, endMs);
    let recs: MetaRec[];
    try {
      recs = await listWindow(deps, net, cur, dayEnd);
    } catch {
      if (cur > dayMs) await flushDay(dayMs, false);
      return { nextMs: cur, failedAt: -1, lowered: false, read };
    }
    let i = 0;
    for (let h = cur; h < dayEnd; h += HOUR_MS) {
      const hourRecs: MetaRec[] = [];
      while (i < recs.length && Date.parse(recs[i].timestamp) < h + HOUR_MS) hourRecs.push(recs[i++]);
      const got = await writeHour(deps, net, h, hourRecs);
      if (got.failedAt != null) {
        if (h > dayMs) await flushDay(dayMs, false);
        return { nextMs: h, failedAt: got.failedAt, lowered: false, read };
      }
      read += got.read;
      if (hourRecs.length) lastOrdinal = hourRecs[hourRecs.length - 1].ordinal;
      cur = h + HOUR_MS;
    }
    const lowered = await flushDay(dayMs, cur === spanFrom);
    onProgress({ ordinal: lastOrdinal, tsMs: cur, read });
    if (cur === spanFrom) return { nextMs: cur, failedAt: null, lowered, read };
  }
  // Nothing left to walk: a resume that starts on span.from still owes the lowering.
  const lowered = cur === spanFrom && endMs === spanFrom ? await flushDay(Math.floor((spanFrom - 1) / DAY_MS) * DAY_MS, true) : false;
  return { nextMs: cur, failedAt: null, lowered, read };
}

// ---- THE HOLES WALK (`walk-submitters --holes`, ruling R20) -------------------------------------
// A gap the sampler could not read across is a HOLE in its span (`sub:…:holes`), every bucket
// overlapping it null on the read side. This walks each hole's hours with the back-fill's discipline,
// oldest hole first:
// - only a hole the sampler has moved PAST (its end at or below the hour holding span.to): the
//   sampler still increments the hour it is in, and a SET there could lose its later counts. A hole
//   it is still inside is left for a later run.
// - each hour SET to its full tally (`writeHour`, idempotent), outside the lock, since no sampler
//   run writes an hour behind its own `to`;
// - then, under the sampler's lock and in ONE transaction, every touched day's 1d recomputed from its
//   1h fields (1d = Σ1h; Dor's day sketch = ∪ its hour sketches) and the hole's field deleted — only if the field still holds the end walked
//   (a later gap from the same hour may have pushed it out; that hole is left to walk again).
// - a failed read stops the walk at that hole, which stays: a rerun walks it again from its start.

export interface HolesResult {
  /** Holes walked and deleted. */
  filled: number;
  /** Holes left: the sampler is still inside one, or its end moved while it was walked. */
  left: number;
  /** The ordinal whose read failed (-1: a list read), null when every walkable hole was filled. */
  failedAt: number | null;
  /** Snapshots read (and counted). */
  read: number;
}

export async function walkHoles(
  deps: WalkDeps,
  net: string,
  onProgress: (p: { hole: { from: number; to: number }; read: number }) => void = () => {},
): Promise<HolesResult> {
  const { store } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const spanTo = Number((await store.hgetall(subSpanKeyOf(net)))?.to ?? NaN);
  if (!Number.isFinite(spanTo)) throw new Error(`walkHoles: ${net} has no measured span — the sampler must run first`);
  const passed = Math.floor(spanTo / HOUR_MS) * HOUR_MS;
  const holes = parseHoles(await store.hgetall(subHolesKeyOf(net)));
  let filled = 0, left = 0, read = 0;
  for (const hole of holes) {
    if (hole.to > passed || hole.from % HOUR_MS || hole.to % HOUR_MS) { left++; continue; }
    let recs: MetaRec[];
    try {
      recs = await listWindow(deps, net, hole.from, hole.to);
    } catch {
      return { filled, left: left + 1, failedAt: -1, read };
    }
    let i = 0;
    const days = new Set<number>();
    for (let h = hole.from; h < hole.to; h += HOUR_MS) {
      const hourRecs: MetaRec[] = [];
      while (i < recs.length && Date.parse(recs[i].timestamp) < h + HOUR_MS) hourRecs.push(recs[i++]);
      const got = await writeHour(deps, net, h, hourRecs);
      if (got.failedAt != null) return { filled, left: left + 1, failedAt: got.failedAt, read };
      read += got.read;
      days.add(Math.floor(h / DAY_MS) * DAY_MS);
    }
    const closed = await withSubmittersLock(store, async () => {
      const ls = deps.lockedStore ?? store; // no retry loop inside the lock
      const writes: TrendsWrite[] = [];
      for (const d of days) writes.push(...(await dayWrite(ls, net, d)));
      const field = String(hole.from);
      const [now] = await ls.hmget(subHolesKeyOf(net), [field]);
      const same = now != null && Number(now) === hole.to;
      if (same) writes.push({ key: subHolesKeyOf(net), map: {}, ttlS: null, hdel: [field] });
      if (writes.length) await ls.applyWrites(writes);
      return same;
    }, sleep);
    if (closed) filled++; else left++;
    onProgress({ hole, read });
  }
  return { filled, left, failedAt: null, read };
}
