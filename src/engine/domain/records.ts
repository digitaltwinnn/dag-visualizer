// Plain-data node records built by the validator/metagraph node engine (js/globe.js). These
// are the objects pushed into `this.nodes` (js/globe.js:243-258) and `this.metaNodes`
// (js/globe.js:549-571) — typed verbatim from those two record literals as the domain layer
// for Task 11's globe.js split. Renderer-free: no THREE.Object3D/Mesh/Group field except
// `hubGroup`, narrowed to the two things globe.js reads off it — its live local position and its
// WORLD position (the hyper structure is tilted, so the anchor must resolve through the tilt).

import * as THREE from "three";
import type { PickDescriptor } from "@/src/data/types";

// js/globe.js:243-258 — one instance per DAG validator node (per layer shell it runs: an L0
// node gets one record for its l0 shell, a hybrid also gets one for its cl1 shell).
export interface ValidatorRecord {
  index: number;
  layer: "l0" | "cl1";
  roles: string[];
  nodeId?: string;
  geoPrimary: boolean;
  ready: boolean;
  base: THREE.Color;
  ledgerPos: THREE.Vector3;
  ledgerHide: boolean;
  hyperPos: THREE.Vector3;
  hyperDir: THREE.Vector3;
  hyperRadius: number;
  geoDir: THREE.Vector3 | null;
  trueDir: THREE.Vector3 | null;
  geoRadius: number;
  noGeo: boolean;
  hyperSize: number;
  geoSize: number;
  azimuth: number;
  spinAxis: THREE.Vector3;
  spinSpeed: number;
  spinPhase: number;
  pick: PickDescriptor;
  /** Brief flash when an arc pulse reaches this node — set dynamically (js/globe.js:996), absent until then. */
  _flash?: number;
}

// js/globe.js:549-571 — one instance per metagraph node PER layer shell it runs (l0 / dl1 /
// cl1), same "hybrid appears in each shell" rule as ValidatorRecord. Metagraph nodes are only
// ever built from `located = m.nodes.filter((node) => geoMap[node.ip])` (js/globe.js:523), so
// unlike ValidatorRecord this record has no `noGeo`/`ready` fields — every metagraph node
// record is already known-geolocated, and readiness isn't tracked per metagraph node. Likewise
// there's no per-record `geoRadius`: `geoPos` is derived straight from `geoDir` using the same
// shared `R + LAND_H + 0.02` constant every validator uses (js/globe.js:801).
export interface MetaNodeRecord {
  metaId: string;
  layer: "l0" | "dl1" | "cl1";
  color: THREE.Color;
  index: number;
  /** The orbiting hub (HyperFurniture.metas[].group) this metagraph's nodes cluster around in
   *  the Hypergraph, or null if the hub isn't available. Narrowed to its position so this
   *  record stays renderer-free (no THREE.Group in the domain layer). */
  hubGroup: Pick<THREE.Object3D, "position" | "getWorldPosition"> | null;
  offset: THREE.Vector3;
  ledgerPos: THREE.Vector3;
  geoPrimary: boolean;
  nodeId: string;
  hyperPos: THREE.Vector3;
  /** Filled in by the co-located fan-out (spreadCoLocated) after construction — starts at the origin. */
  geoPos: THREE.Vector3;
  geoDir: THREE.Vector3;
  trueDir: THREE.Vector3;
  hyperSize: number;
  geoSize: number;
  spinAxis: THREE.Vector3;
  spinSpeed: number;
  spinPhase: number;
  dim: number;
  dimTarget: number;
  pick: PickDescriptor;
  /** Brief flash when an arc pulse reaches this node — set dynamically (js/globe.js:1109), absent until then. */
  _flash?: number;
}
