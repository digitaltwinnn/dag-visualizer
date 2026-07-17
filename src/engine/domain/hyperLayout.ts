// Hypergraph-view layout — the per-view layout home for `hyper` (the geo peer is geoLayout.ts, the
// ledger peer is ledgerLayout.ts). Pure data + math: no scene, no react, no store (enforced by
// layerBoundaries.test.ts). config.ts stays pure app parameters; view geometry lives here.

// Base orbit radius for the metagraph hubs — kept well clear of the DAG validator shells (cL1 at
// ~14) so a focused hub has an emptier backdrop. Pulled in 36 → 25 so the whole hub ring fits the
// frame in the top-down resting pose (shorter tethers to the core) instead of dollying the camera
// back (user).
export const META_ORBIT = 25;

// Anchor position of metagraph i's orbiting cluster in the Hypergraph layout.
// Shared by HyperView (the hub mesh) and Globe (where each metagraph's real nodes
// start before they fly out to the map) so the burst originates from the hub.
export function metaAnchor(
  i: number,
  n: number,
): { x: number; y: number; z: number; a: number; radius: number; incl: number } {
  const a = (i / n) * Math.PI * 2;
  const incl = (i % 2 === 0 ? 1 : -1) * (0.15 + (i % 3) * 0.12);
  const radius = META_ORBIT + (i % 4) * 3.2;
  return {
    x: Math.cos(a) * radius,
    y: Math.sin(a) * radius * Math.sin(incl) + (i % 2 ? 4 : -3),
    z: Math.sin(a) * radius * Math.cos(incl),
    a, radius, incl,
  };
}

// ---- Hypergraph ARMILLARY layout (redesign v2) ----------------------------------------------
// Each network is an "atom": rings of the SAME diameter at DIFFERENT tilt angles (armillaryFrame in
// nodeLayout), not concentric rings of increasing diameter. Shared by Globe (node placement) and
// HyperView (the tilted cyan hoops it draws from the same frames), so they can't drift.

// A metagraph is 3 rings — one per layer — at DIFFERENT radii (L0 inner → dL1 → cL1 outer) so the
// layers read distinct (like the DAG's L0/L1), each with a shallow tilt (near-flat, user) at a
// different orientation for the atom feel. layer key → radius.
export const META_LAYERS: ("l0" | "dl1" | "cl1")[] = ["l0", "dl1", "cl1"];
export const META_RING = { radii: { l0: 2.6, dl1: 4.0, cl1: 5.4 }, tilt: 0.28 };

// The DAG core: L0 is a near-flat armillary of just a FEW same-diameter rings; the native $DAG
// currency (L1 / cl1) is its OWN, clearly separated OUTER shell (bigger diameter) so Global L0 and
// L1 read apart (user).
export const DAG_L0 = { radius: 9, tilt: 0.28 };
export const DAG_L1 = { radius: 12.5, tilt: 0.28 };

// The Hypergraph structure (nodes + hubs + core, spread across the globe group, HyperView.root and
// HyperView.coreGroup) is TILTED by this angle about X so it reads from the SHARED overview camera
// — instead of moving the camera to a top-down pose (which every other view then has to tween away
// from, user). At the full ~77° the ring normal aligns exactly with the overview camera axis and the
// rings present as flat circles (too top-down, user); pulling it back to ~41° leaves the rings tilted
// well off that axis, so they present as strong ellipses with real 3D perspective — in the overview
// AND the focused atom (hyperFocusFraming views along the same normal). All three groups share this
// exact tilt so the tilted node rings stay registered with the cyan hoops.
export const HYPER_TILT = 0.72;
