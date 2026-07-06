// Types for the vanilla js/ modules the Engine drives. The modules stay plain JS
// (no .ts conversion); this just describes their surface from the TypeScript side so
// the Engine's calls are checked. Most of it composes the real @types/three classes —
// only the app-specific wrappers (createScene's return, Globe, the starfield)
// are hand-written, and even their members are typed THREE objects.

import type {
  ClusterNode,
  DagCore,
  GeoMap,
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

// LedgerView (src/engine/scene/views/LedgerView.ts) is now the typed TS class — imported directly
// by Engine.ts over the LedgerModel domain state machine, so no boundary interface is needed here.

// re-export for the Engine's callback annotations
export type { NodeInfo };
