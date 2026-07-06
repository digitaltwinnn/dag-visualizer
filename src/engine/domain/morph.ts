// Pure morph-scalar eases driving the hyper<->geo cross-fade. Each is a one-liner lifted
// verbatim (with its source comment) from js/globe.js and src/engine/scene/HyperFurniture.ts
// — extracted here as the domain layer for Task 11's globe.js split; neither source file is
// switched over to call these yet.

import * as THREE from "three";
import { smooth } from "./nodeLayout";

// js/globe.js:859 — how far through the morph the spheres have cross-faded into discs.
// Keep the spheres full-size for the whole flight so their movement reads clearly, then
// cross-fade them into the circles only at the last moment, once the nodes have essentially
// arrived at the globe surface.
export const discWeight = (m: number) => smooth(THREE.MathUtils.clamp((m - 0.82) / 0.16, 0, 1));

// js/globe.js:936 — the globe surface fades in only once nodes are well on their way, so the
// Earth materialises under the arriving nodes instead of veiling them mid-flight.
export const surfFade = (m: number) => smooth(THREE.MathUtils.clamp((m - 0.35) / 0.45, 0, 1));

// js/globe.js:937 — the heatmap/arcs fade in later still than the surface.
export const extrasFade = (m: number) => smooth(THREE.MathUtils.clamp((m - 0.6) / 0.4, 0, 1));

// src/engine/scene/HyperFurniture.ts update() — hubs are fully gone by ~30% into the morph,
// before the root-scale collapse would be noticeable.
export const hubFade = (m: number) => THREE.MathUtils.clamp(1 - m / 0.3, 0, 1);

// The core's morph "core -> globe" transform: the blue Hypergraph heart swells out to the
// globe's radius as the Earth fades in beneath the nodes, so it reads as the core becoming
// the globe. R_GLOBE/CORE_R are re-declared here (not imported from HyperFurniture, a scene/
// module — domain must not import from scene/) matching its literals exactly; HyperFurniture
// should migrate to consume these two constants from here in a later task instead of keeping
// its own copies.
export const R_GLOBE = 16; // must match Globe's R (src/engine/domain/geoMath.ts) — the radius the core grows out to
export const CORE_R = 3.1; // the core IcosahedronGeometry radius

// HyperFurniture.ts update() — reach the globe's full radius early (by ~0.5) so the core is
// the SAME size as the Earth during the cross-fade, then dissolve sooner to hand off.
export const coreGrow = (m: number) =>
  THREE.MathUtils.lerp(1, R_GLOBE / CORE_R, THREE.MathUtils.clamp(m / 0.5, 0, 1));

// HyperFurniture.ts update() — 1 -> 0 over 0.3..0.65: the core's opacity/emissive envelope as
// it dissolves into the globe.
export const coreReveal = (m: number) => 1 - THREE.MathUtils.clamp((m - 0.3) / 0.35, 0, 1);
