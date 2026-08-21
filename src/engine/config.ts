// Central configuration — PURE STATIC DATA the app is parameterized by: API endpoints, the
// palette mirror, the metagraph catalog, and data-polling tuning. Nothing else lives here.
//
// The structural principles (kept deliberately, see also CLAUDE.md → "Engine layer rules"):
//   • NO math and NO derived tables here — per-view layout geometry + layout math live in ONE
//     domain module per view: src/engine/domain/hyperLayout.ts, ledgerLayout.ts, geoLayout.ts.
//   • NO UI copy here — display strings live UI-side (e.g. src/data/ledgerLayers.ts); picks and
//     scene objects carry ids only.
//   • Groups are single-concern: POLL is data cadence/retention, COLORS is the palette mirror.

// Every network's own host set. The scheme is uniform (be- / l0-lb- / l1-lb- prefixes) except
// the DAG Explorer directory, the ONE host that takes the network in its PATH.
export type NetworkId = "mainnet" | "integrationnet" | "testnet";

export interface NetworkDef {
  /** Block-explorer API (snapshot reads, node-params). */
  be: string;
  /** Global L0 load balancer — cluster info, raw global snapshots. */
  l0: string;
  /** DAG L1 load balancer — cluster info. */
  l1: string;
  /** The DAG Explorer metagraph directory. */
  directory: string;
}

export const NETWORKS: Record<NetworkId, NetworkDef> = {
  mainnet: {
    be: "https://be-mainnet.constellationnetwork.io",
    l0: "https://l0-lb-mainnet.constellationnetwork.io",
    l1: "https://l1-lb-mainnet.constellationnetwork.io",
    directory: "https://production.dagexplorer-api.constellationnetwork.net/mainnet",
  },
  integrationnet: {
    be: "https://be-integrationnet.constellationnetwork.io",
    l0: "https://l0-lb-integrationnet.constellationnetwork.io",
    l1: "https://l1-lb-integrationnet.constellationnetwork.io",
    directory: "https://production.dagexplorer-api.constellationnetwork.net/integrationnet",
  },
  testnet: {
    be: "https://be-testnet.constellationnetwork.io",
    l0: "https://l0-lb-testnet.constellationnetwork.io",
    l1: "https://l1-lb-testnet.constellationnetwork.io",
    directory: "https://production.dagexplorer-api.constellationnetwork.net/testnet",
  },
};

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

// The real mainnet metagraphs (source: dagexplorer). Each pulls live snapshots via its id. Keep
// this list in sync with the live route's directory — there is no baked copy to diff it against
// (data/metagraphs.json was deleted deliberately), so a metagraph the directory lists and this
// file doesn't is only visible as a raw address in the UI. `scripts/bake-brand-hues.ts` now reads
// that same live directory, so re-running it is the other half of adding a row here.
// One catalog per network. Ids are globally unique across networks (verified 2026-08-20:
// PacaSwap's mainnet and testnet ids differ), so data/brand-hues.json stays one flat id-keyed
// file. Dev-network rows carry color: 0 — the SENTINEL for "no seed": configPins() skips it
// (src/palette/identity.ts), so a dev metagraph's hue comes from its baked brand pin or the
// hash fallback, never from 18 rows sharing one seed. (DEFAULT_META_COLOR is NOT the sentinel
// on purpose — mainnet's Common Crawl row genuinely seeds that value.)
export const CATALOG: Record<NetworkId, MetaConfig[]> = {
  mainnet: [
    // ⚠️ BioFi was MISSING here while the live route listed it (found 2026-08-12), and the symptom
    // is what "keep this in sync" is guarding: HyperExplore renders `metagraphById(m.id)?.name ?? m.id`,
    // so its row read as the raw `DAG2JaVh5…` address next to ten real names. `color` is only the SEED
    // for `configPins()`, which the baked `data/brand-hues.json` overlay shadows for every listed
    // metagraph (`identityPins()` — brand WINS), so it is inert wherever a bake exists: BioFi's
    // identity is the baked `#00c050`, not this pink, exactly as every other row here diverges from
    // its own brand read. `blurb` is likewise the route's own `description`, the fallback shown only
    // until `/api/metagraphs` answers.
    { name: "BioFi",               ticker: "BIOFI",    color: 0xed9bf4, id: "DAG2JaVh5yYiPCGLLEFi6tfkKk77WA4FzivVdBek",
      blurb: "A utility token uniting an ecosystem focused on safeguarding personal data and protecting users from fraud." },
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
  ],
  integrationnet: [
    { name: "ChainStats", ticker: "STATS", color: 0, id: "DAG6BDkunF5NcyneYvgaEZTZiyF18QUdr7XuC3oY",
      blurb: "Decentralized nodes aggregating and validating on-chain data to democratize access to blockchain information." },
    { name: "Digital Evidence", ticker: "DED", color: 0, id: "DAG0chGHJTDN17VdgedukaZCxAPXwospruMoPL1E",
      blurb: "DoD-vetted data-fingerprinting as a service — immutable proof of data authenticity via a simple API." },
    { name: "BLDR", ticker: "BLDR", color: 0, id: "DAG2uPStsfJvszi559PFgY8VoJM2pKmvBC2u93Z4",
      blurb: "Decentralized validation and incentivization of social data and community interactions." },
    { name: "ACY", ticker: "ACY", color: 0, id: "DAG1JkGeewaTBHMLwk6aehofLbjoSxZ8DKo1yvA4",
      blurb: "ACY." },
    { name: "PacaSwap", ticker: "SWAP", color: 0, id: "DAG5bjTe13TY8GB6AN9HXiTCPXHJhdK5AFEMZfvx",
      blurb: "A scalable, secure trading environment for swapping L0 tokens, earning rewards and governance." },
    { name: "ACX", ticker: "ACX", color: 0, id: "DAG1jF8FDHEC8VhZwpVyyc6zDy8XE7JRAAAypmhr",
      blurb: "ACX." },
    { name: "The Void", ticker: "HALO", color: 0, id: "DAG4iv2b5XE9WNc7fLeyvF2bFkHkmCqhXZMrQH6N",
      blurb: "A decentralized platform for builders and organizations to tokenize applications, services and data." },
    { name: "Hypermatrix", ticker: "HPMX", color: 0, id: "DAG0svaNZVPenLPujZ3hgHcYK2MmZJVyF4QjkaTk",
      blurb: "A streamlined, easy-to-integrate Web3 solution for game developers." },
    { name: "The Upsider AI", ticker: "UP", color: 0, id: "DAG3GzFbfN6m5uEQpS6PwYHmTUZ373d5VWPA4uUi",
      blurb: "An AI-agent metagraph introducing new users to Constellation with challenges rewarded in $DAG." },
    { name: "BioFi", ticker: "BIOFI", color: 0, id: "DAG06mK9MUCiUchQnEwgqvSAcNmwKowgudWWf3ga",
      blurb: "A utility token uniting an ecosystem focused on safeguarding personal data and protecting users from fraud." },
    { name: "Common Crawl", ticker: "CMC", color: 0, id: "DAG3qrtBnL8Zc9QjTPX9YW9v79eJdFNeS6YnLWjK",
      blurb: "Open web-crawl data, validated and anchored to the Hypergraph for provenance." },
    { name: "AutoSight", ticker: "AUTO", color: 0, id: "DAG7VNFvsf65gvVCYPkxVZYd2xYAsq4KFBYr8gKn",
      blurb: "Reward token minted to users for contributing image data to the AutoSight metagraph." },
    { name: "El Paca", ticker: "PACA", color: 0, id: "DAG1GH7r7RX1Ca7MbuvqUPT37FAtTfGM1WYQ4otZ",
      blurb: "A meme-utility token rewarding community members for engaging in network activities." },
    { name: "Cyberlete", ticker: "LEET", color: 0, id: "DAG8CHWAjGJP7JfHnHJ8BZ53AA4kq8xhniZZJRVY",
      blurb: "Tournament and engagement data processed through consensus validation on a metagraph." },
    { name: "Intrana", ticker: "INT", color: 0, id: "DAG3spUrLbFXgxhhapFRjLj72P7WV2f4h9f98dXV",
      blurb: "Intrana utility token." },
    { name: "National Digifoundry", ticker: "NDT", color: 0, id: "DAG387n6WmUQXfE6zyAd6R5EiYhmgQjWxt2e8NKP",
      blurb: "A national collaboration fostering continuous innovation in the digital asset ecosystem." },
    { name: "Metagraph Token", ticker: "MGT", color: 0, id: "DAG4dWrdALPQmvF5UBpuXrqdkMHea1H5f7rjb4qY",
      blurb: "Metagraph used for testing purposes." },
    { name: "Dor Technologies", ticker: "DOR", color: 0, id: "DAG5kfY9GoHF1CYaY8tuRJxmB3JSzAEARJEAkA2C",
      blurb: "Foot-traffic & commerce data from the Dor Traffic Miner, validated on its own metagraph." },
  ],
  testnet: [
    { name: "PacaSwap", ticker: "SWAP", color: 0, id: "DAG1VF44t1ZaxK9gknpEYRysm3MBm7rsxhaARUGb",
      blurb: "A scalable, secure trading environment for swapping L0 tokens, earning rewards and governance." },
    { name: "ACX", ticker: "ACX", color: 0, id: "DAG6kKgcDKGWiT6paYfaqTAXxFZUaJWjbp9wjtyk",
      blurb: "ACX." },
    { name: "ACY", ticker: "ACY", color: 0, id: "DAG6tBEdBr1KsBByorcag2e2rAmhnL1hPV9fnfVD",
      blurb: "ACY." },
    { name: "Dor Technologies", ticker: "DOR", color: 0, id: "DAG8gMagrwoJ4nAMjbGx17WB5D6nqBEPZYChc3zH",
      blurb: "Foot-traffic & commerce data from the Dor Traffic Miner, validated on its own metagraph." },
    { name: "Constellation Test Token", ticker: "CTT", color: 0, id: "DAG5j83gnnxMX1S5ZAZAszU9CRxsqJLxtRmyFPj6",
      blurb: "Metagraph used for testing purposes." },
  ],
};


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
