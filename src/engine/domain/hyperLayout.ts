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

// ---- Hypergraph ORBITAL layout (redesign) ---------------------------------------------------
// Each network is concentric flat RINGS in the hub's plane. These radii are shared by Globe (which
// places the nodes on them, via nodeLayout's ringEven/ringStackPos) and HyperView (which draws a
// cyan hoop at each radius — the view's structural "surfaces", the geo-globe / ledger-plane peer).

// Per-metagraph LAYER ring radii (L0 inner → data-L1 → currency-L1 outer) + a per-layer seam phase
// so the layers' node seams don't align radially. One even ring per layer.
export const META_SHELL: Record<"l0" | "dl1" | "cl1", number> = { l0: 2.0, dl1: 3.4, cl1: 4.6 };
export const META_SHELL_PHASE: Record<"l0" | "dl1" | "cl1", number> = { l0: 0, dl1: 0.5, cl1: 1.0 };
export const META_LAYERS: ("l0" | "dl1" | "cl1")[] = ["l0", "dl1", "cl1"];

// The DAG core's dense L0 fills a multi-ring "sun" from r0 outward; the native $DAG currency (L1 /
// cl1) gets its OWN clearly-separated ring `cl1Offset` beyond the outermost L0 ring (user: Global
// L0 and L1 must read as separate rings, so the gap is wider than the L0 inter-ring pitch).
export const DAG_RING = { r0: 4, pitch: 1.6, gap: 0.9, cl1Offset: 4.0, cl1Pitch: 1.4, cl1Gap: 0.9 };
