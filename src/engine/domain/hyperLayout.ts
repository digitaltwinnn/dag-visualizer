// Hypergraph-view layout — the per-view layout home for `hyper` (the geo peer is geoLayout.ts, the
// ledger peer is ledgerLayout.ts). Pure data + math: no scene, no react, no store (enforced by
// layerBoundaries.test.ts). config.ts stays pure app parameters; view geometry lives here.

// Base orbit radius for the metagraph hubs — kept well clear of the DAG validator shells so a
// focused hub has an emptier backdrop.
export const META_ORBIT = 36;

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
