// Pure node-layout math shared by the validator + metagraph node engine. Extracted verbatim
// (with source comments) from js/globe.js:22-84 (GOLDEN_ANGLE / nodeRoles / discFall /
// spreadCoLocated) and :225-230 (fibShellPos) — js/globe.js is deleted (03e57d5). Consumed by
// scene/Globe.ts and scene/objects/NodeFabric.ts.

import * as THREE from "three";

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (m: number) => m * m * (3 - 2 * m);
// Quintic smootherstep: zero first AND second derivative at both ends — a pronounced
// slow-start → fast-middle → slow-landing profile (the transition flight's speed curve;
// plain `smooth` reads too mild over the long IN placement window). Shares smoothstep's
// odd symmetry about 0.5 (smoother(1-x) = 1-smoother(x)), which the retarget continuity
// math relies on.
export const smoother = (m: number) => m * m * m * (m * (6 * m - 15) + 10);
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

// ---- Hypergraph ARMILLARY "atom" rings (redesign v2) ---------------------------------------
// (The v1 flat-concentric-rings layout — ringEven/ringStackRadii/ringStackPos — was superseded
// by the armillary functions below within the same redesign and has been removed.)
// Nodes sit on multiple rings of the SAME diameter at DIFFERENT tilt angles (an armillary sphere /
// atom), instead of concentric rings of increasing diameter (which read as one ring spiralling).
// Both Globe (node placement) and HyperView (the tilted cyan hoops) build from `armillaryFrame`,
// so hoops and nodes register. Build-time only (a data event), so allocation here is fine.

export interface RingFrame { t: THREE.Vector3; b: THREE.Vector3 } // the ring's in-plane unit basis

const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);

// The in-plane basis of the k-th of `numRings` rings: a horizontal circle tilted by `tilt` about X,
// then spun about Y to its own azimuth — so every ring shares one diameter but sits at a distinct
// angle, and no two share a pole (each contains ±X spun to a different point).
export function armillaryFrame(k: number, numRings: number, tilt: number): RingFrame {
  const q = new THREE.Quaternion()
    .setFromAxisAngle(_yAxis, (k / Math.max(1, numRings)) * Math.PI)
    .multiply(new THREE.Quaternion().setFromAxisAngle(_xAxis, tilt));
  return {
    t: new THREE.Vector3(1, 0, 0).applyQuaternion(q),
    b: new THREE.Vector3(0, 0, 1).applyQuaternion(q),
  };
}

// The ring PLANE's normal — the axis nodes orbit / hoops face. One home for the t×b
// cross-product three scene sites used to inline (Globe's shell axes, HyperView's hoop normal).
// Writes into `out` (callers pass their own scratch or an event-time temp) and returns it.
export function ringNormal(frame: { t: THREE.Vector3; b: THREE.Vector3 }, out: THREE.Vector3): THREE.Vector3 {
  return out.crossVectors(frame.t, frame.b).normalize();
}

// Position of node j of `count` evenly spaced on the ring described by `frame` at `radius`.
export function ringFramePos(j: number, count: number, radius: number, frame: RingFrame, phase = 0): THREE.Vector3 {
  const a = (j / Math.max(1, count)) * Math.PI * 2 + phase;
  return frame.t.clone().multiplyScalar(Math.cos(a) * radius).addScaledVector(frame.b, Math.sin(a) * radius);
}

// How many rings an armillary of `n` nodes uses — ~`per` nodes per ring, clamped to [min, max].
export function armillaryRings(n: number, per = 22, min = 2, max = 7): number {
  return Math.max(min, Math.min(max, Math.round(Math.max(1, n) / per)));
}

// Place node i of n round-robin across `numRings` armillary rings of `radius` — its XYZ. Each ring
// is filled evenly over its own member count; a per-ring phase staggers the seams.
export function armillaryPos(i: number, n: number, radius: number, numRings: number, tilt: number): THREE.Vector3 {
  const k = i % numRings;
  const onRing = Math.floor((n - 1 - k) / numRings) + 1; // members on ring k
  const j = Math.floor(i / numRings);
  return ringFramePos(j, onRing, radius, armillaryFrame(k, numRings, tilt), k * 0.6);
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
  keys?: string[],
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
    const pitch = spacingDeg * Math.PI / 180;
    // Partition the co-located members by KEY (metagraph id; validators share "dag") so each
    // metagraph forms its OWN chip stacks on its OWN honeycomb cells instead of intermixing at a
    // shared site (user). No keys → one group, i.e. the previous whole-cluster chunking. First-seen
    // key order keeps it deterministic; the key is read by object reference BEFORE members move.
    const groups = new Map<string, THREE.Vector3[]>();
    for (const d of c.members) {
      const k = keys ? keys[idxOf.get(d)!] : "";
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      g.push(d);
    }
    let maxRR = 0;
    let j = 0; // hex-cell index, advancing across every stack of every key-group in this cluster
    for (const members of groups.values()) {
      let mi = 0;
      for (const size of stackSizes(members.length)) {
        const cell = hexCell(j++);
        const dx = cell.x * pitch, dy = cell.y * pitch;
        maxRR = Math.max(maxRR, Math.hypot(dx, dy));
        for (let l = 0; l < size; l++, mi++) {
          const d = members[mi];
          setLevel(d, l);
          d.copy(ctr).addScaledVector(_sx, dx).addScaledVector(_sy, dy).normalize();
        }
      }
    }
    c.spread = maxRR + pitch * 0.5; // the tiled group's angular footprint (test/debug surface)
  }
  return clusters;
}
