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
// (The retired seven-floor stack — its rowML1/rowML0/rowHypL0/rowDAGL1 planes and the HYP_SPLIT
// cut — left the geometry with Task 16; their row constants are gone too, so the only heights
// declared below are the two floors FLOOR_Y actually reads.)

import { METAGRAPHS } from "../config";
import { hexCell } from "./nodeLayout";

export const LEDGER = {
  depth: 44,        // Z span the metagraph lanes spread over
  rowMSnap: 2.5,    // metagraph SNAPSHOTS floor (the metagraph L0's ledger output)
  rowGL0: -11,      // global snapshots floor (hypergraph L0's ledger output) — the base settlement layer
  // DAG L1 (hypergraph L1) — native $DAG currency — keeps its own −Z third of the lane field.
  // TODO: draw DAG L1 BLOCKS (global.blocks) flowing from this lane into the global snapshot.
  dagLaneZ: -14.7,  // −Z centre of the reserved 1/3 (−depth/2 + depth/6) — where the DAG-L1 cluster sits
  dot: 0.38,        // node-chip scale in this view — uniform for EVERY cluster (a 3-node metagraph's
                    // dot = a global-L0 dot); shrunk with the tray tightening (user, 2026-08-07)
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

// (The old six-rung LedgerLayerId vocabulary is RETIRED with the layer navigation, 2026-08-06 —
// the floors' shared vocabulary is LedgerFloorId below, and the node layers are per-role
// containers labelled by ledgerRails.ROLE_CODE.)

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
//
// ⚠️ The CAP is what ships, and it moves when the catalog does (found 2026-08-12, adding BioFi as
// the 11th metagraph): more lanes = a narrower Z step = a narrower footprint, and past ~2 nodes the
// growth term is already above the cap, so every real tray gets exactly `cap`. That's the cap doing
// its job — the growth term is the guard for a catalog small enough that lanes are wide. Nodes that
// no longer fit the footprint go UP (ledgerSpread stacks), so a narrower cap makes trays taller, it
// never overlaps chips.
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

/** The floor planes' +Z (screen-left) edge — LedgerView's FLOOR_D/2, promoted here so the
 *  containers can span the plane's full front width. */
/** The seam between the main plane and the gutter plane. */

/** The LEAD slot's X — the whole time trail (lane tiles, byte bars, ribbons) leads well toward
 *  the camera-side floor edge and trails to −X from here (user, 2026-08-07: the snapshots sat
 *  too deep in the plane). The floors' front edge is at ~6.5 local. */
export const LEAD_X = 3.9;

// ── The byte bar (spec §4.2) — fixed height and depth; WIDTH (the Z extent) alone encodes the
// bytes the tick carried. It is CENTERED on the lane field (z0 = -width/2 — user, 2026-08-06;
// replaced the old left-aligned BAR_Z0 start): bands still follow lane order, so the ribbons
// splay symmetrically without crossing.
/** The byte bar's edge margin (user, 2026-08-07): the per-row ORDINAL LABELS live at the
 *  plane's screen-left edge, so even a clipped max-width bar stops short of the lane field on
 *  BOTH sides (centred bar, one margin each end) instead of running into the text. */
export const BAR_EDGE_MARGIN = 2.4;
export const BAR_MAX_W = 2 * (LANE_HALF_Z - BAR_EDGE_MARGIN);
export const BAR_MIN_W = 0.55; // the zero-anchor SEAM: a tick that carried nothing still happened
export const BAR_H = 0.9;
export const BAR_D = 1.6;
/** The snapshots SIT ON their planes (user, 2026-08-07 — they used to be centred on the plane
 *  height and poked through it): bottoms float just above the glass. */
export const TILE_LIFT = 0.05; // metagraph tiles above the msnap plane
export const BAR_LIFT = 0.05;  // byte bars above the gl0 plane

/** EACH METAGRAPH GETS ITS OWN PLANE (user, 2026-08-07): the upper storey is not one shared
 *  floor but one narrow plane per lane (the unknown lane included), separated by visible gaps —
 *  the literal statement that metagraphs are unrelated to each other and only come together on
 *  the global snapshot plane below. */
export const LANE_PLANE_GAP = 0.6;
/** Half the Z extent of one lane's own plane — the lane PITCH (ledgerSite spreads the n
 *  centres over the full field, so pitch = 2·LANE_HALF_Z/(n−1)) minus the separating gap. */
export function lanePlaneHalf(n: number): number {
  const pitch = n > 1 ? (2 * LANE_HALF_Z) / (n - 1) : 2 * LANE_HALF_Z;
  return pitch / 2 - LANE_PLANE_GAP / 2;
}

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
export const BYTE_SCALE_KB = 589; // rebaked 2026-08-16 (traffic ~6.6× the 08-07 bake; the median tick had reached the old reference, so half of all bars clipped)

// ── Node trays (redesign 2026-08-07 — ONE tray per snapshot plane, no role split): glass trays
// hanging under the FRONT (+X, camera-side) edge of the plane their machines serve, facing the
// camera. Layout math lives in ledgerRails.ts (metaTrayLayout/dagTrayLayout/containerChipPos);
// these are the shared literals.
export type RailGroup = "meta" | "dag";

export const CONT_X = 6.2;        // the trays' shared X plane — just inside the floors' front edge
export const CONT_TOP_GAP = 0.15; // floor plane → tray frame top (tight — user 2026-08-07)
export const CONT_CHIP_Z = 0.46;  // chip pitch along Z (columns) — tightened with the smaller chips
export const CONT_ROW_Y = 0.46;   // row pitch downward
export const CONT_PAD = 0.16;     // frame padding around the chip grid — a tight hairline margin
/** The whole plane FIELD's half Z extent: the lane sites span ±LANE_HALF_Z and each end plane
 *  extends lanePlaneHalf beyond its site. The GLOBAL plane spans exactly this, centred — it sits
 *  RIGHT beneath the metagraph planes (user, 2026-08-07: the old label-margin plane read skewed). */
export const PLANE_FIELD_HALF = LANE_HALF_Z + lanePlaneHalf(METAGRAPHS.length + 1);

/** The DAG validator tray's Z extents — the FULL front width of the global floor plane,
 *  inset slightly from both plane edges. (Metagraph trays span their own plane instead.) */
export const CONT_Z0 = -PLANE_FIELD_HALF + 0.4;
export const CONT_Z1 = PLANE_FIELD_HALF - 0.4;

// ── The lane field is FIXED (user reversal, 2026-08-07, of the spec §5.2 committed-lane
// rearrangement): a committed filter no longer moves geometry or hides the other lanes — the
// focus/dim effects carry the emphasis and the CAMERA flies to the committed lane instead
// (Engine's ledgerNetwork resolver). Every lane always owns its own slice.
export type LaneSpan = {
  /** Lane centre in local Z. */
  cz: number;
  /** Half the Z extent this lane may lay tiles across. */
  hz: number;
};

export function laneSpan(i: number, n: number): LaneSpan {
  return { cz: ledgerSite(i, n).z, hz: LANE_HALF_Z / n };
}

// Per-FLOOR camera geometry: the height the floor-focus framing aims at. The old six-rung
// LAYER_GEOM (with its rail rows) went with the layer navigation (2026-08-06) — the two floors
// are the only framable strata left, and they are visual/camera geometry, not pick subjects.
// Ordered top→bottom. Display copy lives in src/data/ledgerLayers.ts, keyed by the same ids.
export const LAYER_GEOM: { id: LedgerFloorId; y: number }[] = [
  { id: "msnap", y: FLOOR_Y.msnap },
  { id: "gl0", y: FLOOR_Y.gl0 },
];

