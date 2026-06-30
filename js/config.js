// Central configuration for the Constellation Hypergraph visualizer.

export const API_BASE = "https://be-mainnet.constellationnetwork.io";

// Live cluster membership (the actual validator sets, ~160 nodes each).
export const L0_CLUSTER = "https://l0-lb-mainnet.constellationnetwork.io/cluster/info";
export const L1_CLUSTER = "https://l1-lb-mainnet.constellationnetwork.io/cluster/info";

export const COLORS = {
  core: 0x2af5ff,   // Global L0 snapshots (the DAG spine)
  l0: 0x5b8cff,     // L0 validators (consensus ring)
  l1: 0xb06bff,     // L1 nodes (transactions & data)
  bg: 0x05060e,
};

// Fallback hub colour for a metagraph the config doesn't know yet (one not in METAGRAPHS).
export const DEFAULT_META_COLOR = 0x8affc1;

// The real mainnet metagraphs (source: dagexplorer). Each pulls live snapshots
// via its id, with a simulated cadence fallback. Colours match the metagraph
// node clusters plotted on the globe (data/metagraphs.json). Keep this list in
// sync with the baked data by re-running scripts/bake-metagraphs.py.
export const METAGRAPHS = [
  { name: "Digital Evidence",    ticker: "DED",      color: 0x36e29a, id: "DAG0eQr94qUQSUhmYGNXt6CoBKWu5K6htvRMGC6M",
    blurb: "DoD-vetted data-fingerprinting as a service — immutable proof of data authenticity, anchored to the Global L0." },
  { name: "Cyberlete",           ticker: "LEET",     color: 0xff7ad9, id: "DAG0rgR8sdn8u2YBYb5Ftjy4zmuqUX3v9XsE2j94",
    blurb: "A competitive-gaming metagraph turning player performance into verifiable on-chain rewards." },
  { name: "PacaSwap",            ticker: "SWAP",     color: 0xffd166, id: "DAG7X5idd4aLfp4XC6WQdG1eDfR3LGPVEwtUUB2W",
    blurb: "A decentralized exchange metagraph for swapping Constellation-ecosystem assets." },
  { name: "USDC.dag",            ticker: "USDC.dag", color: 0x2a9df4, id: "DAG0S16WDgdAvh8VvroR6MWLdjmHYdzAF5S181xh",
    blurb: "A USDC representation issued as a metagraph for fast, feeless transfers on the Hypergraph." },
  { name: "The Upsider AI",      ticker: "UP",       color: 0xff9f5b, id: "DAG7Ghth1WhWK83SB3MtXnnHYZbCsmiRTwJrgaW1",
    blurb: "An AI-insights metagraph validating and settling its data on the Global L0." },
  { name: "National Digifoundry", ticker: "NDT",     color: 0x6be0ff, id: "DAG06z64ifT2HzXoHfMexRfrcnpYFEwMqjFiPKze",
    blurb: "A government & enterprise digital-infrastructure metagraph built on Constellation." },
  { name: "Toughbook Connect",   ticker: "TBC",      color: 0x9b8cff, id: "DAG6oJ5BgUbxjeSYKxgjT1YEUZ3QBS1MN5XkstfT",
    blurb: "Rugged-device connectivity & telemetry validated through a dedicated metagraph." },
  { name: "Common Crawl",        ticker: "CMC",      color: 0x8affc1, id: "DAG7fwxZJpqBpXeHqjomVkvUfC9NgZeQ11qjmB5e",
    blurb: "Open web-crawl data, validated and anchored to the Hypergraph for provenance." },
  { name: "El Paca",             ticker: "PACA",     color: 0xffe066, id: "DAG7ChnhUF7uKgn8tXy45aj4zn9AFuhaZr8VXY43",
    blurb: "A community rewards metagraph — its own token and reward logic, secured by the Global L0." },
  { name: "Dor Technologies",    ticker: "DOR",      color: 0xff5a3c, id: "DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM",
    blurb: "Foot-traffic & commerce data from the Dor Traffic Miner, validated on its own metagraph." },
];

// Anchor position of metagraph i's orbiting cluster in the Hypergraph layout.
// Shared by Layers (the hub mesh) and Globe (where each metagraph's real nodes
// start before they fly out to the map) so the burst originates from the hub.
export function metaAnchor(i, n) {
  const a = (i / n) * Math.PI * 2;
  const incl = (i % 2 === 0 ? 1 : -1) * (0.15 + (i % 3) * 0.12);
  const radius = VIS.metaOrbitRadius + (i % 4) * 3.2;
  return {
    x: Math.cos(a) * radius,
    y: Math.sin(a) * radius * Math.sin(incl) + (i % 2 ? 4 : -3),
    z: Math.sin(a) * radius * Math.cos(incl),
    a, radius, incl,
  };
}

// ---- Snapshots (ledger) view layout (the "settlement chamber") -------------------
// A 3D stack of transparent glass FLOORS (one per layer) on Y, viewed from an angle. Each
// metagraph gets its own Z-LANE; its snapshot blocks lead at x=0 and trail LEFT (-X) along the
// lane (same direction + spacing as the global chain), so a metagraph block and the global block
// it anchored share an X and are linked. The factual flow (Constellation docs): metagraph L1
// (cl1+dl1) → blocks → metagraph L0 → metagraph snapshots → Global L0; DAG L1 → blocks straight
// into the Global L0 snapshot (the global snapshot IS the $DAG ledger's L0). The floor heights are a
// LITERAL "what sits on what" stack (top→bottom) — producers on top, settlement at the base. Floors
// are of TWO kinds: NODE/validator layers, and SNAPSHOT/ledger layers (the OUTPUT an L0 produces —
// the actual artifacts this view is about, NOT a node role):
//   rowProducers  external DATA PRODUCERS — data sources POSTing signed DataUpdates to the metagraph's
//     DATA-L1 (count is metagraph-specific & in no API, so SYMBOLIC: a labelled floor + the flow line,
//     no nodes) ·
//   rowML1  metagraph L1 nodes — cL1 (currency-L1: wallet TRANSACTIONS) + dL1 (data-L1: producer
//     DataUpdates); the producer flow feeds dL1 specifically ·
//   rowML0  metagraph L0 nodes (collect L1 blocks → the snapshot) ·
//   rowMSnap  METAGRAPH SNAPSHOTS — the metagraph L0's ledger output ·
//   rowHypL0  hypergraph L0 nodes — the global validators (the anchor line passes through their
//     cluster, just like it passes through the metagraph L1/L0 clusters) ·
//   rowGL0  GLOBAL SNAPSHOTS — the hypergraph L0's ledger output (the base) ·
//   rowDAGL1  DAG L1 (hypergraph L1) nodes — cL1 only (native $DAG currency; the DAG has no data-L1).
// NODES sit directly ABOVE the SNAPSHOT they produce, consistently (metagraph L0 → metagraph snapshot;
// hypergraph L0 → global snapshot); the DAG L1 below feeds $DAG blocks UP into the global. Even spacing.
// The X axis (time / trailing) is owned by ledger.js (SLOT_SP); this file owns the Z lane geometry
// + the row heights, shared by layers.js, globe.js and ledger.js.
export const LEDGER = {
  depth: 44,        // Z span the metagraph lanes spread over
  rowProducers: 13, // external data producers (symbolic — see note above; the flow line starts here)
  rowML1: 9.5,      // metagraph L1 node floor (cL1 + dL1; validate producer updates into blocks)
  rowML0: 6,        // metagraph L0 node floor (packages blocks into the snapshot)
  rowMSnap: 2.5,    // metagraph SNAPSHOTS floor (the metagraph L0's ledger output)
  rowHypL0: -1,     // hypergraph L0 node floor — global validators; the anchor line passes through them
  rowGL0: -4.5,     // global snapshots floor (hypergraph L0's ledger output) — the base settlement layer
  // TODO: also draw DAG L1 BLOCKS (global.blocks) flowing UP into the global snapshot — most ticks
  // have 0 (settlement, not blocks); only block-carrying ticks would show them.
  rowDAGL1: -8,     // DAG L1 (hypergraph L1) node floor (bottom — feeds blocks up into the global)
  dagCell: 2.8,     // spread radius for the DAG node discs (global L0 + DAG L1) — tight so they're not busy
  dot: 0.34,        // tiny-dot scale factor applied to node spheres in this view
};

// The lead SITE (x,z) of metagraph `i` of `n` — its Z-LANE (a distinct depth), leading at x=0.
// Shared by Layers, Globe's node clusters and Ledger so a metagraph's nodes, rings and chain all
// line up in its lane.
const LANE_SPREAD = 0.62; // fraction of LEDGER.depth the lanes span (see clusterRadius)
export function ledgerSite(i, n) {
  const spread = LEDGER.depth * LANE_SPREAD;
  return { x: 0, z: n > 1 ? (i / (n - 1) - 0.5) * spread : 0 };
}

// The ring/cluster radius for a node group of `count` nodes — grows with count (so the ring fits
// the dots) but is capped to a fraction of the lane spacing so neighbouring rings never overlap.
export function clusterRadius(count) {
  const laneGap = (LEDGER.depth * LANE_SPREAD) / Math.max(1, METAGRAPHS.length - 1); // = ledgerSite's Z step
  const cap = laneGap * 0.46;
  return Math.min(cap, 0.55 + Math.sqrt(Math.max(1, count)) * 0.3);
}

// Small deterministic golden-angle offset for node `k` of `cnt`, spreading a cluster as a flat
// disc ON the floor (X/Z plane) within `radius` — no random jitter.
export function ledgerSpread(k, cnt, radius) {
  if (cnt <= 1) return { x: 0, z: 0 };
  const r = Math.sqrt(k / (cnt - 1)) * radius;
  const a = k * 2.399963229728653; // golden angle
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

// Visual tuning.
export const VIS = {
  maxSnapshots: 52,        // how many global snapshots to keep in the stream (also caps the
                           // LiveStrip bar count — the strip fills with this whole retained window)
  l0Radius: 8,             // Global L0 validator shell (inner)
  l1Radius: 15,            // DAG L1 validator shell (outer)
  metaOrbitRadius: 36,     // base orbit radius for metagraphs — kept well clear of the
                           // validator shells so a focused hub has an emptier backdrop
  pollMs: 4000,            // how often to poll for new snapshots
  clusterMs: 25000,        // how often to refresh validator membership

  // Per-metagraph snapshot history (the shared data layer behind the ribbon's
  // derived DAG fee and the Snapshot DAG / ledger view).
  metaSnapSeed: 60,        // snapshots fetched per metagraph on first load (history);
                           // deep enough that fast metagraphs cover the visible ribbon
  // Snapshots fetched per metagraph on EACH live poll (newest). Must cover the fastest
  // metagraph's output between polls — Dor is extreme: it has put 83 snapshots into ONE global
  // tick (~26 per 4s poll). A small tail made the app miss most of them and mislabel them as
  // "unlisted" anchors. 50 leaves comfortable margin over the worst observed burst so the anchor
  // count stays accurate (an under-count is what inflated the unlisted gap).
  metaSnapTail: 50,
  metaSnapBuffer: 160,     // max snapshots retained per metagraph (rolling) — deep for fast ones
  anchorIndexMax: 400,     // max global-tick timestamps kept in the anchor index
};
