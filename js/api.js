// Data layer: pulls live snapshots from the Constellation block explorer API,
// and transparently falls back to a realistic simulation if the network is
// unreachable (e.g. offline). Consumers don't need to know which is which.

import { API_BASE, L0_CLUSTER, L1_CLUSTER, METAGRAPHS, VIS } from "./config.js";

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
    // global snapshot timestamp -> aggregate of the metagraph snapshots anchored
    // into that tick (from the metagraphs we track). NOTE: this is a near-complete
    // lower bound — mainnet anchors ~1-2 more snapshots per tick than our 10 tracked
    // metagraphs surface, so the authoritative anchored COUNT is the global
    // snapshot's own metagraphSnapshotCount; this fee is "from tracked metagraphs".
    this.anchorIndex = new Map(); // ts -> { fee (datum), count, metaIds:Set, metaCounts:Map(id->n) }

    this.metagraphCount = METAGRAPHS.length;
    this.clusters = { l0: [], l1: [] };  // live validator membership
    this.listeners = { global: [], meta: [], status: [], cluster: [], anchor: [], price: [] };
    this.price = null;            // { usd, change24h, marketCap, series } — $DAG market data
    this._timer = null;
    this._simOrdinal = 6_400_000; // plausible starting point for simulation
    this._simHeight = 58_000;
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
      this._setLive(false);
      this._seedSimulation();
    }
    this._emit("global", { reset: true, snapshots: this.globalSnapshots, latest: this.latest });
    await this._fetchClusters();
    await this._refreshMeta(VIS.metaSnapSeed); // seed each metagraph's history
    this._fetchPrice(); // $DAG market data (fire-and-forget; independent of live/sim)
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
        this._emit("cluster", this.clusters);
        return;
      }
    } catch (e) { /* fall back below */ }
    // keep what we have; only synthesize if we have nothing yet
    if (!this.clusters.l0.length) {
      this.clusters = { l0: synthNodes(VIS.fallbackL0), l1: synthNodes(VIS.fallbackL1) };
      this._emit("cluster", this.clusters);
    }
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
    this._clusterTimer = setInterval(() => { if (this.live) this._fetchClusters(); }, VIS.clusterMs);
    this._priceTimer = setInterval(() => this._fetchPrice(), VIS.priceMs);
  }
  stop() {
    clearInterval(this._timer); this._timer = null;
    clearInterval(this._clusterTimer); this._clusterTimer = null;
    clearInterval(this._priceTimer); this._priceTimer = null;
  }

  // $DAG market data from CoinGecko (independent of the live/sim block-explorer
  // feed). One market_chart call yields the current price, 24h change, market cap
  // and a downsampled price series for the header sparkline.
  async _fetchPrice() {
    try {
      const j = await this._fetchJson("https://api.coingecko.com/api/v3/coins/constellation-labs/market_chart?vs_currency=usd&days=1");
      const prices = (j.prices || []).map((p) => p[1]).filter((v) => typeof v === "number");
      if (prices.length < 2) return;
      const usd = prices[prices.length - 1];
      const first = prices[0];
      const change24h = first ? ((usd - first) / first) * 100 : 0;
      const caps = j.market_caps || [];
      const marketCap = caps.length ? caps[caps.length - 1][1] : null;
      // downsample to ~32 points for the tiny sparkline
      const step = Math.max(1, Math.floor(prices.length / 32));
      const series = [];
      for (let i = 0; i < prices.length; i += step) series.push(prices[i]);
      if (series[series.length - 1] !== usd) series.push(usd);
      this.price = { usd, change24h, marketCap, series };
      this._emit("price", this.price);
    } catch (e) { /* keep the previous price */ }
  }

  async _tick() {
    if (this.live) {
      try {
        const json = await this._get(`/global-snapshots/latest`);
        const snap = json.data;
        if (snap && (!this.latest || snap.ordinal > this.latest.ordinal)) {
          this._pushGlobal(snap);
        }
        // occasionally pull each metagraph's newest snapshots (tail)
        if (Math.random() < 0.5) this._refreshMeta(VIS.metaSnapTail);
        return;
      } catch (e) {
        this._setLive(false); // fall through to simulation
      }
    }
    this._simStep();
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
    // awaits would stall the tick. Each falls back to a simulated cadence.
    await Promise.all(METAGRAPHS.map((m) => this._refreshOneMeta(m, limit)));
  }

  async _refreshOneMeta(m, limit = VIS.metaSnapTail) {
    if (m.id && this.live) {
      try {
        const json = await this._get(`/currency/${m.id}/snapshots?limit=${limit}`);
        const list = json.data || [];
        if (list.length) {
          const latest = list[0]; // API returns newest-first
          this.metaState.set(m.name, { ordinal: latest.ordinal, hash: latest.hash, ts: latest.timestamp, real: true });
          // Record full snapshot records (with fee/size) into the rolling buffer.
          this._recordMetaSnaps(m, list.map((s) => ({
            ordinal: s.ordinal, hash: s.hash, parent: s.lastSnapshotHash,
            ts: s.timestamp, fee: s.fee || 0, sizeInKB: s.sizeInKB || 0,
          })));
          this._emit("meta", { name: m.name, ...this.metaState.get(m.name) });
          return;
        }
      } catch (e) { /* fall back to sim below */ }
    }
    // simulated cadence for metagraphs without live snapshots
    const prev = this.metaState.get(m.name);
    const base = prev?.ordinal ?? Math.floor(50_000 + Math.random() * 1_500_000);
    const ordinal = base + Math.floor(Math.random() * 3);
    const sizeInKB = 3 + Math.floor(Math.random() * 6);
    const ts = new Date().toISOString();
    this.metaState.set(m.name, { ordinal, hash: randomHash(), ts, real: false });
    this._recordMetaSnaps(m, [{ ordinal, hash: this.metaState.get(m.name).hash, parent: prev?.hash || randomHash(), ts, fee: sizeInKB * 100_000, sizeInKB }]);
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
      const a = this.anchorIndex.get(r.ts) || { fee: 0, count: 0, metaIds: new Set(), metaCounts: new Map() };
      a.fee += r.fee; a.count += 1; a.metaIds.add(m.id);
      a.metaCounts.set(m.id, (a.metaCounts.get(m.id) || 0) + 1);
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
  getActivity() {
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

  // ---- simulation fallback ----
  _seedSimulation() {
    const now = Date.now();
    const list = [];
    let ord = this._simOrdinal, h = this._simHeight, prevHash = randomHash();
    for (let i = VIS.maxSnapshots; i > 0; i--) {
      const hash = randomHash();
      list.push({
        hash, ordinal: ord++, height: h, subHeight: i,
        lastSnapshotHash: prevHash,
        blocks: simBlocks(),
        metagraphSnapshotCount: simAnchored(),
        timestamp: new Date(now - i * 9000).toISOString(),
      });
      prevHash = hash;
      if (Math.random() < 0.4) h++;
    }
    this._simOrdinal = ord;
    this._simHeight = h;
    this.globalSnapshots = list;
    this.latest = list[list.length - 1];
  }

  _simStep() {
    const prevHash = this.latest?.hash ?? randomHash();
    if (Math.random() < 0.45) this._simHeight++;
    const snap = {
      hash: randomHash(),
      ordinal: this._simOrdinal++,
      height: this._simHeight,
      subHeight: Math.floor(Math.random() * 20),
      lastSnapshotHash: prevHash,
      blocks: simBlocks(),
      metagraphSnapshotCount: simAnchored(),
      timestamp: new Date().toISOString(),
    };
    this._pushGlobal(snap);
    if (Math.random() < 0.5) this._refreshMeta();
  }
}

// Synthetic validator set used only when the cluster API is unreachable, so the
// shells are always populated with a realistic count.
function synthNodes(n) {
  const states = ["Ready", "Ready", "Ready", "Ready", "Observing", "WaitingForDownload"];
  return Array.from({ length: n }, () => ({
    id: randomHash() + randomHash(),
    ip: `${rnd(1, 223)}.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}`,
    state: states[(Math.random() * states.length) | 0],
  }));
}
function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// Simulated anchor count per global snapshot — how many metagraph snapshots it
// settles. Mirrors mainnet, where this varies snapshot to snapshot (~1–24, usually
// around 10) rather than being a constant, so the ribbon's activity bar moves.
function simAnchored() { return 4 + Math.floor(Math.random() * 14); } // 4..17

// Real mainnet global snapshots rarely carry blocks (the layer mostly settles
// metagraph state), so keep block-carrying snapshots uncommon in the sim too —
// the ribbon treats them as a highlight, not the baseline.
function simBlocks() {
  if (Math.random() < 0.88) return [];
  return Array.from({ length: 1 + Math.floor(Math.random() * 4) }, randomHash);
}

export function randomHash() {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 64; i++) s += hex[(Math.random() * 16) | 0];
  return s;
}

export function shortHash(h) {
  if (!h) return "—";
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}
