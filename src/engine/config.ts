// Central configuration — PURE STATIC DATA the app is parameterized by: API endpoints, the
// palette mirror, the metagraph catalog, and data-polling tuning. Nothing else lives here.
//
// The structural principles (kept deliberately, see also CLAUDE.md → "Engine layer rules"):
//   • NO math and NO derived tables here — per-view layout geometry + layout math live in ONE
//     domain module per view: src/engine/domain/hyperLayout.ts, ledgerLayout.ts, geoLayout.ts.
//   • NO UI copy here — display strings live UI-side (e.g. src/data/ledgerLayers.ts); picks and
//     scene objects carry ids only.
//   • Groups are single-concern: POLL is data cadence/retention, COLORS is the palette mirror.

export const API_BASE = "https://be-mainnet.constellationnetwork.io";

// Live cluster membership (the actual validator sets, ~160 nodes each).
export const L0_CLUSTER = "https://l0-lb-mainnet.constellationnetwork.io/cluster/info";
export const L1_CLUSTER = "https://l1-lb-mainnet.constellationnetwork.io/cluster/info";

// The STATIC mirror of the structural colour tokens in app/globals.css (`:root`). These three values
// equal --primary / --core / --background respectively.
//
// ⚠️ globals.css is the SINGLE SOURCE OF TRUTH. The live 3D scene does NOT read these — it reads the
// actual CSS tokens at boot via src/engine/sceneColors.ts (readSceneColors), so the rendered scene
// always matches the stylesheet. This mirror exists ONLY for the one place that needs a static hex
// with no DOM available: the data/palette layer (src/data, src/palette — SSR + bake scripts).
// sceneColors does NOT fall back to it — readColorToken throws if a token doesn't resolve, rather
// than silently substituting an off-palette hex. Keep it in sync with globals.css; the Engine logs a
// dev-mode warning if the live tokens ever drift from these (see Engine constructor). Scene-only
// derived tones (the geo hologram, node-dim, etc.) are NOT here — they're derived from these bases in
// sceneColors.ts, since nothing outside the DOM scene needs them.
// These are the RESOLVED sRGB values of the oklch tokens (what the browser actually renders — the
// HUD already uses them). NB: they differ slightly from the aspirational hex in the globals.css
// comments (e.g. --primary's oklch resolves to 0x53f2f2, a touch greener than the "#2af5ff" note) —
// the token is canonical, so these mirror the token, not the comment. Update both together if a token
// changes; the Engine dev-warns on drift.
export const COLORS = {
  core: 0x53f2f2,    // = --primary   (accent cyan — the DAG spine)
  dagCore: 0x618df3, // = --core      (DAG hypergraph-core blue — ONE hue; L0/L1 not distinguished)
  bg: 0x010207,      // = --background (scene clear colour)
};

// Fallback hub colour for a metagraph the config doesn't know yet (one not in METAGRAPHS).
export const DEFAULT_META_COLOR = 0x8affc1;

export interface MetaConfig {
  name: string;
  ticker: string;
  color: number;
  id: string;
  blurb: string;
}

// The real mainnet metagraphs (source: dagexplorer). Each pulls live snapshots
// via its id. Colours match the metagraph node clusters plotted on the globe
// (data/metagraphs.json). Keep this list in sync with the baked data by
// refreshing the baked data/*.json snapshot.
export const METAGRAPHS: MetaConfig[] = [
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

// Data polling cadence + retention (was `VIS`, renamed: this group is DATA tuning, not visuals).
export const POLL = {
  maxSnapshots: 52,        // how many global snapshots to keep in the stream (also caps the
                           // LiveStrip bar count — the strip fills with this whole retained window)
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
