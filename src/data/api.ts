// Data layer: pulls live snapshots from the Constellation block explorer API.
// No simulation — if the API is unreachable the app shows a "no data" state and
// keeps polling, recovering on its own once it responds again (`live` reflects this).

import { METAGRAPHS, NET_DEF } from "@/src/net/current";
import { COLORS, POLL, type MetaConfig } from "@/src/engine/config";
import type { Anchor, ClusterNode, DagCore, GlobalSnapshot } from "@/src/data/types";


// ── POLL HEALTH — the pulse strip's read (user, 2026-08-30: clicking the heartbeat should show
// "when did it last poll successfully? which polls do we have?"). One row per FEED, updated by
// the fetch sites themselves (this module's three, plus /api/metagraphs from the Engine's
// refreshMeta and /api/geo from geoResolve via reportPoll). Read-only measured facts — last
// success, last error, counts, the feed's own cadence (null = on demand / mount) — never a
// fabricated status: the strip derives ok/stale from the stamps and the interval.
export interface PollHealth {
  id: string;
  label: string;
  target: string;      // where it goes, in words ("block explorer", "L0/L1 load balancers", "app API")
  everyMs: number | null; // the feed's own cadence; null = on demand
  lastOkAt: number | null;
  lastErrAt: number | null;
  ok: number;
  err: number;
}
// THE FEEDS TABLE — the one home for each feed's descriptor (2026-08-30, same-day structural
// fix): the first cut passed (label, target, interval) at every reportPoll call site, which is
// the two-homes drift class this repo keeps re-catching — change a label at the success site
// and not its error twin and the registry silently grows two rows. Call sites pass the ID alone.
const FEEDS = {
  global: { label: "Global snapshots", target: "block explorer", everyMs: POLL.pollMs },
  metasnaps: { label: "Metagraph snapshots", target: "block explorer", everyMs: POLL.pollMs },
  clusters: { label: "DAG nodes", target: "L0 + L1 load balancers", everyMs: POLL.clusterMs },
  "api-metagraphs": { label: "Metagraph directory", target: "app API", everyMs: POLL.metaRefreshMs },
  "api-geo": { label: "Validator geo map", target: "app API", everyMs: null },
} as const;
export type FeedId = keyof typeof FEEDS;
const POLL_HEALTH = new Map<string, PollHealth>();
/** Report one fetch outcome into the registry — exported for the two fetch sites outside this
 *  module (/api/metagraphs in Engine.refreshMeta, /api/geo in geoResolve). */
export function reportPoll(id: FeedId, ok: boolean): void {
  const d = FEEDS[id];
  let r = POLL_HEALTH.get(id);
  if (!r) { r = { id, label: d.label, target: d.target, everyMs: d.everyMs, lastOkAt: null, lastErrAt: null, ok: 0, err: 0 }; POLL_HEALTH.set(id, r); }
  if (ok) { r.lastOkAt = Date.now(); r.ok++; } else { r.lastErrAt = Date.now(); r.err++; }
}
/** Ensure a feed has a ROW without recording an outcome.
 *
 *  A feed that has been reached but has never delivered anything usable still belongs in the strip
 *  — as "acquiring", which is exactly what `pollStatusOf` returns for a row with no `lastOkAt`.
 *  Without this, a first response that is reachable but STALE reports nothing at all and the feed
 *  is simply absent from the panel: the same silent denial this registry exists to prevent, one
 *  level up. */
export function touchPoll(id: FeedId): void {
  const d = FEEDS[id];
  if (!POLL_HEALTH.has(id)) {
    POLL_HEALTH.set(id, { id, label: d.label, target: d.target, everyMs: d.everyMs, lastOkAt: null, lastErrAt: null, ok: 0, err: 0 });
  }
}

/** The registry, in stable insertion order — the pulse strip's one read. */
export function pollHealthRows(): PollHealth[] {
  return [...POLL_HEALTH.values()];
}

/** The anchor-index keys to drop when it is over `max`: the CHRONOLOGICALLY oldest, which is not
 *  the insertion-oldest (see the cap in _recordMetaSnaps for why they diverge). Pure, for the test.
 *
 *  ⚠️ Sorts the keys as STRINGS. That is chronological only because every key is the explorer's
 *  own `timestamp` in the one format it emits — ISO-8601 UTC, millisecond precision, `Z` suffix,
 *  so all keys are equal-length and lexicographic order IS time order. If the feed ever returns a
 *  numeric offset or variable precision this must become a Date.parse comparison; the test pins
 *  the assumption so that change fails loudly rather than silently evicting the wrong ticks. */
export function staleTickKeys(keys: Iterable<string>, max: number): string[] {
  const all = [...keys];
  if (all.length <= max) return [];
  return all.sort().slice(0, all.length - max);
}

/** Fan one event out to its listeners, each ISOLATED.
 *
 *  These reach the scene, the store and the panels, and an unguarded `forEach` let ONE throwing
 *  consumer silence every listener registered after it — for that event, for the rest of the
 *  session — surfacing as unrelated frozen UI far from the cause. Rethrow-free but never silent:
 *  the error still reaches the console. Pure enough to test; exported for that reason. */
export function fanOut<T>(listeners: ReadonlyArray<(p: T) => void>, payload: T, evt = ""): void {
  for (const f of listeners) {
    try {
      f(payload);
    } catch (err) {
      console.error(`NetworkData: a "${evt}" listener threw`, err);
    }
  }
}

/** Did a whole metagraph refresh CYCLE succeed? One row per FEED means the row must answer for the
 *  feed, not for whichever member reported last: reporting per metagraph let a single persistently
 *  failing one hide behind its healthy siblings refreshing `lastOkAt` in the same cycle. A settled
 *  rejection counts as failure, and so does an explicit `false` from `_refreshOneMeta`. */
export function cycleOk(results: ReadonlyArray<PromiseSettledResult<boolean>>): boolean {
  return results.every((r) => r.status === "fulfilled" && r.value !== false);
}

export interface NetworkEvents {
  global: { reset: boolean; snapshots?: GlobalSnapshot[]; snapshot?: GlobalSnapshot; latest: GlobalSnapshot | null };
  status: { live: boolean; lastGoodAt: number | null };
  cluster: { l0: ClusterNode[]; l1: ClusterNode[]; dag: DagCore };
  anchor: { metaId: string; timestamps: string[]; seed: boolean };
}

// One record in a metagraph's rolling snapshot buffer (metaSnaps).
export interface MetaSnapRecord {
  ordinal: number;
  hash: string;
  parent: string;
  ts: string;
  fee: number;
  sizeInKB: number;
  height: number;        // the metagraph's OWN block-DAG depth
  subHeight: number;     // orders snapshots that share a height
  blocks: number;        // rare on mainnet; an honest 0 beats omitting it
  epochProgress: number;
}

// Raw shape of a `/currency/{id}/snapshots` list entry (only the fields we read).
interface RawMetaSnapshot {
  ordinal: number;
  hash: string;
  lastSnapshotHash: string;
  timestamp: string;
  fee?: number;
  sizeInKB?: number;
  height?: number;
  subHeight?: number;
  blocks?: unknown[];
  epochProgress?: number;
}

export interface Activity {
  snapsPerHour: number;
  anchorsPerHour: number;
  blocksPerHour: number;
  feesPerHour: number;
  /** The window every rate above is extrapolated FROM: how many snapshots, over how long. The
   *  numbers are shown to the user (the vitals state their own basis) — a rate is honest only
   *  while you can see the span it was measured over. Measured 2026-08-12 over 60 live ticks,
   *  mainnet global L0 averages ~28 s between ticks but ranges 4.6 s to 115 s, so the 52-tick
   *  buffer spans ~24 min and /hr is a ×2.5 reach. Read from the buffer's own timestamps, never
   *  assumed, so the sentence survives a cadence change — and the VARIANCE is why it must be. */
  samples: number;
  spanHr: number;
  /** ⚠️ HOW OLD THE NEWEST SAMPLE IS, so a rate can never be presented as a CURRENT one when the
   *  window it was measured over has passed. A per-hour figure claims the present tense by its own
   *  units; without this the claim is unfalsifiable from the reading alone. Null on the global
   *  stream, which is live by construction — if IT stops, the app's own NO SIGNAL says so. */
  staleMs?: number;
  cadenceSeries: number[];
  anchoredSeries: number[];
  blocksSeries: number[];
  feesSeries: number[];
}

// Which activity stream a filter reads — the ONE home for the split `getActivity` branches on,
// so a surface that must SAY which one it is showing (the ledger vitals label their scope) can
// never disagree with the data layer about it.
export function isGlobalActivityScope(filter?: string): boolean {
  return !filter || filter === "all" || filter === "dag";
}

type Listener<K extends keyof NetworkEvents> = (payload: NetworkEvents[K]) => void;// Internal storage is pragmatically loose (a Map keyed by event name can't express the
// per-key payload type without a mapped-type dance); the public on/off surface below is
// fully typed and is the only thing consumers see.
type ListenerMap = { [K in keyof NetworkEvents]: Array<Listener<K>> };

export class NetworkData {
  live: boolean;            // true once a real fetch succeeds
  lastGoodAt: number | null; // ms epoch of the last successful poll
  latest: GlobalSnapshot | null; // most recent global snapshot
  globalSnapshots: GlobalSnapshot[]; // rolling buffer, oldest -> newest

  // Shared per-metagraph snapshot history + the anchor index that joins them to
  // the Global L0 spine. Both the ribbon's derived DAG fee and the ledger view
  // read from these. Keyed by metagraph id.
  metaSnaps: Map<string, MetaSnapRecord[]>; // id -> [{ ordinal, hash, parent, ts, fee, sizeInKB, height, subHeight, blocks, epochProgress }] oldest->newest
  // global snapshot timestamp -> aggregate of the metagraph snapshots anchored into that tick
  // (from the metagraphs we track). The authoritative anchored COUNT is the global snapshot's
  // own `metagraphSnapshotCount`; `count` here is how many of those WE identified (the rest =
  // the few genuinely-unlisted metagraphs, ~a couple per tick). To keep `count` accurate even
  // when a fast metagraph (Dor) batches 20+ snapshots into one tick, the live poll fetches a
  // deep tail every tick (POLL.metaSnapTail) — a too-shallow tail used to drop them and inflate
  // the "unlisted" gap. The summed fee is "from tracked metagraphs".
  anchorIndex: Map<string, Anchor>; // ts -> { fee (datum), count, metaIds:Set, metaCounts:Map(id->n) }

  metagraphCount: number;
  clusters: { l0: ClusterNode[]; l1: ClusterNode[] }; // live validator membership (raw, two clusters)
  // The DAG modelled as a metagraph-shaped CORE: the l0 + l1 clusters merged by node id
  // into one node-list with `roles` (a machine in both is one hybrid node). Roles stay
  // `l0`/`l1` to match the rest of the app; the DAG's L1 IS its currency-L1, displayed as
  // "cL1" by the UI (it has no data-L1). Same shape metagraphs use → treat it as a core.
  dagCore: DagCore | null;
  private listeners: ListenerMap;
  private _timer: ReturnType<typeof setInterval> | null;
  private _clusterTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.live = false;
    this.lastGoodAt = null;
    this.latest = null;
    this.globalSnapshots = [];

    this.metaSnaps = new Map();
    this.anchorIndex = new Map();

    this.metagraphCount = METAGRAPHS.length;
    this.clusters = { l0: [], l1: [] };
    this.dagCore = null;
    this.listeners = { global: [], status: [], cluster: [], anchor: [] };
    this._timer = null;
  }

  on<K extends keyof NetworkEvents>(evt: K, fn: (p: NetworkEvents[K]) => void): this {
    this.listeners[evt].push(fn);
    return this;
  }
  off<K extends keyof NetworkEvents>(evt: K, fn: (p: NetworkEvents[K]) => void): this {
    this.listeners[evt] = (this.listeners[evt] || []).filter((f) => f !== fn) as ListenerMap[K];
    return this;
  }
  private _emit<K extends keyof NetworkEvents>(evt: K, payload: NetworkEvents[K]): void {
    fanOut(this.listeners[evt], payload, evt);
  }

  private async _fetchJson(url: string): Promise<any> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }
  private _get(path: string): Promise<any> {
    return this._fetchJson(NET_DEF.be + path);
  }

  // ---- bootstrap: seed the spine with recent history ----
  async init(): Promise<void> {
    try {
      const json = await this._get(`/global-snapshots?limit=${POLL.maxSnapshots}`);
      const list: GlobalSnapshot[] = (json.data || []).slice().reverse(); // oldest -> newest
      if (!list.length) throw new Error("empty");
      this.globalSnapshots = list;
      this.latest = list[list.length - 1];
      this._setLive(true, Date.now());
      reportPoll("global", true);
    } catch (e) {
      // No simulation — a real site stays factual. Show "no data" and recover on a
      // later poll once the API responds again.
      this._setLive(false);
      // The SEED reports too. Without this the pulse strip had no "Global snapshots" row at all
      // until the first _tick a poll-interval later, and — worse — a failed boot fetch left no
      // trace: the strip is measured facts only (rule 10), so an error it never counted is an
      // error it silently denies happened.
      reportPoll("global", false);
    }
    this._emit("global", { reset: true, snapshots: this.globalSnapshots, latest: this.latest });
    // The seed is best-effort; POLLING IS NOT. Whatever the seed manages, the timers must start,
    // or the module cannot honour its own header ("keeps polling, recovering on its own once it
    // responds again") — and `initNetwork` calls this without awaiting or catching, so a throw
    // here would be an unhandled rejection that silently leaves the app frozen on boot data.
    try {
      await this._fetchClusters();
      await this._refreshMeta(POLL.metaSnapSeed); // seed each metagraph's history
    } finally {
      this.start(); // idempotent — guards on _timer
    }
  }

  // ---- validator membership (the real ~160-node clusters) ----
  async _fetchClusters(): Promise<void> {
    try {
      const [l0, l1] = await Promise.all([
        this._fetchJson(NET_DEF.l0 + "/cluster/info"),
        this._fetchJson(NET_DEF.l1 + "/cluster/info"),
      ]);
      if (Array.isArray(l0) && Array.isArray(l1) && l0.length && l1.length) {
        this.clusters = { l0, l1 };
        this.dagCore = this._buildDagCore(l0, l1);
        this._emit("cluster", { l0, l1, dag: this.dagCore });
        reportPoll("clusters", true);
        return;
      }
      reportPoll("clusters", false);
    } catch (e) {
      reportPoll("clusters", false);
      /* keep whatever real membership we already have (maybe none) */
    }
  }

  // Merge the L0 + L1 validator clusters (keyed by node `id`) into one node-list with
  // `roles` — turning the DAG into the same hybrid/dedicated structure metagraphs use.
  // A machine in both clusters is ONE hybrid node (`roles: ["l0","cl1"]`), not two.
  private _buildDagCore(l0: ClusterNode[], l1: ClusterNode[]): DagCore {
    const byId = new Map<string, { id: string; ip: string; state?: string; roles: string[]; layer?: string }>();
    const merge = (list: ClusterNode[], role: string) => {
      for (const n of list) {
        if (!n || !n.id) continue;
        let e = byId.get(n.id);
        if (!e) { e = { id: n.id, ip: n.ip, state: n.state, roles: [] }; byId.set(n.id, e); }
        if (!e.roles.includes(role)) e.roles.push(role);
        if (!e.ip && n.ip) e.ip = n.ip;
        if (role === "l0" && n.state) e.state = n.state; // prefer the consensus-layer state
      }
    };
    merge(l0, "l0");    // consensus / settlement
    merge(l1, "cl1");   // the DAG's L1 IS its $DAG currency-L1 (it has no data-L1)
    const nodes = [...byId.values()].map((e) => {
      e.roles.sort((a, b) => (a === "l0" ? 0 : 1) - (b === "l0" ? 0 : 1));
      e.layer = e.roles[0]; // primary layer for plotting (l0 if present, else cl1)
      return e;
    });
    // CANONICAL ORDER — cluster/info returns peers in an unstable order, and the scene places
    // nodes by list INDEX (armillary ring slots, honeycomb stacks). Without this, the 25s
    // membership poll could reshuffle indices and visibly SNAP every node to a new ring
    // position mid-rotation (user bug).
    nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return {
      id: "dag", name: "DAG", symbol: "DAG", isRoot: true, color: COLORS.core, nodes,
      description:
        "The DAG is the Hypergraph's base network — its Global L0 runs PRO consensus and " +
        "settles every metagraph's snapshots, and its currency-L1 carries $DAG. It's the root " +
        "every metagraph anchors into, secured by $DAG-staked nodes.",
    };
  }

  private _setLive(v: boolean, at?: number): void {
    if (v === true && at) this.lastGoodAt = at;
    if (this.live !== v) {
      this.live = v;
      this._emit("status", { live: v, lastGoodAt: this.lastGoodAt });
    } else if (this.latest === null) {
      this._emit("status", { live: v, lastGoodAt: this.lastGoodAt });
    }
  }

  start(): void {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), POLL.pollMs);
    this._clusterTimer = setInterval(() => this._fetchClusters(), POLL.clusterMs);
  }
  stop(): void {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this._clusterTimer) clearInterval(this._clusterTimer);
    this._clusterTimer = null;
  }

  private async _tick(): Promise<void> {
    // Always attempt the live fetch (even while "down"), so the app recovers on its
    // own when the API comes back — no simulation in between.
    try {
      const json = await this._get(`/global-snapshots/latest`);
      const snap: GlobalSnapshot = json.data;
      if (snap && (!this.latest || snap.ordinal > this.latest.ordinal)) {
        this._pushGlobal(snap);
      }
      this._setLive(true, Date.now());
      reportPoll("global", true);
      // Pull each metagraph's newest snapshots EVERY tick (was every other tick) — together with
      // the deeper tail, this keeps up with high-throughput metagraphs (Dor) so their snapshots
      // are all attributed correctly instead of leaking into the "unlisted" count.
      this._refreshMeta(POLL.metaSnapTail);
    } catch (e) {
      this._setLive(false);
      reportPoll("global", false);
    }
  }

  private _pushGlobal(snap: GlobalSnapshot): void {
    this.latest = snap;
    this.globalSnapshots.push(snap);
    if (this.globalSnapshots.length > POLL.maxSnapshots) this.globalSnapshots.shift();
    this._emit("global", { reset: false, snapshot: snap, latest: snap });
  }

  // ---- metagraphs ----
  // `limit` is how many recent snapshots to pull per metagraph: a deep seed on the
  // first load (history), a short tail on each live poll (new arrivals).
  private async _refreshMeta(limit: number = POLL.metaSnapTail): Promise<void> {
    // Refresh every metagraph in parallel — there are ~10 real ones, so serial
    // awaits would stall the tick.
    //
    // allSettled, NOT all: `_refreshOneMeta` catches its own fetch, but it can still throw on
    // MALFORMED data that gets past that (a null entry makes `list[list.length - 1].ordinal`
    // a TypeError). Under Promise.all one such metagraph rejects the whole batch, and in `init`
    // that await sits BEFORE `start()` — so a single bad response would mean the poll timers
    // never start and the app sits silently frozen forever, which is the exact opposite of this
    // module's contract ("keeps polling, recovering on its own"). It also stops the un-awaited
    // call in `_tick` from raising an unhandled rejection every 4s.
    //
    // The feed reports ONCE PER CYCLE, from the aggregate. Reporting inside _refreshOneMeta made
    // ~12 calls per tick against `global`'s one, and — the real defect — a single persistently
    // failing metagraph was MASKED: its eleven healthy siblings refreshed `lastOkAt` in the same
    // cycle, so the strip's derived dot stayed green while a feed was down. One row per FEED means
    // the row must answer for the whole feed.
    const results = await Promise.allSettled(METAGRAPHS.map((m) => this._refreshOneMeta(m, limit)));
    reportPoll("metasnaps", cycleOk(results));
  }

  /** Returns false when this metagraph's read failed — `_refreshMeta` aggregates the cycle's
   *  verdict into the one poll-health row. An empty or absent list is NOT a failure. */
  private async _refreshOneMeta(m: MetaConfig, limit: number = POLL.metaSnapTail): Promise<boolean> {
    if (!m.id) return true;
    // The newest ordinal we already hold for this metagraph.
    const have = this.metaSnaps.get(m.id);
    const haveTo = have && have.length ? have[have.length - 1].ordinal : -1;

    // SELF-HEALING CATCH-UP. A fast metagraph (Dor) can dump dozens of snapshots into one global
    // tick — more than any fixed `tail`. So instead of trusting a magic number, we GROW the fetch
    // until the batch reaches back to the last ordinal we already have — i.e. there is provably no
    // gap. An uncounted gap is exactly what mislabels listed anchors as "unlisted", so this makes
    // the anchored count correct regardless of burst size. Capped (and stops when the API returns
    // fewer than asked = nothing more to get, or on a cold buffer where the seed limit is enough).
    let lim = limit;
    let list: RawMetaSnapshot[] = [];
    for (let i = 0; i < 6; i++) {
      let json;
      try {
        json = await this._get(`/currency/${m.id}/snapshots?limit=${lim}`);
      } catch {
        return false; // no data this tick — stay factual, try again next poll
      }
      list = json.data || [];
      if (!list.length) return true;
      const oldest = list[list.length - 1].ordinal; // newest-first → last is oldest
      if (haveTo < 0 || oldest <= haveTo + 1 || list.length < lim || lim >= 600) break;
      lim = Math.min(600, lim * 3); // gap not yet covered — fetch deeper and retry
    }

    // Record full snapshot records (with fee/size) into the rolling buffer + anchor index.
    this._recordMetaSnaps(m, list.map((s) => ({
      ordinal: s.ordinal, hash: s.hash, parent: s.lastSnapshotHash,
      ts: s.timestamp, fee: s.fee || 0, sizeInKB: s.sizeInKB || 0,
      height: s.height || 0, subHeight: s.subHeight || 0,
      blocks: Array.isArray(s.blocks) ? s.blocks.length : 0,
      epochProgress: s.epochProgress || 0,
    })));
    return true;
  }

  // Append new snapshot records (dedup by ordinal) to a metagraph's rolling buffer
  // and fold them into the anchor index (grouped by the global-tick timestamp the
  // explorer stamps them with). Emits "anchor" with the timestamps touched so a
  // consumer can refresh a ribbon chip whose fee filled in after it arrived.
  private _recordMetaSnaps(m: MetaConfig, records: MetaSnapRecord[]): void {
    const buf = this.metaSnaps.get(m.id) || [];
    const lastOrd = buf.length ? buf[buf.length - 1].ordinal : -1;
    const fresh = records
      .filter((r) => r.ordinal > lastOrd)
      .sort((a, b) => a.ordinal - b.ordinal); // oldest -> newest
    if (!fresh.length) return;

    for (const r of fresh) {
      buf.push(r);
      const a: Anchor = this.anchorIndex.get(r.ts) || { fee: 0, count: 0, metaIds: new Set(), metaCounts: new Map(), touched: 0 };
      a.fee += r.fee; a.count += 1; a.metaIds.add(m.id);
      a.metaCounts.set(m.id, (a.metaCounts.get(m.id) || 0) + 1);
      a.touched = Date.now(); // last time this tick's identified count grew → drives "settling"
      this.anchorIndex.set(r.ts, a);
    }
    if (buf.length > POLL.metaSnapBuffer) buf.splice(0, buf.length - POLL.metaSnapBuffer);
    this.metaSnaps.set(m.id, buf);

    // Cap the anchor index by TICK AGE. This used to walk Map insertion order on the belief that
    // it was chronological; it is not, and the gap is not theoretical. Metagraphs seed in
    // PARALLEL, so completion order decides insertion order, and several catalog metagraphs are
    // DORMANT — measured live 2026-08-31, their newest snapshot is months old (one 2025-09-05).
    // A dormant one's 60 ancient timestamps therefore land AFTER a live one's recent ticks, and
    // an insertion-order cap then evicts the recent ticks and keeps the year-old ones. Measured
    // the same day: the seed inserts 428 distinct timestamps against a 400 cap spanning ~8,600
    // hours, so this evicts on every cold load. Every consumer looks the index up by a GLOBAL
    // SNAPSHOT's timestamp, and that buffer is the 52 most recent ticks — so the evicted entries
    // were the only ones anyone would ever read, and the tick went on to read as unidentified
    // while we were holding its anchors (rule 10).
    for (const k of staleTickKeys(this.anchorIndex.keys(), POLL.anchorIndexMax)) {
      this.anchorIndex.delete(k);
    }
    this._emit("anchor", { metaId: m.id, timestamps: fresh.map((r) => r.ts), seed: lastOrd === -1 });
  }

  // Aggregate fee + count of the metagraph snapshots anchored into a given global
  // tick (by timestamp), summed over the metagraphs we track. Returns datum fee
  // (1 DAG = 1e8 datum) — a near-complete lower bound (see anchorIndex note).
  getAnchor(ts: string): Anchor | null {
    return this.anchorIndex.get(ts) || null;
  }

  // Header activity rates + per-snapshot trend series, computed from the global
  // snapshot buffer's real timestamps (so they're stable and correct from first
  // load). Rates are extrapolated to per-HOUR from the buffered window:
  //   snapshots/hr, anchors/hr (Σ metagraphSnapshotCount), blocks/hr (Σ blocks).
  // Series are per-snapshot for sparklines: cadence, anchored, blocks, fees (shape
  // only — unit-independent).
  //
  // ⚠️ THE WINDOW IS MEASURED, NEVER ASSUMED, and the UI states it. POLL.maxSnapshots ticks
  // is a duration only once you know the cadence, and the cadence is not what a reading of
  // the poll interval suggests: measured 2026-08-12 over 60 live ticks, mainnet's global L0
  // averages ~28 s between ticks (we poll every 4s to catch each one promptly), so 52 ticks
  // is a ~24-MINUTE window and a /hr figure is a ×2.5 extrapolation, not a leap. But that is
  // today's chain, not a law — and it is not even a STEADY cadence today: those same 60 ticks
  // ran 4.6 s to 115 s apart. That variance is exactly why `spanHr` and `samples` ride the
  // result and the vitals render them: an assumed span would be wrong within the hour, while
  // a stated one moves with the chain and the number stays honest.
  // Widening the buffer is NOT the tuning knob — maxSnapshots also caps the LiveStrip's bar
  // count, so it is a visual change too.
  getActivity(filter?: string): Activity | null {
    // A metagraph selection reads ITS own snapshot stream (cadence + fees it pays), not the
    // global L0 ledger. "all" and the DAG core itself ("dag") are the global L0 view.
    if (!isGlobalActivityScope(filter)) return this._metaActivity(filter!);
    const s = this.globalSnapshots;
    if (s.length < 2) return null;
    const anchored = s.map((x) => (typeof x.metagraphSnapshotCount === "number" ? x.metagraphSnapshotCount : 0));
    const blocks = s.map((x) => (Array.isArray(x.blocks) ? x.blocks.length : 0));
    const t0 = new Date(s[0].timestamp).getTime();
    const t1 = new Date(s[s.length - 1].timestamp).getTime();
    const spanHr = Math.max((t1 - t0) / 3600000, 1 / 3600);
    const cadence: number[] = [];
    for (let i = 1; i < s.length; i++) {
      const dt = (new Date(s[i].timestamp).getTime() - new Date(s[i - 1].timestamp).getTime()) / 1000;
      cadence.push(dt > 0 ? 3600 / dt : 0);
    }
    // DAG settlement fees per tick (from the anchor index; ~93% lower bound, see
    // anchorIndex note). Drives the header "Fees/hr" stat + its sparkline.
    const feesDag = s.map((x) => { const a = this.anchorIndex.get(x.timestamp); return a ? a.fee / 1e8 : 0; });
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    return {
      snapsPerHour: (s.length - 1) / spanHr,
      anchorsPerHour: sum(anchored) / spanHr,
      blocksPerHour: sum(blocks) / spanHr,
      feesPerHour: sum(feesDag) / spanHr,
      samples: s.length,
      spanHr,
      cadenceSeries: cadence,
      anchoredSeries: anchored,
      blocksSeries: blocks,
      feesSeries: feesDag,
    };
  }

  // Per-metagraph activity, the same shape as the global getActivity() but computed from one
  // metagraph's own snapshot buffer: its snapshot cadence, how many distinct global ticks it
  // anchored into, and the $DAG fees it paid. So the Ledger view scopes to the selection.
  //
  // ⚠️ NO BYTE RATE HERE, DELIBERATELY (user, 2026-08-12: "I want facts not guestimates"). The
  // buffer carries `sizeInKB` per record, so a KB/hr looks one line away — but POLL.metaSnapBuffer
  // caps the buffer by SNAPSHOT COUNT, not by time, and it fills DURING a burst. A batching
  // network (DOR anchored 56 snapshots into one tick, measured 2026-08-12) therefore holds a
  // window that is deep in count and shallow in time, and any rate taken from it propagates burst
  // density across the hour. Measured against the exact reads, that read 21,273 KB/hr against a
  // true ~10,672 — twice the complete figure, from a quantity labelled a lower bound. Mean size ×
  // rate is better conditioned but still an estimate, and a vitals slot states facts. The honest
  // source is a historical series the app does not keep yet; until it does, the vital stands by.
  // ⚠️ A DEAD CHAIN HAS NO RATE, AND THE BUFFER CANNOT TELL YOU SO (user, 2026-09-01: "why does
  // BIOFI (no identified nodes) say it has 358 snapshots/hour? looks wrong"). It was right, and the
  // cause is that this measures `(samples − 1) / span` over WHATEVER THE BUFFER HOLDS. For a live
  // network the buffer is the recent past and the reading is current. For a stopped one it is the
  // last snapshots it ever made — BIOFI's newest is 2026-08-16, sixteen days before this was
  // reported — and those were produced quickly, so a short span over a full buffer extrapolated to
  // a confident, entirely historical, present-tense rate.
  //
  // The buffer's own timestamps carry the answer; the fix is to REPORT the age rather than to
  // guess a threshold here. A rate stated per HOUR is only current if something arrived within the
  // hour, and the surface that prints the units is the one that decides — see VitalsBand's `rate`.
  private _metaActivity(id: string): Activity | null {
    const buf = this.metaSnaps.get(id) || [];
    if (buf.length < 2) return null;
    const t0 = new Date(buf[0].ts).getTime();
    const t1 = new Date(buf[buf.length - 1].ts).getTime();
    const spanHr = Math.max((t1 - t0) / 3600000, 1 / 3600);
    const cadence: number[] = [];
    for (let i = 1; i < buf.length; i++) {
      const dt = (new Date(buf[i].ts).getTime() - new Date(buf[i - 1].ts).getTime()) / 1000;
      cadence.push(dt > 0 ? 3600 / dt : 0);
    }
    const feesDag = buf.map((r) => (r.fee || 0) / 1e8);
    const ticks = new Set(buf.map((r) => r.ts)); // distinct global snapshots it landed in
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    return {
      staleMs: Date.now() - t1,
      snapsPerHour: (buf.length - 1) / spanHr,
      // ⚠️ NOT THE SAME QUANTITY AS THE GLOBAL anchorsPerHour, which is Σ metagraphSnapshotCount
      // — snapshots. This is distinct TICKS LANDED IN, and for a batching network the two differ
      // by an order of magnitude. That is why the vitals do not show it under a filter: one
      // label over two quantities is the drift, and for a single network the honest reading is
      // near-redundant with Snaps/hr anyway, since every metagraph snapshot anchors.
      anchorsPerHour: ticks.size / spanHr,
      blocksPerHour: 0,
      feesPerHour: sum(feesDag) / spanHr,
      samples: buf.length,
      spanHr,
      cadenceSeries: cadence,
      anchoredSeries: cadence, // shape only — its anchoring tracks its snapshot cadence
      blocksSeries: buf.map(() => 0),
      feesSeries: feesDag,
    };
  }

}

export function shortHash(h?: string): string {
  if (!h) return "—";
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}
