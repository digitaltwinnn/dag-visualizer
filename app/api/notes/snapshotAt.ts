import type { NoteChange, NoteChangeFind, NoteChangeSubject } from "@/src/data/noteTypes";
import { NETWORKS, type NetworkId } from "@/src/engine/config";

// A NOTABLE ROW'S EXACT SNAPSHOT (user, 2026-11-02: "largest snapshot could open the snapshot
// cards"). The store keeps a chain's largest fee and widest gap per 5-minute bucket, not which
// snapshot held them, so the builder names the bucket and the value (`NoteChange.find`) and this
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
  fee?: number;
  lastSnapshotHash?: string;
}

/** Reads one chain's records, or the global chain's when `chain` is null. */
export interface ChainReader {
  latest(chain: string | null): Promise<SnapRead | null>;
  at(chain: string | null, ordinal: number): Promise<SnapRead | null>;
}

/** The most records one row reads while scanning its bucket. */
const SCAN_MAX = 200;
const SCAN_BATCH = 25;
/** How far back the seek first fences: past a day of the busiest chain. */
const RECENT_ORDINALS = 64_000;
const SEEK_FAN = 8;
/** How long one row may look, so a slow explorer cannot hold a note's lock. */
const LOCATE_BUDGET_MS = 15_000;

/** The first ordinal at or after `targetMs`, by rounds of parallel reads that each narrow the fence
 *  eightfold. Every target here is recent, and the search is for a gap, which is exactly what bends
 *  the time axis the interpolating `seekOrdinalByTime` leans on, so this one assumes no cadence. And
 *  a read takes half a second on a busy chain, so one at a time spends the whole budget seeking. */
async function ordinalAtOrAfter(reader: ChainReader, chain: string | null, targetMs: number, latest: number): Promise<number | null> {
  const before = async (ordinal: number): Promise<boolean | null> => {
    const r = await reader.at(chain, ordinal);
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

/** The record in the bucket a row names: the fee it held, or the gap it ended. */
async function scanBucket(reader: ChainReader, f: Exclude<NoteChangeFind, { last: true }>, first: number): Promise<SnapRead | null> {
  let prev = first > 1 ? await reader.at(f.chain, first - 1) : null;
  for (let at = first; at < first + SCAN_MAX; at += SCAN_BATCH) {
    const page = await Promise.all(Array.from({ length: SCAN_BATCH }, (_, i) => reader.at(f.chain, at + i)));
    for (const r of page) {
      if (!r || Date.parse(r.timestamp) >= f.toMs) return null;
      if (f.fee != null && r.fee === f.fee) return r;
      if (f.gapS != null && prev && Math.round((Date.parse(r.timestamp) - Date.parse(prev.timestamp)) / 1000) === f.gapS) return r;
      prev = r;
    }
  }
  return null;
}

async function recordOf(reader: ChainReader, f: NoteChangeFind): Promise<SnapRead | null> {
  const tip = await reader.latest(f.chain);
  if (!tip || "last" in f) return tip;
  const first = await ordinalAtOrAfter(reader, f.chain, f.fromMs, tip.ordinal);
  return first == null ? null : scanBucket(reader, f, first);
}

/** The global a metagraph snapshot anchored into: the one stamped with its own timestamp. */
async function globalOf(reader: ChainReader, timestamp: string): Promise<SnapRead | null> {
  const tip = await reader.latest(null);
  const at = tip && (await ordinalAtOrAfter(reader, null, Date.parse(timestamp), tip.ordinal));
  const g = at == null ? null : await reader.at(null, at);
  return g?.timestamp === timestamp ? g : null;
}

const globalFields = (g: SnapRead) => ({
  ordinal: g.ordinal,
  timestamp: g.timestamp,
  hash: g.hash,
  ...(g.lastSnapshotHash ? { lastSnapshotHash: g.lastSnapshotHash } : {}),
});

async function subjectOf(reader: ChainReader, f: NoteChangeFind): Promise<NoteChangeSubject | null> {
  const rec = await recordOf(reader, f);
  if (!rec) return null;
  if (f.chain == null) return { kind: "global", global: globalFields(rec) };
  const g = await globalOf(reader, rec.timestamp);
  if (!g) return null;
  return {
    kind: "metaSnap",
    sel: { metaId: f.chain, ordinal: rec.ordinal, hash: rec.hash, globalOrdinal: g.ordinal, ts: rec.timestamp },
    global: globalFields(g),
  };
}

function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  const out = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([work, out]).finally(() => clearTimeout(timer));
}

/** The rows with each search answered where it can be, and every search dropped. */
export function locateRows(rows: readonly NoteChange[], reader: ChainReader, budgetMs = LOCATE_BUDGET_MS): Promise<NoteChange[]> {
  return Promise.all(
    rows.map(async ({ find, ...row }) => {
      if (!find) return row;
      const subject = await within(subjectOf(reader, find), budgetMs).catch(() => null);
      return subject ? { ...row, subject } : row;
    }),
  );
}

type Record_ = { ordinal?: number; hash?: string; timestamp?: string; fee?: number; lastSnapshotHash?: string };

const asRead = (d: Record_ | undefined): SnapRead | null =>
  d && typeof d.ordinal === "number" && typeof d.timestamp === "string"
    ? { ordinal: d.ordinal, hash: d.hash ?? "", timestamp: d.timestamp, ...(typeof d.fee === "number" ? { fee: d.fee } : {}), ...(d.lastSnapshotHash ? { lastSnapshotHash: d.lastSnapshotHash } : {}) }
    : null;

async function readRecord(url: string): Promise<SnapRead | null> {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(4000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`be ${r.status}`);
  const { data } = (await r.json()) as { data?: Record_ | Record_[] };
  return asRead(Array.isArray(data) ? data[0] : data);
}

/** The explorer's own records: ~330 B each, by ordinal. */
export function explorerReader(net: string): ChainReader {
  const be = NETWORKS[net as NetworkId].be;
  return {
    latest: (chain) => readRecord(chain == null ? `${be}/global-snapshots/latest` : `${be}/currency/${chain}/snapshots?limit=1`),
    at: (chain, ordinal) => readRecord(chain == null ? `${be}/global-snapshots/${ordinal}` : `${be}/currency/${chain}/snapshots/${ordinal}`),
  };
}
