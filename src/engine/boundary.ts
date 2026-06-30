// Types for the vanilla js/ modules the Engine drives. The modules stay plain JS
// (no .ts conversion); this just describes their surface from the TypeScript side so
// the Engine's calls are checked. Most of it composes the real @types/three classes —
// only the app-specific wrappers (createScene's return, Layers/Globe, the starfield)
// are hand-written, and even their members are typed THREE objects.

import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import type { Anchor, CountryStat, GeoInfo, GlobalSnapshot, NodeInfo, NodeRow } from "@/src/data/types";

export type GeoMap = Record<string, GeoInfo>;

// A validator node from the NetworkData `cluster` event (always carries an IP).
export interface ClusterNode {
  ip: string;
  state?: string;
  id?: string;
}

// A metagraph as returned by /api/metagraphs (the shape the globe + meta list read).
export interface RouteNode {
  ip: string;
  state?: string;
  layer?: string;
  roles?: string[];
  id?: string;
}
export interface RouteMetagraph {
  id: string;
  name: string;
  symbol?: string;
  description?: string;
  siteUrl?: string;
  nodes: RouteNode[];
}

// The DAG modelled as a metagraph-shaped core (api.js `_buildDagCore`): the L0+L1 validator
// clusters merged by node id into one node-list with `roles` (a hybrid runs several layers).
export interface DagCore {
  id: string;
  name: string;
  symbol?: string;
  description?: string;
  isRoot?: boolean;
  color: number;
  nodes: RouteNode[];
}

// @types/three types BokehPass.uniforms as a bare `object`; the engine reads
// uniforms.focus/maxblur .value, so refine just those.
export type DofPass = BokehPass & {
  uniforms: Record<"focus" | "maxblur", { value: number }>;
};

// Starfield skydome (js/background.js createBackground).
export interface Background {
  mesh: THREE.Object3D;
  update(dt: number, morph: number): void;
}

// js/scene.js createScene() return.
export interface SceneCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  composer: EffectComposer;
  dof: DofPass;
  background: Background;
  resize(): void;
}

// One orbiting metagraph hub record in Layers.metas (only the fields the engine reads).
export interface MetaHub {
  group: THREE.Group;
  cfg: { id: string; name: string; color: number; ticker?: string };
}

// js/layers.js Layers — Hypergraph furniture (core + orbiting hubs).
export interface LayersApi {
  root: THREE.Group;
  coreGroup: THREE.Group;
  metas: MetaHub[];
  focusId: string | null;
  pickables: THREE.Object3D[];
  update(dt: number, morph: number): void;
  setHighlight(focus: string | null): void;
  /** Mark which metagraph hubs have locatable nodes (active); the rest are dimmed inactive. */
  setMetaActive(ids: Set<string> | null): void;
  /** Fire an "anchored into L0" packet from a metagraph's hub toward the core (anchor event). */
  pulseMeta(metaId: string): void;
  /** Flash the core when a new global snapshot lands; strength scales with how much it anchored. */
  flashCore(strength?: number): void;
  /** Snapshots view: lay the hubs into the planar metagraph-L0 row (off restores the orbit). */
  setLedger(on: boolean): void;
}

// js/globe.js Globe — validator + metagraph nodes, heatmap, arcs, filtering, geo focus.
export interface GlobeApi {
  group: THREE.Group;
  nodes: unknown[];
  pickables: THREE.Object3D[];
  /** Per-metagraph node counts per ledger floor (ML0 = l0, ML1 = cl1+dl1) — for ring sizing. */
  ledgerGroups: Record<string, { l0: number; l1: number }>;
  setNodes(dagCore: DagCore, geoMap: GeoMap): void;
  setMetagraphs(list: RouteMetagraph[], geoMap: GeoMap): void;
  setFilter(sel: string): void;
  /** Transient preview dim for a hovered filter chip (null restores the committed filter). */
  setHoverFilter(sel: string | null): void;
  setCountry(cc: string | null): void;
  /** Hover-pairing: glow every layer-shell instance of the hovered node (id), or clear (null). */
  setHoverNode(id: string | null): void;
  /** Persistent selection: keep every layer-shell of the selected node lit, or clear (null). */
  setSelectedNode(id: string | null): void;
  /** A node's live Hypergraph-shell world position (validator/metagraph node) for the camera. */
  hyperWorldPos(id: string | null): THREE.Vector3 | null;
  /** Rotates to the densest part of the selection; returns concentration R (0..1) or null. */
  focusDensest(on: boolean): number | null;
  /** Aims a single node's lat/lon to the front (with tilt); false if it has no coords. */
  focusNode(geo: { lat?: number; lon?: number } | null | undefined): boolean;
  /** Tint the raised-land coastline edge toward a colour (hex), or null for the default. */
  setEdgeColor(color: number | null): void;
  setHighlight(focus: string | null): void;
  setMorph(m: number): void;
  /** Snapshots view: place the shared node meshes into the planar rows (off restores morph layout). */
  setLedger(on: boolean): void;
  update(dt: number): void;
  countryStats(filter?: string): CountryStat[];
  distributionScores(): { scores: Record<string, number>; refId: string | null };
  /** Flat node list for one selection (read-only), for the geo node browser. */
  listNodes(filter?: string): NodeRow[];
}

// js/ledger.js Ledger — the Snapshots (ledger) view's own meshes: the glass floor panes, the
// centred live global snapshot block + its left-trailing chain, the per-metagraph lane blocks,
// the node-group rings and the per-block anchor links/pulses. The producer NODES are the REUSED
// node meshes (globe), placed by globe.js. Driven from the live snapshot buffer.
export interface LedgerApi {
  group: THREE.Group;
  /** The centred snapshot mesh (carries a `snapshot` pick in userData.pick) for raycasting. */
  pickables: THREE.Object3D[];
  /** Re-read the live tick from the Global L0 buffer (oldest→newest) + the per-tick anchor accessor. */
  setData(snaps: GlobalSnapshot[], getAnchor: (ts: string) => Anchor | null): void;
  /** Size each metagraph's node-group rings to its live node counts (from globe.ledgerGroups). */
  setGroupSizes(groups: Record<string, { l0: number; l1: number }>): void;
  /** Keep this snapshot (by global-tick ordinal) coloured in the trail; null = nothing selected. */
  setSelected(ordinal: number | null): void;
  /** Network filter: a single metagraph id neutralises every OTHER lane's tiles/links ("all"/"dag" = none). */
  setFilter(filter: string): void;
  update(dt: number): void;
  dispose(): void;
}

// re-export for the Engine's callback annotations
export type { NodeInfo };
