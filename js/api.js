// Data layer: pulls live snapshots from the Constellation block explorer API.
// No simulation — if the API is unreachable the app shows a "no data" state and
// keeps polling, recovering on its own once it responds again (`live` reflects this).

import { API_BASE, COLORS, L0_CLUSTER, L1_CLUSTER, METAGRAPHS, VIS } from "./config.js";

export class NetworkData {
  constructor() {
    this.live = false;            // true once a real fetch succeeds
    this.latest = null;           // most recent global snapshot
    this.globalSnapshots = [];    // rolling buffer, oldest -> newest
    this.metaState = new Map();   // name -> { ordinal, hash, ts, real } (latest, drives hub pulse)

    // Shared per-metagraph snapshot history + the anchor index that joins them to
    // the Global L0 spine. Both the ribbon's derived DAG fee and the ledger view
    // read from these. Keyed by metagraph id.
    this.metaSnaps = new Map();   // id -> [{ ordinal, hash, parent, ts, fee, sizeInKB }] oldest->newest
    // global snapshot timestamp -> aggregate of the metagraph snapshots anchored into that tick
    // (from the metagraphs we track). The authoritative anchored COUNT is the global snapshot's
    // own `metagraphSnapshotCount`; `count` here is how many of those WE identified (the rest =
    // the few genuinely-unlisted metagraphs, ~a couple per tick). To keep `count` accurate even
    // when a fast metagraph (Dor) batches 20+ snapshots into one tick, the live poll fetches a
    // deep tail every tick (VIS.metaSnapTail) — a too-shallow tail used to drop them and inflate
    // the "unlisted" gap. The summed fee is "from tracked metagraphs".
    this.anchorIndex = new Map(); // ts -> { fee (datum), count, metaIds:Set, metaCounts:Map(id->n) }

    this.metagraphCount = METAGRAPHS.length;
    this.clusters = { l0: [], l1: [] };  // live validator membership (raw, two clusters)
    // The DAG modelled as a metagraph-shaped CORE: the l0 + l1 clusters merged by node id
    // into one node-list with `roles` (a machine in both is one hybrid node). Roles stay
    // `l0`/`l1` to match the rest of the app; the DAG's L1 IS its currency-L1, displayed as
    // "cL1" by the UI (it has no data-L1). Same shape metagraphs use → treat it as a core.
    this.dagCore = null;
    this.listeners = { global: [], meta: [], status: [], cluster: [], anchor: [] };
    this._timer = null;
  }

  on(evt, fn) { this.listeners[evt].push(fn); return this; }
  off(evt, fn) { this.listeners[evt] = (this.listeners[evt] || []).filter((f) => f !== fn); return this; }
  _emit(evt, payload) { this.listeners[evt].forEach((f) => f(payload)); }

  async _fetchJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }
  _get(path) { return this._fetchJson(API_BASE + path); }

  // ---- bootstrap: seed the spine with recent history ----
  async init() {
    try {
      const json = await this._get(`/global-snapshots?limit=${VIS.maxSnapshots}`);
      const list = (json.data || []).slice().reverse(); // oldest -> newest
      if (!list.length) throw new Error("empty");
      this.globalSnapshots = list;
      this.latest = list[list.length - 1];
      this._setLive(true);
    } catch (e) {
      // No simulation — a real site stays factual. Show "no data" and recover on a
      // later poll once the API responds again.
      this._setLive(false);
    }
    this._emit("global", { reset: true, snapshots: this.globalSnapshots, latest: this.latest });
    await this._fetchClusters();
    await this._refreshMeta(VIS.metaSnapSeed); // seed each metagraph's history
    this.start();
  }

  // ---- validator membership (the real ~160-node clusters) ----
  async _fetchClusters() {
    try {
      const [l0, l1] = await Promise.all([
        this._fetchJson(L0_CLUSTER),
        this._fetchJson(L1_CLUSTER),
      ]);
      if (Array.isArray(l0) && Array.isArray(l1) && l0.length && l1.length) {
        this.clusters = { l0, l1 };
        this.dagCore = this._buildDagCore(l0, l1);
        this._emit("cluster", { l0, l1, dag: this.dagCore });
        return;
      }
    } catch (e) { /* keep whatever real membership we already have (maybe none) */ }
  }

  // Merge the L0 + L1 validator clusters (keyed by node `id`) into one node-list with
  // `roles` — turning the DAG into the same hybrid/dedicated structure metagraphs use.
  // A machine in both clusters is ONE hybrid node (`roles: ["l0","cl1"]`), not two.
  _buildDagCore(l0, l1) {
    const byId = new Map();
    const merge = (list, role) => {
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
    return {
      id: "dag", name: "DAG", symbol: "DAG", isRoot: true, color: COLORS.core, nodes,
      description:
        "The DAG is the Hypergraph's base network — its Global L0 runs PRO consensus and " +
        "settles every metagraph's snapshots, and its currency-L1 carries $DAG. It's the root " +
        "every metagraph anchors into, secured by $DAG-staked validators.",
    };
  }

  _setLive(v) {
    if (this.live !== v) {
      this.live = v;
      this._emit("status", { live: v });
    } else if (this.latest === null) {
      this._emit("status", { live: v });
    }
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), VIS.pollMs);
    this._clusterTimer = setInterval(() => this._fetchClusters(), VIS.clusterMs);
  }
  stop() {
    clearInterval(this._timer); this._timer = null;
    clearInterval(this._clusterTimer); this._clusterTimer = null;
  }

  async _tick() {
    // Always attempt the live fetch (even while "down"), so the app recovers on its
    // own when the API comes back — no simulation in between.
    try {
      const json = await this._get(`/global-snapshots/latest`);
      const snap = json.data;
      if (snap && (!this.latest || snap.ordinal > this.latest.ordinal)) {
        this._pushGlobal(snap);
      }
      this._setLive(true);
      // Pull each metagraph's newest snapshots EVERY tick (was every other tick) — together with
      // the deeper tail, this keeps up with high-throughput metagraphs (Dor) so their snapshots
      // are all attributed correctly instead of leaking into the "unlisted" count.
      this._refreshMeta(VIS.metaSnapTail);
    } catch (e) {
      this._setLive(false);
    }
  }

  _pushGlobal(snap) {
    this.latest = snap;
    this.globalSnapshots.push(snap);
    if (this.globalSnapshots.length > VIS.maxSnapshots) this.globalSnapshots.shift();
    this._emit("global", { reset: false, snapshot: snap, latest: snap });
  }

  // ---- metagraphs ----
  // `limit` is how many recent snapshots to pull per metagraph: a deep seed on the
  // first load (history), a short tail on each live poll (new arrivals).
  async _refreshMeta(limit = VIS.metaSnapTail) {
    // Refresh every metagraph in parallel — there are ~10 real ones, so serial
    // awaits would stall the tick.
    await Promise.all(METAGRAPHS.map((m) => this._refreshOneMeta(m, limit)));
  }

  async _refreshOneMeta(m, limit = VIS.metaSnapTail) {
    if (!m.id) return;
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
    let list = [];
    for (let i = 0; i < 6; i++) {
      let json;
      try {
        json = await this._get(`/currency/${m.id}/snapshots?limit=${lim}`);
      } catch {
        return; // no data this tick — stay factual, try again next poll
      }
      list = json.data || [];
      if (!list.length) return;
      const oldest = list[list.length - 1].ordinal; // newest-first → last is oldest
      if (haveTo < 0 || oldest <= haveTo + 1 || list.length < lim || lim >= 600) break;
      lim = Math.min(600, lim * 3); // gap not yet covered — fetch deeper and retry
    }

    const latest = list[0]; // newest-first
    this.metaState.set(m.name, { ordinal: latest.ordinal, hash: latest.hash, ts: latest.timestamp, real: true });
    // Record full snapshot records (with fee/size) into the rolling buffer + anchor index.
    this._recordMetaSnaps(m, list.map((s) => ({
      ordinal: s.ordinal, hash: s.hash, parent: s.lastSnapshotHash,
      ts: s.timestamp, fee: s.fee || 0, sizeInKB: s.sizeInKB || 0,
    })));
    this._emit("meta", { name: m.name, ...this.metaState.get(m.name) });
  }

  // Append new snapshot records (dedup by ordinal) to a metagraph's rolling buffer
  // and fold them into the anchor index (grouped by the global-tick timestamp the
  // explorer stamps them with). Emits "anchor" with the timestamps touched so a
  // consumer can refresh a ribbon chip whose fee filled in after it arrived.
  _recordMetaSnaps(m, records) {
    const buf = this.metaSnaps.get(m.id) || [];
    const lastOrd = buf.length ? buf[buf.length - 1].ordinal : -1;
    const fresh = records
      .filter((r) => r.ordinal > lastOrd)
      .sort((a, b) => a.ordinal - b.ordinal); // oldest -> newest
    if (!fresh.length) return;

    for (const r of fresh) {
      buf.push(r);
      const a = this.anchorIndex.get(r.ts) || { fee: 0, count: 0, metaIds: new Set(), metaCounts: new Map(), touched: 0 };
      a.fee += r.fee; a.count += 1; a.metaIds.add(m.id);
      a.metaCounts.set(m.id, (a.metaCounts.get(m.id) || 0) + 1);
      a.touched = Date.now(); // last time this tick's identified count grew → drives "settling"
      this.anchorIndex.set(r.ts, a);
    }
    if (buf.length > VIS.metaSnapBuffer) buf.splice(0, buf.length - VIS.metaSnapBuffer);
    this.metaSnaps.set(m.id, buf);

    // Cap the anchor index (Map keeps insertion order — drop the oldest ticks).
    while (this.anchorIndex.size > VIS.anchorIndexMax) {
      this.anchorIndex.delete(this.anchorIndex.keys().next().value);
    }
    this._emit("anchor", { metaId: m.id, timestamps: fresh.map((r) => r.ts) });
  }

  // Aggregate fee + count of the metagraph snapshots anchored into a given global
  // tick (by timestamp), summed over the metagraphs we track. Returns datum fee
  // (1 DAG = 1e8 datum) — a near-complete lower bound (see anchorIndex note).
  getAnchor(ts) { return this.anchorIndex.get(ts) || null; }

  // Header activity rates + per-snapshot trend series, computed from the global
  // snapshot buffer's real timestamps (so they're stable and correct from first
  // load). Rates are extrapolated to per-HOUR from the buffered window (~5 min):
  //   snapshots/hr, anchors/hr (Σ metagraphSnapshotCount), blocks/hr (Σ blocks).
  // Series are per-snapshot for sparklines: cadence, anchored, blocks, fees (shape
  // only — unit-independent).
  getActivity(filter) {
    // A metagraph selection reads ITS own snapshot stream (cadence + fees it pays), not the
    // global L0 ledger. "all" and the DAG core itself ("dag") are the global L0 view.
    if (filter && filter !== "all" && filter !== "dag") return this._metaActivity(filter);
    const s = this.globalSnapshots;
    if (s.length < 2) return null;
    const anchored = s.map((x) => (typeof x.metagraphSnapshotCount === "number" ? x.metagraphSnapshotCount : 0));
    const blocks = s.map((x) => (Array.isArray(x.blocks) ? x.blocks.length : 0));
    const t0 = new Date(s[0].timestamp).getTime();
    const t1 = new Date(s[s.length - 1].timestamp).getTime();
    const spanHr = Math.max((t1 - t0) / 3600000, 1 / 3600);
    const cadence = [];
    for (let i = 1; i < s.length; i++) {
      const dt = (new Date(s[i].timestamp).getTime() - new Date(s[i - 1].timestamp).getTime()) / 1000;
      cadence.push(dt > 0 ? 3600 / dt : 0);
    }
    // DAG settlement fees per tick (from the anchor index; ~93% lower bound, see
    // anchorIndex note). Drives the header "Fees/hr" stat + its sparkline.
    const feesDag = s.map((x) => { const a = this.anchorIndex.get(x.timestamp); return a ? a.fee / 1e8 : 0; });
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    return {
      snapsPerHour: (s.length - 1) / spanHr,
      anchorsPerHour: sum(anchored) / spanHr,
      blocksPerHour: sum(blocks) / spanHr,
      feesPerHour: sum(feesDag) / spanHr,
      cadenceSeries: cadence,
      anchoredSeries: anchored,
      blocksSeries: blocks,
      feesSeries: feesDag,
    };
  }

  // Per-metagraph activity, the same shape as the global getActivity() but computed from one
  // metagraph's own snapshot buffer: its snapshot cadence, how many distinct global ticks it
  // anchored into, and the $DAG fees it paid. So the Ledger view scopes to the selection.
  _metaActivity(id) {
    const buf = this.metaSnaps.get(id) || [];
    if (buf.length < 2) return null;
    const t0 = new Date(buf[0].ts).getTime();
    const t1 = new Date(buf[buf.length - 1].ts).getTime();
    const spanHr = Math.max((t1 - t0) / 3600000, 1 / 3600);
    const cadence = [];
    for (let i = 1; i < buf.length; i++) {
      const dt = (new Date(buf[i].ts).getTime() - new Date(buf[i - 1].ts).getTime()) / 1000;
      cadence.push(dt > 0 ? 3600 / dt : 0);
    }
    const feesDag = buf.map((r) => (r.fee || 0) / 1e8);
    const ticks = new Set(buf.map((r) => r.ts)); // distinct global snapshots it landed in
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    return {
      snapsPerHour: (buf.length - 1) / spanHr,
      anchorsPerHour: ticks.size / spanHr,
      blocksPerHour: 0,
      feesPerHour: sum(feesDag) / spanHr,
      cadenceSeries: cadence,
      anchoredSeries: cadence, // shape only — its anchoring tracks its snapshot cadence
      blocksSeries: buf.map(() => 0),
      feesSeries: feesDag,
    };
  }

}

export function shortHash(h) {
  if (!h) return "—";
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}
