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

// A metagraph is 3 same-diameter rings (one per layer) at 3 tilts — layer index = ring index.
export const META_LAYERS: ("l0" | "dl1" | "cl1")[] = ["l0", "dl1", "cl1"];
export const META_RING = { radius: 3.6, tilt: 1.15 };

// The DAG core: L0 is an armillary ball; the native $DAG currency (L1 / cl1) is its OWN, clearly
// separated OUTER shell (bigger diameter) so Global L0 and L1 read apart (user).
export const DAG_L0 = { radius: 9, tilt: 1.15 };
export const DAG_L1 = { radius: 12.5, tilt: 1.15 };
