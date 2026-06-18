// Types for the vanilla js/ modules the Engine drives. The modules stay plain JS
// (no .ts conversion); this just describes their surface from the TypeScript side so
// the Engine's calls are checked. Most of it composes the real @types/three classes —
// only the app-specific wrappers (createScene's return, Layers/Globe, the starfield)
// are hand-written, and even their members are typed THREE objects.

import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import type { CountryStat, GeoInfo, NodeInfo } from "@/src/data/types";

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
}
export interface RouteMetagraph {
  id: string;
  name: string;
  symbol?: string;
  description?: string;
  siteUrl?: string;
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
  bloom: UnrealBloomPass;
  dof: DofPass;
  background: Background;
  resize(): void;
}

// One orbiting metagraph hub record in Layers.metas (only the fields the engine reads).
export interface MetaHub {
  group: THREE.Group;
  hub: THREE.Object3D;
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
}

// js/globe.js Globe — validator + metagraph nodes, heatmap, arcs, filtering, geo focus.
export interface GlobeApi {
  group: THREE.Group;
  nodes: unknown[];
  pickables: THREE.Object3D[];
  setNodes(l0: ClusterNode[], l1: ClusterNode[], geoMap: GeoMap): void;
  setMetagraphs(list: RouteMetagraph[], geoMap: GeoMap): void;
  setFilter(sel: string): void;
  setCountry(cc: string | null): void;
  /** Rotates to the densest part of the selection; returns concentration R (0..1) or null. */
  focusDensest(on: boolean): number | null;
  setHighlight(focus: string | null): void;
  setMorph(m: number): void;
  update(dt: number): void;
  countryStats(filter?: string): CountryStat[];
  distributionScores(): { scores: Record<string, number>; refId: string | null };
}

// re-export for the Engine's callback annotations
export type { NodeInfo };
