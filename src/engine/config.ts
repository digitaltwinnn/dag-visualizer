// Central configuration for the Constellation Hypergraph visualizer.

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
// re-running scripts/bake-metagraphs.py.
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

// Anchor position of metagraph i's orbiting cluster in the Hypergraph layout.
// Shared by Layers (the hub mesh) and Globe (where each metagraph's real nodes
// start before they fly out to the map) so the burst originates from the hub.
export function metaAnchor(
  i: number,
  n: number,
): { x: number; y: number; z: number; a: number; radius: number; incl: number } {
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
// A 3D stack of transparent wireframe FLOORS (one per layer) on Y, viewed from an angle. Each
// metagraph gets its own Z-LANE; its snapshot blocks lead at x=0 and trail LEFT (-X) along the
// lane (same direction + spacing as the global chain), so a metagraph block and the global block
// it anchored share an X and are linked. The factual flow (Constellation docs): metagraph L1
// (cl1+dl1) → blocks → metagraph L0 → metagraph snapshots → Global L0; DAG L1 → $DAG blocks into the
// Global L0 snapshot (the global snapshot IS the $DAG ledger's L0). The floor heights are a LITERAL
// "what sits on what" stack (top→bottom):
//   rowML1  metagraph L1 nodes — cL1 (currency-L1: wallet TRANSACTIONS) + dL1 (data-L1: producer
//     DataUpdates) — the top of the visible stack (external producers are not drawn) ·
//   rowML0  metagraph L0 nodes (collect L1 blocks → the snapshot) ·
//   rowMSnap  METAGRAPH SNAPSHOTS — the metagraph L0's ledger output ·
//   rowHypL0  hypergraph L0 nodes — the global validators (the anchor line threads through their
//     cluster). This floor is CUT along Z: the 2/3 (+Z/centre) is hypergraph L0; the −Z 1/3 is a
//     reserved lane for rowDAGL1 (hypergraph L1 — native $DAG currency), at the SAME height ·
//   rowGL0  GLOBAL SNAPSHOTS — the hypergraph L0's ledger output (the base settlement layer).
// NODES sit directly ABOVE the SNAPSHOT they produce (metagraph L0 → metagraph snapshot; hypergraph
// L0 → global snapshot); DAG L1 is a peer of hypergraph L0 (its own −Z third of that plane), both
// feeding down into the global snapshot. The X axis (time / trailing) is owned by LedgerView
// (SLOT_SP); this file owns the Z lane geometry + the row heights, shared by HyperView, Globe and
// LedgerView. Layer NAMES live in the Snapshots·Explore panel (LedgerPanel), not on the planes.
export const LEDGER = {
  depth: 44,        // Z span the metagraph lanes spread over
  // Floor heights, wider-spaced (gap ~5) and with NO producers floor. The DAG L1 is no longer a lone
  // bottom floor: it sits at the hypergraph-L0 HEIGHT but in its OWN Z-lane (rowDAGL1 == rowHypL0 +
  // dagLaneZ) — a distinct "$DAG currency" lane beside the central global column, both feeding down
  // into the global snapshot. Symmetric with the metagraph lanes rather than marooned at the base.
  rowML1: 16,       // metagraph L1 node floor (cL1 + dL1; validate producer updates into blocks)
  rowML0: 9.25,     // metagraph L0 node floor (packages blocks into the snapshot)
  rowMSnap: 2.5,    // metagraph SNAPSHOTS floor (the metagraph L0's ledger output)
  rowHypL0: -4.25,  // hypergraph L0 node floor — global validators; the anchor line passes through them
  rowGL0: -11,      // global snapshots floor (hypergraph L0's ledger output) — the base settlement layer
  // DAG L1 (hypergraph L1) — native $DAG currency. Same HEIGHT as hypergraph L0, in its own −Z third
  // of that plane (a plane cut 2/3 L0 + 1/3 L1). TODO: draw DAG L1 BLOCKS (global.blocks) flowing
  // from this lane into the global snapshot.
  rowDAGL1: -4.25,  // == rowHypL0 (shares the hypergraph-L0 level; its own −Z third of that plane)
  dagLaneZ: -14.7,  // −Z centre of the reserved 1/3 (−depth/2 + depth/6) — where the DAG-L1 cluster sits
  dagCell: 2.8,     // spread radius for the DAG node discs (global L0 + DAG L1) — tight so they're not busy
  dot: 0.34,        // tiny-dot scale factor applied to node spheres in this view
  // Whole-view ORIENTATION applied to the ledger so it frames well under the SHARED overview camera
  // (the one hyper/geo use) — the camera never moves on a view switch; the ledger GROUP is rotated/
  // tilted/scaled instead, and the SAME transform is baked into every node's ledger position (Globe)
  // so planes + nodes stay aligned. viewRotY (Y) sets the diagonal — trail recedes to the top-left,
  // lead sits bottom-right; viewTiltX (X) leans the stack a touch so it reads a bit steeper; viewScale
  // sizes it up in frame. Order: tilt(X) ∘ rot(Y).
  // At REST the ledger sits central/untilted (trail receding straight away from the shared
  // camera): free 3D navigation feels right when the resting pose is axis-aligned — the nice
  // DIAGONAL view is now the layer-focus camera move instead (Engine._focusLayer, on selecting a
  // layer), and users are encouraged to orbit freely everywhere.
  viewRotY: -Math.PI / 2, // lanes spread on X; time recedes on −Z (keeps the depth-fog recency)
  viewTiltX: 0,           // no resting lean
  viewScale: 1.5,         // bigger in frame without moving the camera
};

// The settlement-stack LAYERS as SUBJECTS — id (matches LedgerView's floor planes) + display
// name/description + floor height. ONE source shared by the Snapshots·Explore panel (rows), the
// scene (plane pick descriptors), and the layer-focus camera (y). Ordered top→bottom.
export const LEDGER_LAYERS: { id: string; name: string; desc: string; y: number }[] = [
  { id: "ml1", name: "Metagraph L1", desc: "Currency-L1 (wallet transactions) and data-L1 (producer updates) validate incoming work into blocks.", y: LEDGER.rowML1 },
  { id: "ml0", name: "Metagraph L0", desc: "Collects those L1 blocks into the metagraph's snapshot.", y: LEDGER.rowML0 },
  { id: "msnap", name: "Metagraph snapshots", desc: "Each metagraph's ledger output — they anchor into a global snapshot.", y: LEDGER.rowMSnap },
  { id: "hypl0", name: "Hypergraph L0", desc: "The Global L0 validators that produce the global snapshot.", y: LEDGER.rowHypL0 },
  { id: "hypl1", name: "Hypergraph L1", desc: "The native $DAG currency — its own lane beside L0.", y: LEDGER.rowDAGL1 },
  { id: "gl0", name: "Global snapshots", desc: "The base settlement: where every metagraph snapshot anchors.", y: LEDGER.rowGL0 },
];

// The lead SITE (x,z) of metagraph `i` of `n` — its Z-LANE (a distinct depth), leading at x=0.
// Shared by Layers, Globe's node clusters and Ledger so a metagraph's nodes, rings and chain all
// line up in its lane.
const LANE_SPREAD = 0.62; // fraction of LEDGER.depth the lanes span (see clusterRadius)
export function ledgerSite(i: number, n: number): { x: number; z: number } {
  const spread = LEDGER.depth * LANE_SPREAD;
  return { x: 0, z: n > 1 ? (i / (n - 1) - 0.5) * spread : 0 };
}

// The ring/cluster radius for a node group of `count` nodes — grows with count (so the ring fits
// the dots) but is capped to a fraction of the lane spacing so neighbouring rings never overlap.
export function clusterRadius(count: number): number {
  const laneGap = (LEDGER.depth * LANE_SPREAD) / Math.max(1, METAGRAPHS.length - 1); // = ledgerSite's Z step
  const cap = laneGap * 0.46;
  return Math.min(cap, 0.55 + Math.sqrt(Math.max(1, count)) * 0.3);
}

// Small deterministic golden-angle offset for node `k` of `cnt`, spreading a cluster as a flat
// disc ON the floor (X/Z plane) within `radius` — no random jitter.
export function ledgerSpread(
  k: number,
  cnt: number,
  radius: number,
): { x: number; z: number } {
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
