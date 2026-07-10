// Pure node-layout math shared by the validator + metagraph node engine. Extracted verbatim
// (with source comments) from js/globe.js:22-84 (GOLDEN_ANGLE / nodeRoles / discFall /
// spreadCoLocated) and :225-230 (fibShellPos) — js/globe.js is deleted (03e57d5). Consumed by
// scene/Globe.ts and scene/objects/NodeFabric.ts.

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
  groupDeg?: number;   // proximity threshold that merges nodes into one co-located group
  spacingDeg?: number; // angular distance between ADJACENT honeycomb cells (hex footprint)
}

// Deterministic CHIP-STACK chunking for one co-located group of K nodes: split K into stack
// heights of STACK_MIN..STACK_MAX (5..10), cycling a fixed height pattern so adjacent stacks
// vary like poker stacks — but every chip is a REAL node and the sizes always sum to K
// (honest chunking, user decision; nothing randomized, same layout every reload). A trailing
// remainder < STACK_MIN is absorbed into the previous stack when it fits, else stands as its
// own short stack (a 3-node site is honestly a 3-chip stack).
export const STACK_MIN = 5;
export const STACK_MAX = 10;
const STACK_PATTERN = [8, 6, 10, 7, 9, 5];
export function stackSizes(K: number): number[] {
  if (K <= STACK_MAX) return K > 0 ? [K] : [];
  const sizes: number[] = [];
  let rem = K;
  let pi = K % STACK_PATTERN.length; // deterministic per-count phase so sites differ from each other
  while (rem > 0) {
    let s = Math.min(STACK_PATTERN[pi++ % STACK_PATTERN.length], rem);
    const after = rem - s;
    if (after > 0 && after < STACK_MIN && after + s <= STACK_MAX) s += after; // absorb tiny remainder
    sizes.push(s);
    rem -= s;
  }
  return sizes;
}

// Axial hex-spiral cell `i` (0 = the centre cell, then ring 1's 6 cells, ring 2's 12, …) as a
// tangent-plane offset in units of the hex NEIGHBOUR distance — adjacent cells are exactly one
// unit apart, so regular hexagons with circumradius = unit/√3 tile EDGE-TO-EDGE (pointy-top
// layout). Used to place co-located chip stacks as a honeycomb (user: attach the hexagons'
// sides, no circular fan).
const HEX_DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export function hexCell(i: number): { x: number; y: number } {
  let q = 0, r = 0;
  if (i > 0) {
    let ring = 1, base = 1;
    while (i >= base + 6 * ring) { base += 6 * ring; ring++; }
    let j = i - base;
    q = -ring; r = ring; // ring start (the SW corner), then walk the six sides
    let side = 0;
    while (j >= ring) { j -= ring; side++; }
    for (let k = 0; k < side; k++) { q += HEX_DIRS[k][0] * ring; r += HEX_DIRS[k][1] * ring; }
    q += HEX_DIRS[side][0] * j; r += HEX_DIRS[side][1] * j;
  }
  return { x: q + r / 2, y: (Math.sqrt(3) / 2) * r }; // axial (pointy-top) → cartesian
}

// Deterministically fan co-located nodes out around their shared point (city-level geolocation
// puts a whole datacenter at one coordinate). Groups the given unit directions by proximity and
// lays each group out as STACKS OF CHIPS: the group is chunked into stack heights (stackSizes
// above), the STACKS get phyllotaxis (sunflower) positions on the local tangent plane, and every
// member of a stack shares its stack's direction plus a LEVEL (0 = on the plateau, 1 = the chip
// above it, …) written into `levels` parallel to `dirs` — the caller bakes the level into the
// node's radial position so co-located nodes read as poker-chip stacks instead of a carpet of
// dots. Mutates the vectors in place; returns the proximity clusters (centre + count + angular
// spread). The heatmap that consumed the clusters is gone — Globe discards the return value; the
// cluster fields remain as the function's tested contract (nodeLayout.test.ts) and debug surface.
const _sx = new THREE.Vector3(), _sy = new THREE.Vector3(), _sh = new THREE.Vector3();
export function spreadCoLocated(
  dirs: THREE.Vector3[],
  { groupDeg = 0.8, spacingDeg = 0.8 }: SpreadOpts = {},
  levels?: number[],
): Cluster[] {
  const cosT = Math.cos(groupDeg * Math.PI / 180);
  const clusters: { center: THREE.Vector3; sum: THREE.Vector3; members: THREE.Vector3[]; count: number; spread: number }[] = [];
  const idxOf = new Map<THREE.Vector3, number>();
  dirs.forEach((d, i) => idxOf.set(d, i));
  const setLevel = (d: THREE.Vector3, lvl: number) => {
    if (levels) levels[idxOf.get(d)!] = lvl;
  };
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
    if (K < 2) {
      if (K === 1) setLevel(c.members[0], 0);
      continue;
    }
    const ctr = c.center;
    // build a tangent basis at the cluster centre
    _sh.set(Math.abs(ctr.y) < 0.92 ? 0 : 1, Math.abs(ctr.y) < 0.92 ? 1 : 0, 0);
    _sx.crossVectors(_sh, ctr).normalize();
    _sy.crossVectors(ctr, _sx).normalize();
    // Chunk the group into chip stacks and place the STACKS as a HONEYCOMB (hexCell spiral,
    // edge-attached — user: no circular fan): `spacingDeg` is the angular distance between
    // ADJACENT hex cells (the caller derives it from the hex footprint so tiles touch).
    const sizes = stackSizes(K);
    const pitch = spacingDeg * Math.PI / 180;
    let maxRR = 0;
    let mi = 0;
    sizes.forEach((size, j) => {
      const cell = hexCell(j);
      const dx = cell.x * pitch, dy = cell.y * pitch;
      maxRR = Math.max(maxRR, Math.hypot(dx, dy));
      for (let l = 0; l < size; l++, mi++) {
        const d = c.members[mi];
        setLevel(d, l);
        d.copy(ctr).addScaledVector(_sx, dx).addScaledVector(_sy, dy).normalize();
      }
    });
    c.spread = maxRR + pitch * 0.5; // the tiled group's angular footprint (test/debug surface)
  }
  return clusters;
}
