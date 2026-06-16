// Data layer: pulls live snapshots from the Constellation block explorer API,
// and transparently falls back to a realistic simulation if the network is
// unreachable (e.g. offline). Consumers don't need to know which is which.

import { API_BASE, L0_CLUSTER, L1_CLUSTER, METAGRAPHS, VIS } from "./config.js";

export class NetworkData {
  constructor() {
    this.live = false;            // true once a real fetch succeeds
    this.latest = null;           // most recent global snapshot
    this.globalSnapshots = [];    // rolling buffer, oldest -> newest
    this.metaState = new Map();   // id/name -> { ordinal, lastTs }
    this.metagraphCount = METAGRAPHS.length;
    this.clusters = { l0: [], l1: [] };  // live validator membership
    this.listeners = { global: [], meta: [], status: [], cluster: [] };
    this._timer = null;
    this._simOrdinal = 6_400_000; // plausible starting point for simulation
    this._simHeight = 58_000;
  }

  on(evt, fn) { this.listeners[evt].push(fn); return this; }
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
    await this._refreshMeta();
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
  }
  stop() {
    clearInterval(this._timer); this._timer = null;
    clearInterval(this._clusterTimer); this._clusterTimer = null;
  }

  async _tick() {
    if (this.live) {
      try {
        const json = await this._get(`/global-snapshots/latest`);
        const snap = json.data;
        if (snap && (!this.latest || snap.ordinal > this.latest.ordinal)) {
          this._pushGlobal(snap);
        }
        // occasionally refresh metagraph cadence
        if (Math.random() < 0.5) this._refreshMeta();
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
  async _refreshMeta() {
    const realCount = this.latest?.metagraphSnapshotCount;
    if (typeof realCount === "number") this.metagraphCount = METAGRAPHS.length;

    // Refresh every metagraph in parallel — there are ~10 real ones, so serial
    // awaits would stall the tick. Each falls back to a simulated cadence.
    await Promise.all(METAGRAPHS.map((m) => this._refreshOneMeta(m)));
  }

  async _refreshOneMeta(m) {
    if (m.id && this.live) {
      try {
        const json = await this._get(`/currency/${m.id}/snapshots?limit=1`);
        const snap = (json.data || [])[0];
        if (snap) {
          this.metaState.set(m.name, { ordinal: snap.ordinal, hash: snap.hash, ts: snap.timestamp, real: true });
          this._emit("meta", { name: m.name, ...this.metaState.get(m.name) });
          return;
        }
      } catch (e) { /* fall back to sim below */ }
    }
    // simulated cadence for metagraphs without live snapshots
    const prev = this.metaState.get(m.name);
    const base = prev?.ordinal ?? Math.floor(50_000 + Math.random() * 1_500_000);
    this.metaState.set(m.name, {
      ordinal: base + Math.floor(Math.random() * 3),
      hash: randomHash(),
      ts: new Date().toISOString(),
      real: false,
    });
    this._emit("meta", { name: m.name, ...this.metaState.get(m.name) });
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
        blocks: Array.from({ length: Math.floor(Math.random() * 5) }, randomHash),
        metagraphSnapshotCount: METAGRAPHS.length,
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
      blocks: Array.from({ length: Math.floor(Math.random() * 6) }, randomHash),
      metagraphSnapshotCount: METAGRAPHS.length,
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
