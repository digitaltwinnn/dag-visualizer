// Pure node-layout math shared by the validator + metagraph node engine (js/globe.js).
// Extracted verbatim (with source comments) as the domain layer for Task 11's globe.js
// split — the numbers/behaviour are unchanged, js/globe.js is not yet switched over.

import * as THREE from "three";

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (m: number) => m * m * (3 - 2 * m);
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // fibonacci-shell / phyllotaxis spacing

// A node's role set, shared by the DAG core + metagraph nodes. A node (one machine) can run
// several layers; "L0" is a ROLE, not a node kind — so the tooltip names the NETWORK and
// shows the layer(s) as tags (a hybrid lists every one it runs, which is why hovering it
// lights more than one shell). Keyed by node, so every shell of the same machine reads alike.
export const nodeRoles = (
  node: { roles?: string[] } | null | undefined,
  fallback: string,
): string[] => (node && node.roles && node.roles.length ? node.roles : [fallback]);

// View-dependent disc falloff: `facing` = disc-normal · camera-direction (1 = dead
// on, 0 = edge-on at the limb). Discs shrink out before they go edge-on so the
// limb doesn't turn into a cluttered band of slivers.
export const discFall = (facing: number) => THREE.MathUtils.smoothstep(facing, 0.12, 0.42);

// Hypergraph fibonacci-shell position for index `i` of `n` on a shell of radius `rad`,
// flattened on Y by `flatten` (js/globe.js:225-230). Returns a NEW Vector3 — this is
// build-time layout code (run once per node set), not render-loop code, so allocating
// is fine (unlike the render-loop scratch vectors elsewhere in globe.js).
export function fibShellPos(i: number, n: number, rad: number, flatten: number): THREE.Vector3 {
  const y = 1 - (i / Math.max(1, n - 1)) * 2;
  const rr = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = i * GOLDEN_ANGLE;
  return new THREE.Vector3(Math.cos(phi) * rr * rad, y * rad * flatten, Math.sin(phi) * rr * rad);
}

export interface Cluster {
  center: THREE.Vector3;
  count: number;
  spread: number;
}

interface SpreadOpts {
  groupDeg?: number;
  spacingDeg?: number;
  maxDeg?: number;
}

// Deterministically fan co-located nodes out around their shared point so the
// flat discs don't pile on top of each other (city-level geolocation puts a whole
// datacenter at one coordinate). Groups the given unit directions by proximity
// and lays each group out as a phyllotaxis (sunflower) disc on the local tangent
// plane. Mutates the vectors in place; returns the proximity clusters (centre +
// count + angular spread) so the density heatmap can encircle each one.
const _sx = new THREE.Vector3(), _sy = new THREE.Vector3(), _sh = new THREE.Vector3();
export function spreadCoLocated(
  dirs: THREE.Vector3[],
  { groupDeg = 0.8, spacingDeg = 0.32, maxDeg = 2.3 }: SpreadOpts = {},
): Cluster[] {
  const cosT = Math.cos(groupDeg * Math.PI / 180);
  const clusters: { center: THREE.Vector3; sum: THREE.Vector3; members: THREE.Vector3[]; count: number; spread: number }[] = [];
  for (const d of dirs) {
    let best = null;
    for (const c of clusters) if (c.center.dot(d) > cosT) { best = c; break; }
    if (best) { best.members.push(d); best.sum.add(d); best.center.copy(best.sum).normalize(); }
    else clusters.push({ center: d.clone(), sum: d.clone(), members: [d], count: 0, spread: 0 });
  }
  for (const c of clusters) {
    const K = c.members.length;
    c.count = K;
    c.spread = 0;
    if (K < 2) continue;
    const ctr = c.center;
    // build a tangent basis at the cluster centre
    _sh.set(Math.abs(ctr.y) < 0.92 ? 0 : 1, Math.abs(ctr.y) < 0.92 ? 1 : 0, 0);
    _sx.crossVectors(_sh, ctr).normalize();
    _sy.crossVectors(ctr, _sx).normalize();
    // spread grows with sqrt(count) to keep node spacing roughly constant
    const spread = Math.min(maxDeg, spacingDeg * Math.sqrt(K)) * Math.PI / 180;
    c.spread = spread;
    c.members.forEach((d, k) => {
      const rr = spread * Math.sqrt((k + 0.5) / K);
      const th = k * GOLDEN_ANGLE;
      d.copy(ctr)
        .addScaledVector(_sx, Math.cos(th) * rr)
        .addScaledVector(_sy, Math.sin(th) * rr)
        .normalize();
    });
  }
  return clusters;
}
