// Reference + regression spec for the hyper<->geo morph-scalar eases. Each is a one-liner
// lifted verbatim (with its source comment) from js/globe.js and the (now deleted)
// src/engine/scene/HyperFurniture.ts. Only `surfFade`/`extrasFade` (consumed by scene/Globe.ts)
// and `R_GLOBE`/`CORE_R` (consumed by scene/views/HyperView.ts) are wired in directly —
// `discWeight`, `hubFade`, `coreGrow`, and `coreReveal` are reimplemented inline instead
// (discWeight in NodeFabric.ts, the other three as local consts in HyperView.ts's update()).
// Any change to those four must be made in BOTH places until a follow-up wires them in (parity-
// gated). The tests colocated with this file are the executable spec of the contract.

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
// the globe. R_GLOBE/CORE_R are the canonical home for these two constants — HyperView
// (src/engine/scene/views/HyperView.ts) imports them from here (Task 15) instead of keeping
// its own copies.
export const R_GLOBE = 16; // must match Globe's R (src/engine/domain/geoLayout.ts) — the radius the core grows out to
export const CORE_R = 3.1; // the core IcosahedronGeometry radius

// HyperFurniture.ts update() — reach the globe's full radius early (by ~0.5) so the core is
// the SAME size as the Earth during the cross-fade, then dissolve sooner to hand off.
export const coreGrow = (m: number) =>
  THREE.MathUtils.lerp(1, R_GLOBE / CORE_R, THREE.MathUtils.clamp(m / 0.5, 0, 1));

// HyperFurniture.ts update() — 1 -> 0 over 0.3..0.65: the core's opacity/emissive envelope as
// it dissolves into the globe.
export const coreReveal = (m: number) => 1 - THREE.MathUtils.clamp((m - 0.3) / 0.35, 0, 1);
