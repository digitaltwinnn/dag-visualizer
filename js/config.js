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

// Visual tuning.
export const VIS = {
  maxSnapshots: 26,        // how many global snapshots to keep in the stream
  l0Radius: 8,             // Global L0 validator shell (inner)
  l1Radius: 15,            // DAG L1 validator shell (outer)
  metaOrbitRadius: 36,     // base orbit radius for metagraphs — kept well clear of the
                           // validator shells so a focused hub has an emptier backdrop
  pollMs: 4000,            // how often to poll for new snapshots
  clusterMs: 25000,        // how often to refresh validator membership
  priceMs: 120000,         // how often to refresh $DAG market data (CoinGecko)

  // Per-metagraph snapshot history (the shared data layer behind the ribbon's
  // derived DAG fee and the Snapshot DAG / ledger view).
  metaSnapSeed: 40,        // snapshots fetched per metagraph on first load (history);
                           // deep enough that fast metagraphs cover the visible ribbon
  metaSnapTail: 8,         // snapshots fetched per metagraph on each live poll (newest)
  metaSnapBuffer: 80,      // max snapshots retained per metagraph (rolling)
  anchorIndexMax: 400,     // max global-tick timestamps kept in the anchor index
};
