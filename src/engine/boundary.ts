// Types for the vanilla js/ modules the Engine drives. The modules stay plain JS
// (no .ts conversion); this just describes their surface from the TypeScript side so
// the Engine's calls are checked. Most of it composes the real @types/three classes —
// only the app-specific wrappers (createScene's return, Globe, the starfield)
// are hand-written, and even their members are typed THREE objects.

import type * as THREE from "three";
import type {
  Anchor,
  ClusterNode,
  DagCore,
  GeoMap,
  GlobalSnapshot,
  NodeInfo,
  RouteMetagraph,
  RouteNode,
} from "@/src/data/types";

// ClusterNode, RouteNode, RouteMetagraph, DagCore and GeoMap now live in ./types
// (moved there in the api.ts/geoResolve.ts port) — re-exported here so existing
// importers of ./boundary keep working until boundary.ts is retired.
export type { ClusterNode, DagCore, GeoMap, RouteMetagraph, RouteNode };

// DofPass, Background and SceneCtx now live in ./scene/SceneContext + ./scene/objects/Background
// (moved there in the scene.js/background.js port) — re-exported here so existing
// importers of ./boundary keep working until boundary.ts is retired.
export type { DofPass, SceneCtx } from "./scene/SceneContext";
export type { Background } from "./scene/objects/Background";

// HyperView (src/engine/scene/views/HyperView.ts) is now the type — imported directly
// by Engine.ts, so no boundary interface is needed here. `MetaHubRec` (metas entries) is
// exported from that module.

// js/globe.js Globe is now the typed TS class src/engine/scene/Globe.ts (imported directly by
// Engine.ts) — no boundary interface is needed for it any longer.

// js/ledger.js Ledger — the Snapshots (ledger) view's own meshes: the glass floor panes, the
// centred live global snapshot block + its left-trailing chain, the per-metagraph lane blocks,
// the node-group rings and the per-block anchor links/pulses. The producer NODES are the REUSED
// node meshes (globe), placed by globe.js. Driven from the live snapshot buffer.
export interface LedgerApi {
  group: THREE.Group;
  /** Identity SCENE-lane colour map (id -> 0xRRGGBB), handed in by the Engine so the ledger's
   *  lane tiles / anchor rings / links / pulses match the metagraphs' identity hue (not config). */
  sceneColors?: Record<string, number>;
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
