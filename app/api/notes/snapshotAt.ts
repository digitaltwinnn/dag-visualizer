import type { NoteChange, NoteChangeFind, NoteChangeSubject } from "@/src/data/noteTypes";
import { NETWORKS, type NetworkId } from "@/src/engine/config";

// A NOTABLE ROW'S EXACT SNAPSHOT (user, 2026-11-02: "largest snapshot could open the snapshot
// cards"). The store keeps the largest global and a chain's widest gap per 5-minute bucket, not
// which snapshot held them, so the builder names the bucket and the value (`NoteChange.find`) and this
// finds the record when the note is written: a seek to the bucket, then a scan of it. The record's
// timestamp is its anchoring global's own (the join is equality, `app/api/global/at`), which gives
// every field the Metagraph snapshot card needs, the road the raw log's rows already take.
//
// BEST EFFORT: a row that cannot be resolved keeps the network subject it had, and a read here
// never fails a note. Nothing is stored but the answer.

export interface SnapRead {
  ordinal: number;
  hash: string;
  timestamp: string;
  /** A global's `metagraphSnapshotCount`. */
  count?: number;
  lastSnapshotHash?: string;
}

/** Reads one chain's records, or the global chain's when `chain` is null. `signal` ends a read a
 *  row has given up on. */
export interface ChainReader {
  latest(chain: string | null, signal?: AbortSignal): Promise<SnapRead | null>;
  at(chain: string | null, ordinal: number, signal?: AbortSignal): Promise<SnapRead | null>;
}

/** The most records one row reads while scanning its bucket. */
const SCAN_MAX = 200;
const SCAN_BATCH = 25;
/** How far back the seek first fences: past a day of the busiest chain. */
const RECENT_ORDINALS = 64_000;
const SEEK_FAN = 8;
/** How long a row may look. It runs inside the note's lock and its route's 60 seconds, beside two
 *  Gate attempts of 20 seconds each and the store's reads, so a slow explorer costs a row, never a
 *  note. Rows run together, so this is the note's cost too. */
export const LOCATE_BUDGET_MS = 8000;
/** A record by ordinal never changes, so hours of notes share their probes, as `app/api/global/at`. */
const ORDINAL_CACHE_S = 86_400;

/** The first ordinal at or after `targetMs`, by rounds of parallel reads that each narrow the fence
 *  eightfold. Every target here is recent, and the search is for a gap, which is exactly what bends
 *  the time axis the interpolating `seekOrdinalByTime` leans on, so this one assumes no cadence. And
 *  a read takes half a second on a busy chain, so one at a time spends the whole budget seeking. */
async function ordinalAtOrAfter(reader: ChainReader, chain: string | null, targetMs: number, latest: number, signal?: AbortSignal): Promise<number | null> {
  const before = async (ordinal: number): Promise<boolean | null> => {
    const r = await reader.at(chain, ordinal, signal);
    return r ? Date.parse(r.timestamp) < targetMs : null;
  };
  let hi = latest;
  let lo = 0;
  for (let reach = RECENT_ORDINALS; ; reach *= SEEK_FAN) {
    const at = Math.max(1, latest - reach);
    const is = await before(at);
    if (is == null) return null;
    if (is) {
      lo = at;
      break;
    }
    hi = at;
    if (at === 1) return 1;
  }
  while (lo + 1 < hi) {
    const step = Math.max(1, Math.floor((hi - lo) / (SEEK_FAN + 1)));
    const points = Array.from({ length: SEEK_FAN }, (_, i) => lo + step * (i + 1)).filter((o) => o < hi);
    const answers = await Promise.all(points.map(before));
    if (answers.includes(null)) return null;
    const last = answers.lastIndexOf(true);
    if (last >= 0) lo = points[last]!;
    if (last + 1 < points.length) hi = points[last + 1]!;
  }
  return hi;
}

/** The record in the bucket a row names: what it anchored, or the gap it ended. */
async function scanBucket(reader: ChainReader, f: Extract<NoteChangeFind, { fromMs: number }>, first: number, signal?: AbortSignal): Promise<SnapRead | null> {
  let prev = first > 1 ? await reader.at(f.chain, first - 1, signal) : null;
  for (let at = first; at < first + SCAN_MAX; at += SCAN_BATCH) {
    const page = await Promise.all(Array.from({ length: SCAN_BATCH }, (_, i) => reader.at(f.chain, at + i, signal)));
    for (const r of page) {
      if (!r || Date.parse(r.timestamp) >= f.toMs) return null;
      if (f.count != null && r.count === f.count) return r;
      if (f.gapS != null && prev && Math.round((Date.parse(r.timestamp) - Date.parse(prev.timestamp)) / 1000) === f.gapS) return r;
      prev = r;
    }
  }
  return null;
}

async function recordOf(reader: ChainReader, f: NoteChangeFind, signal?: AbortSignal): Promise<SnapRead | null> {
  const tip = await reader.latest(f.chain, signal);
  if (!tip || "last" in f) return tip;
  const first = await ordinalAtOrAfter(reader, f.chain, f.fromMs, tip.ordinal, signal);
  return first == null ? null : scanBucket(reader, f, first, signal);
}

/** The global a metagraph snapshot anchored into: the one stamped with its own timestamp. */
async function globalOf(reader: ChainReader, timestamp: string, signal?: AbortSignal): Promise<SnapRead | null> {
  const tip = await reader.latest(null, signal);
  const at = tip && (await ordinalAtOrAfter(reader, null, Date.parse(timestamp), tip.ordinal, signal));
  const g = at == null ? null : await reader.at(null, at, signal);
  return g?.timestamp === timestamp ? g : null;
}

const globalFields = (g: SnapRead) => ({
  ordinal: g.ordinal,
  timestamp: g.timestamp,
  hash: g.hash,
  ...(g.lastSnapshotHash ? { lastSnapshotHash: g.lastSnapshotHash } : {}),
});

async function subjectOf(reader: ChainReader, f: NoteChangeFind, signal?: AbortSignal): Promise<NoteChangeSubject | null> {
  const rec = await recordOf(reader, f, signal);
  if (!rec) return null;
  if (f.chain == null) return { kind: "global", global: globalFields(rec) };
  const g = await globalOf(reader, rec.timestamp, signal);
  if (!g) return null;
  return {
    kind: "metaSnap",
    sel: { metaId: f.chain, ordinal: rec.ordinal, hash: rec.hash, globalOrdinal: g.ordinal, ts: rec.timestamp },
    global: globalFields(g),
  };
}

/** One note's reads, each record once: its rows ask for the same tips and fences. */
function memoReader(reader: ChainReader): ChainReader {
  const seen = new Map<string, Promise<SnapRead | null>>();
  const once = (key: string, read: () => Promise<SnapRead | null>) => {
    let p = seen.get(key);
    if (!p) seen.set(key, (p = read()));
    return p;
  };
  return {
    latest: (chain, signal) => once(`${chain}:latest`, () => reader.latest(chain, signal)),
    at: (chain, ordinal, signal) => once(`${chain}:${ordinal}`, () => reader.at(chain, ordinal, signal)),
  };
}

/** A row's search, ended and answered null at the budget. */
async function within(find: NoteChangeFind, reader: ChainReader, ms: number, abort: AbortController): Promise<NoteChangeSubject | null> {
  const timer = setTimeout(() => abort.abort(), ms);
  const gaveUp = new Promise<null>((resolve) => abort.signal.addEventListener("abort", () => resolve(null), { once: true }));
  try {
    return await Promise.race([subjectOf(reader, find, abort.signal), gaveUp]);
  } finally {
    clearTimeout(timer);
  }
}

/** The rows with each search answered where it can be, and every search dropped. */
export async function locateRows(rows: readonly NoteChange[], reader: ChainReader, budgetMs = LOCATE_BUDGET_MS): Promise<NoteChange[]> {
  // One clock for the note: its rows share their reads, so one row's give-up is theirs.
  const abort = new AbortController();
  const memo = memoReader(reader);
  return Promise.all(
    rows.map(async ({ find, ...row }) => {
      if (!find) return row;
      const subject = await within(find, memo, budgetMs, abort).catch(() => null);
      return subject ? { ...row, subject } : row;
    }),
  );
}

type Record_ = { ordinal?: number; hash?: string; timestamp?: string; metagraphSnapshotCount?: number; lastSnapshotHash?: string };

const asRead = (d: Record_ | undefined): SnapRead | null =>
  d && typeof d.ordinal === "number" && typeof d.timestamp === "string"
    ? { ordinal: d.ordinal, hash: d.hash ?? "", timestamp: d.timestamp, ...(typeof d.metagraphSnapshotCount === "number" ? { count: d.metagraphSnapshotCount } : {}), ...(d.lastSnapshotHash ? { lastSnapshotHash: d.lastSnapshotHash } : {}) }
    : null;

async function readRecord(url: string, cached: boolean, given?: AbortSignal): Promise<SnapRead | null> {
  const timeout = AbortSignal.timeout(4000);
  const signal = given ? AbortSignal.any([given, timeout]) : timeout;
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal, ...(cached ? { next: { revalidate: ORDINAL_CACHE_S } } : { cache: "no-store" as const }) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`be ${r.status}`);
  const { data } = (await r.json()) as { data?: Record_ | Record_[] };
  return asRead(Array.isArray(data) ? data[0] : data);
}

/** The explorer's own records: ~330 B each, by ordinal. */
export function explorerReader(net: string): ChainReader {
  const be = NETWORKS[net as NetworkId].be;
  return {
    latest: (chain, signal) => readRecord(chain == null ? `${be}/global-snapshots/latest` : `${be}/currency/${chain}/snapshots?limit=1`, false, signal),
    at: (chain, ordinal, signal) => readRecord(chain == null ? `${be}/global-snapshots/${ordinal}` : `${be}/currency/${chain}/snapshots/${ordinal}`, true, signal),
  };
}
