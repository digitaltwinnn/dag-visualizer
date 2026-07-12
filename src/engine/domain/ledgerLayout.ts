// Snapshots (ledger) view layout — the per-view layout home for `ledger` (peers: hyperLayout.ts,
// geoLayout.ts). Pure data + math: no scene, no react, no store (enforced by layerBoundaries.test.ts).
// Layer display COPY (names/descriptions) is deliberately NOT here — it lives UI-side in
// src/data/ledgerLayers.ts; this module owns only geometry.
//
// The view is a 3D stack of transparent wireframe FLOORS (one per layer) on Y, viewed from an
// angle. Each metagraph gets its own Z-LANE; its snapshot blocks lead at x=0 and trail LEFT (-X)
// along the lane (same direction + spacing as the global chain), so a metagraph block and the
// global block it anchored share an X and are linked. The factual flow (Constellation docs):
// metagraph L1 (cl1+dl1) → blocks → metagraph L0 → metagraph snapshots → Global L0; DAG L1 → $DAG
// blocks into the Global L0 snapshot (the global snapshot IS the $DAG ledger's L0). The floor
// heights are a LITERAL "what sits on what" stack (top→bottom):
//   rowML1  metagraph L1 nodes — cL1 (currency-L1: wallet TRANSACTIONS) + dL1 (data-L1: producer
//     DataUpdates) — the top of the visible stack (external producers are not drawn) ·
//   rowML0  metagraph L0 nodes (collect L1 blocks → the snapshot) ·
//   rowMSnap  METAGRAPH SNAPSHOTS — the metagraph L0's ledger output ·
//   rowHypL0  hypergraph L0 nodes — the global validators (the anchor line threads through their
//     cluster). This floor is CUT along Z (HYP_SPLIT below): the 2/3 (+Z/centre) is hypergraph L0;
//     the −Z 1/3 is a reserved lane for rowDAGL1 (hypergraph L1 — native $DAG currency), at the
//     SAME height ·
//   rowGL0  GLOBAL SNAPSHOTS — the hypergraph L0's ledger output (the base settlement layer).
// NODES sit directly ABOVE the SNAPSHOT they produce (metagraph L0 → metagraph snapshot;
// hypergraph L0 → global snapshot); DAG L1 is a peer of hypergraph L0 (its own −Z third of that
// plane), both feeding down into the global snapshot. The X axis (time / trailing) is owned by
// LedgerView (SLOT_SP); this module owns the Z lane geometry + the row heights, shared by
// HyperView, Globe and LedgerView.

import { METAGRAPHS } from "../config";
import { hexCell } from "./nodeLayout";

export const LEDGER = {
  depth: 44,        // Z span the metagraph lanes spread over
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
  dot: 0.55,        // node-sphere scale in this view — uniform for EVERY cluster (a 3-node metagraph's
                    // dot = a global-L0 dot; small groups get presence from the station DIAL, not dot size)
  // Whole-view ORIENTATION applied to the ledger so it frames well under the SHARED overview camera
  // (the one hyper/geo use) — the camera never moves on a view switch; the ledger GROUP is
  // rotated/scaled instead, and the SAME transform is baked into every node's ledger position
  // (Globe) so planes + nodes stay aligned. At REST the ledger sits central/untilted (trail
  // receding straight away from the camera): free 3D navigation feels right when the resting pose
  // is axis-aligned — the nice DIAGONAL view is the layer-focus camera move (Engine._focusLayer).
  viewRotY: -Math.PI / 2, // lanes spread on X; time recedes on −Z (keeps the depth-fog recency)
  viewTiltX: 0,           // no resting lean
  viewScale: 1.5,         // bigger in frame without moving the camera
};

// The hypergraph-L0 level's 2/3 + 1/3 split along Z (shared by LedgerView's panes and the
// layer-focus camera): the seam sits at the 1/3 mark, a small gap separates the two sub-panes.
const HYP_SEAM = -LEDGER.depth / 2 + LEDGER.depth / 3;
const HYP_GAP = 3.5;
export const HYP_SPLIT = {
  gap: HYP_GAP,
  l1Edge: HYP_SEAM - HYP_GAP / 2, // hypergraph-L1 pane's inner (+Z) edge
  l0Edge: HYP_SEAM + HYP_GAP / 2, // hypergraph-L0 pane's inner (−Z) edge
  l1Cz: (-LEDGER.depth / 2 + HYP_SEAM - HYP_GAP / 2) / 2, // −Z third centre
  l0Cz: (HYP_SEAM + HYP_GAP / 2 + LEDGER.depth / 2) / 2,  // +Z 2/3 centre
};

// The settlement-stack layer ids — one per floor plane (the split hypergraph level contributes
// two). Shared vocabulary between this geometry table, the scene's pick descriptors, the store's
// layer pick, and the UI copy table (src/data/ledgerLayers.ts).
export type LedgerLayerId = "ml1" | "ml0" | "msnap" | "hypl0" | "hypl1" | "gl0";

// Per-layer GEOMETRY (height + the pane's lane-centre Z — non-zero only for the split hypergraph
// panes; the layer-focus camera shifts laterally so the pane sits centred in frame). Ordered
// top→bottom. Display copy lives in src/data/ledgerLayers.ts, keyed by the same ids.
export const LAYER_GEOM: { id: LedgerLayerId; y: number; laneZ: number }[] = [
  { id: "ml1", y: LEDGER.rowML1, laneZ: 0 },
  { id: "ml0", y: LEDGER.rowML0, laneZ: 0 },
  { id: "msnap", y: LEDGER.rowMSnap, laneZ: 0 },
  { id: "hypl0", y: LEDGER.rowHypL0, laneZ: HYP_SPLIT.l0Cz },
  { id: "hypl1", y: LEDGER.rowDAGL1, laneZ: HYP_SPLIT.l1Cz },
  { id: "gl0", y: LEDGER.rowGL0, laneZ: 0 },
];

// The lead SITE (x,z) of metagraph `i` of `n` — its Z-LANE (a distinct depth), leading at x=0.
// Shared by HyperView, Globe's node clusters and LedgerView so a metagraph's nodes, rings and
// chain all line up in its lane.
const LANE_SPREAD = 0.62; // fraction of LEDGER.depth the lanes span (see clusterRadius)
export function ledgerSite(i: number, n: number): { x: number; z: number } {
  const spread = LEDGER.depth * LANE_SPREAD;
  return { x: 0, z: n > 1 ? (i / (n - 1) - 0.5) * spread : 0 };
}

// The ring/cluster radius for a node group of `count` nodes — grows with count (so the ring fits
// the dots) but is capped WELL INSIDE the station dial (DIAL_R below) so a big group's dots never
// poke outside their dial.
export function clusterRadius(count: number): number {
  const laneGap = (LEDGER.depth * LANE_SPREAD) / Math.max(1, METAGRAPHS.length - 1); // = ledgerSite's Z step
  const cap = laneGap * 0.3;
  return Math.min(cap, 0.55 + Math.sqrt(Math.max(1, count)) * 0.3);
}

// The station DIAL radius — ONE fixed size for every metagraph regardless of node count (the
// resting identity mark; the ledger's analog of the hypergraph hubs). Sized so neighbouring
// lanes' dials keep clear spacing even with the tick tips (the dial geometry's ticks reach
// 1.2× its radius): 2 × 0.38 × 1.2 = 0.912 of the lane gap, leaving ~9% air between dials.
// The global L0 / DAG L1 clusters use the SAME dial (user, 2026-07-12 — one size in
// design and code; with the honeycomb-stack spread their bigger fleets simply stack HIGHER
// inside the same footprint; the old larger DIAL_R_GLOBAL + its dagCell disc are gone).
export const DIAL_R = ((LEDGER.depth * LANE_SPREAD) / Math.max(1, METAGRAPHS.length - 1)) * 0.38;

// Deterministic HONEYCOMB + STACK spread for a node cluster (user, 2026-07-12 — the old
// golden-angle disc overlapped chips once a cluster outgrew its dial; this is geo's chip-stack
// language laid flat on the floor): hex cells of `cellPitch` fill the dial spiralling out from
// the centre (nodeLayout.hexCell), and when the cells inside `radius` run out the layout goes
// UP — `levelPitch` per level on Y, reusing the same cells — so every chip stays inside the
// dial and nothing overlaps. All units are the caller's (pre-viewScale). No random jitter.
export function ledgerSpread(
  k: number,
  cnt: number,
  radius: number,
  cellPitch: number,
  levelPitch: number,
): { x: number; y: number; z: number } {
  if (cnt <= 1) return { x: 0, y: 0, z: 0 };
  // How many spiral cells fit inside the dial (the centre cell always does). The spiral's
  // per-ring distances aren't strictly monotonic, so stop at the FIRST cell that pokes out —
  // every used cell is provably inside.
  let capacity = 1;
  while (capacity < cnt) {
    const c = hexCell(capacity);
    if (Math.hypot(c.x, c.y) * cellPitch > radius) break;
    capacity++;
  }
  const cell = hexCell(k % capacity);
  return {
    x: cell.x * cellPitch,
    y: Math.floor(k / capacity) * levelPitch,
    z: cell.y * cellPitch,
  };
}
