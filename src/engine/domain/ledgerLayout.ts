// Snapshots (ledger) view layout — the per-view layout home for `ledger` (peers: hyperLayout.ts,
// geoLayout.ts). Pure data + math: no scene, no react, no store (enforced by layerBoundaries.test.ts).
// Layer display COPY (names/descriptions) is deliberately NOT here — it lives UI-side in
// src/data/ledgerLayers.ts; this module owns only geometry.
//
// The view is a TWO-FLOOR chamber (redesign 2026-08-04): only the two SNAPSHOT layers get a glass
// plane, and the four NODE layers ride as RAILS on the front edge of the floor they serve (see
// ledgerRails.ts). Each metagraph gets its own Z-LANE on the upper floor; its snapshot tiles lead
// at x=0 and trail LEFT (-X), so a metagraph tile and the global bar it anchored into share an X.
// The factual flow (Constellation docs): metagraph L1 (cl1+dl1) → blocks → metagraph L0 → metagraph
// snapshots → Global L0; DAG L1 → $DAG blocks into the Global L0 snapshot (the global snapshot IS
// the $DAG ledger's L0). The two floors, top→bottom:
//   rowMSnap  METAGRAPH SNAPSHOTS — the metagraph L0's ledger output. Its rails carry the metagraph
//     L1 + L0 machines (ml1 / ml0) ·
//   rowGL0  GLOBAL SNAPSHOTS — the hypergraph L0's ledger output (the base ledger), drawn as the
//     BYTE BAR whose width is the bytes the tick carried. Its rails carry the hypergraph L1 + L0
//     machines (hypl1 / hypl0).
// NODES therefore still sit with the SNAPSHOT they produce, just on the floor's edge instead of a
// plane of their own; RIBBONS run from a lane's tiles down to that metagraph's band in the bar.
// The X axis (time / trailing) is owned by LedgerView (SLOT_SP); this module owns the Z lane
// geometry, the floor heights and the rail/bar geometry, shared by HyperView, Globe and LedgerView.
// (The retired seven-floor stack — rowML1/rowML0/rowHypL0/rowDAGL1 planes and the HYP_SPLIT cut —
// left the geometry with Task 16; the row constants below stay only where something still reads
// them.)

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

// The settlement-stack layer ids — the six focus rungs. TWO of them are floors (the snapshot
// layers); the other four are NODE layers, which the two-floor redesign renders as RAILS on the
// front edge of the floor they serve (see ledgerRails.ts). Shared vocabulary between this geometry
// table, the scene's pick descriptors, the store's layer pick, and the UI copy table
// (src/data/ledgerLayers.ts). LAYER_GEOM itself lives at the foot of this module — it is derived
// from the floor heights + rail geometry declared further down.
export type LedgerLayerId = "ml1" | "ml0" | "msnap" | "hypl0" | "hypl1" | "gl0";

// The lead SITE (x,z) of metagraph `i` of `n` — its Z-LANE (a distinct depth), leading at x=0.
// Shared by HyperView, Globe's node clusters and LedgerView so a metagraph's nodes, rings and
// chain all line up in its lane.
const LANE_SPREAD = 0.62; // fraction of LEDGER.depth the lanes span (see clusterRadius)
export function ledgerSite(i: number, n: number): { x: number; z: number } {
  const spread = LEDGER.depth * LANE_SPREAD;
  return { x: 0, z: n > 1 ? (i / (n - 1) - 0.5) * spread : 0 };
}

// The ring/cluster radius for a node group of `count` nodes — grows with count (so the ring fits
// the dots) but is capped WELL INSIDE its lane's Z step so a big group's dots never spill into the
// neighbouring lane. (It used to be phrased against the station dial; the dials are retired.)
export function clusterRadius(count: number): number {
  const laneGap = (LEDGER.depth * LANE_SPREAD) / Math.max(1, METAGRAPHS.length - 1); // = ledgerSite's Z step
  const cap = laneGap * 0.3;
  return Math.min(cap, 0.55 + Math.sqrt(Math.max(1, count)) * 0.3);
}

// Deterministic HONEYCOMB + STACK spread for a node cluster (user, 2026-07-12 — the old
// golden-angle disc overlapped chips once a cluster outgrew its footprint; this is geo's chip-stack
// language laid flat on the floor): hex cells of `cellPitch` fill the footprint spiralling out from
// the centre (nodeLayout.hexCell), and when the cells inside `radius` run out the layout goes
// UP — `levelPitch` per level on Y, reusing the same cells — so every chip stays inside the
// footprint and nothing overlaps. All units are the caller's (pre-viewScale). No random jitter.
export function ledgerSpread(
  k: number,
  cnt: number,
  radius: number,
  cellPitch: number,
  levelPitch: number,
): { x: number; y: number; z: number } {
  if (cnt <= 1) return { x: 0, y: 0, z: 0 };
  // How many spiral cells fit inside the footprint (the centre cell always does). The spiral's
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE TWO-FLOOR CHAMBER (redesign 2026-08-04). Only snapshot layers get a plane; the four node
// layers render as RAILS on the front edge of the floor they belong to (see ledgerRails.ts).
//
// Local frame (the group is rotated -90° about Y, so local (x,y,z) → world (-z,y,x)):
//   +X = toward the camera; the lead slot is x=0 and the trail runs to -X.
//   +Y = floor height.
//   +Z = the lane / width field; ledgerSite(0,n).z is the -Z end, screen RIGHT is -Z.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type LedgerFloorId = "msnap" | "gl0";
export const FLOOR_IDS: readonly LedgerFloorId[] = ["msnap", "gl0"];

// The five retired planes are REMOVED, not redistributed — the two survivors keep the heights
// (and therefore the 13.5-unit ribbon run) they already had.
export const FLOOR_Y: Record<LedgerFloorId, number> = {
  msnap: LEDGER.rowMSnap,
  gl0: LEDGER.rowGL0,
};

/** Half the Z extent the metagraph lanes spread over (ledgerSite's outermost |z|). */
export const LANE_HALF_Z = (LEDGER.depth * LANE_SPREAD) / 2;

// ── Gutters (spec §4.5) — a narrow strip beyond the lane field, screen-right (−Z) on both
// floors: the currency status line above, the $DAG blocks below. ~1/6 of the field.
export const GUTTER_W = (2 * LANE_HALF_Z) / 6;
export const GUTTER_CZ = -LANE_HALF_Z - GUTTER_W / 2;

// ── The byte bar (spec §4.2) — fixed height and depth; WIDTH (the Z extent) alone encodes the
// bytes the tick carried. It starts at lane 0's end so band order and lane order agree and the
// ribbons splay without crossing.
export const BAR_Z0 = -LANE_HALF_Z;
export const BAR_MAX_W = 2 * LANE_HALF_Z;
export const BAR_MIN_W = 0.55; // the zero-anchor SEAM: a tick that carried nothing still happened
export const BAR_H = 0.9;
export const BAR_D = 1.6;

/** The fixed scale reference: KB carried at which the bar fills the floor (spec §6.3).
 *  p99 of anchored KB per global tick, measured by scripts/bake-ledger-scale.ts on 2026-08-06
 *  over 1838 ticks (p50 5 · p95 23 · p99 71 · max 149 KB) and inflated by the observed unlisted
 *  byte share. Ticks past this clip at the floor edge and carry an overflow multiplier on their
 *  label. Re-running the sample minutes later moved the p99 by ~2 KB — the constant is meant to be
 *  re-baked when the metagraph set or mainnet traffic changes, not tracked live.
 *  ⚠️ KNOWN GAP in the calibration: the bake sums only the LISTED metagraphs' `sizeInKB` and
 *  applies a flat ×1.08 for unlisted channels, while the bar renders the exact read's
 *  `totalSizeKB` — which counts EVERY channel. So this reference is deliberately approximate and
 *  runs low: live ticks of 80–90 KB were observed within minutes of baking, i.e. the reference is
 *  exceeded more often than "p99" suggests. That is handled honestly (clip + overflow multiplier),
 *  not hidden. A future re-bake should calibrate against exact-read totals instead. */
export const BYTE_SCALE_KB = 77;

// ── Node rails (spec §4.4) — run along Z at the FRONT (+X, camera-side) edge of their floor,
// one rail per non-empty make-up group, stepping toward the camera as more rails appear.
export type RailGroup = "meta" | "dag";
export const RAIL_GROUP_FLOOR: Record<RailGroup, LedgerFloorId> = { meta: "msnap", dag: "gl0" };

export const RAIL_X0 = 3.2;          // the first rail, clear of the lead slot's tiles
export const RAIL_PITCH_X = 1.7;     // step toward the camera per visible rail
export const RAIL_Y_LIFT = 0.35;     // chips stand ON the floor plane
export const RAIL_CHIP_PITCH_Z = 0.62;
export const RAIL_ROW_LIFT = 0.34;   // an over-long rail wraps into stacked rows, chip-stack idiom
/** Machines per rail row before it wraps upward. */
export const RAIL_CAP = Math.floor((2 * LANE_HALF_Z) / RAIL_CHIP_PITCH_Z) + 1;

export function railX(visibleIndex: number): number {
  return RAIL_X0 + visibleIndex * RAIL_PITCH_X;
}

export function railY(group: RailGroup, row: number): number {
  return FLOOR_Y[RAIL_GROUP_FLOOR[group]] + RAIL_Y_LIFT + row * RAIL_ROW_LIFT;
}

// ── The committed-filter rearrangement (spec §5.2): "Committing rearranges the upper floor: the
// lane takes the whole floor, other lanes' tiles leave, rails dim non-member machines." So a lane
// is not merely dimmed under a filter — it gives up its slice, and the committed lane grows into
// the whole Z field so its tiles read at the same size the "all" view gives ten lanes together.
export type LaneSpan = {
  /** Lane centre in local Z. */
  cz: number;
  /** Half the Z extent this lane may lay tiles across. */
  hz: number;
  /** True when another lane is committed and this one lays no tiles at all. */
  hidden: boolean;
};

export function laneSpan(i: number, n: number, committedIdx: number | null): LaneSpan {
  if (committedIdx === null) return { cz: ledgerSite(i, n).z, hz: LANE_HALF_Z / n, hidden: false };
  if (committedIdx === i) return { cz: 0, hz: LANE_HALF_Z, hidden: false };
  return { cz: ledgerSite(i, n).z, hz: LANE_HALF_Z / n, hidden: true };
}

// Per-layer GEOMETRY: the height the layer-focus camera aims at, plus `isRail` (a node layer living
// on a rail, not a plane of its own). `laneZ` is 0 for every rung now — the split hypergraph panes
// are gone, so nothing is laterally offset and the camera never shifts sideways for a layer.
// Ordered top→bottom. Display copy lives in src/data/ledgerLayers.ts, keyed by the same ids.
// (Declared HERE, at the foot of the module, because it reads FLOOR_Y/railY above — hoisting a
// const initializer above them would hit the temporal dead zone at import time.)
export const LAYER_GEOM: { id: LedgerLayerId; y: number; laneZ: number; isRail: boolean }[] = [
  { id: "ml1", y: railY("meta", 0), laneZ: 0, isRail: true },
  { id: "ml0", y: railY("meta", 0), laneZ: 0, isRail: true },
  { id: "msnap", y: FLOOR_Y.msnap, laneZ: 0, isRail: false },
  { id: "hypl0", y: railY("dag", 0), laneZ: 0, isRail: true },
  { id: "hypl1", y: railY("dag", 0), laneZ: 0, isRail: true },
  { id: "gl0", y: FLOOR_Y.gl0, laneZ: 0, isRail: false },
];

