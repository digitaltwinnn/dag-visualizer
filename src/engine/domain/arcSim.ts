// Pure travelling-packet arc simulation shared by the geo view's node engine. Extracted
// verbatim (with source comments) from js/globe.js — js/globe.js is deleted (03e57d5); see the
// inline js/globe.js:NN-NN citations throughout for each piece's exact source lines. Consumed
// by scene/Globe.ts (ArcSim, ArcEndpoint) and scene/objects/Arcs.ts (the render-loop adapter
// this file's comments below refer to as "Task 11" — that split is now in place).
//
// Each "agent" is a comet that hops node -> node: travel along a curved bezier hop, flash on
// arrival, pause a moment, then pick a new target and hop on. js/globe.js kept three concerns
// tangled in one method (`update`): stepping the simulation, mutating `node._flash` directly,
// and rewriting the shared LineSegments position/colour buffers every frame. This module keeps
// ONLY the simulation: arrivals push the arrived node's `index` into a bounded `flashHits`
// buffer instead of touching the node record (the scene-layer `Arcs` adapter from Task 11 reads
// `flashHits` and applies `node._flash = 0.7` + its own decay — the sim has no node-mutation side
// channel at all), and per-frame buffer writes are NOT done here (Task 11's `Arcs.writeFrame`
// calls `sampleCurve` itself to fill the position buffer; `_colorAgent`/`_writeAgent` live there).
//
// `step(dt, false)` is a hard, immediate no-op (zero flash hits, agents byte-for-byte untouched)
// — this is the structural fix for the ledger "red dots" bug (js/globe.js:986-988): stepping the
// arc sim while `mode === "ledger"` was lighting up the reused lane dots via `node._flash`, and
// the guard used to live as an ad-hoc AND clause at the call site. Now the caller (Task 11 /
// Task 14's ViewPolicy) passes the gate explicitly and the sim itself refuses to touch anything
// when it's off.
//
// DEVIATION (documented per the brief's own escape hatch): `arcCurve`'s pre-allocated `out` array
// is filled by hand-evaluating the quadratic bezier (`B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2`)
// rather than calling `THREE.QuadraticBezierCurve3.getPoints()` — that helper always allocates a
// fresh array of fresh `Vector3`s internally (no way to hand it a reusable target per sample), so
// using it here would silently defeat the very allocation fix this function exists to make. The
// resulting curve is numerically identical to the original (verified: t=0 and t=1 samples equal
// the scaled endpoints exactly, matching js/globe.js:432-437's `_arcCurve`).

import * as THREE from "three";
import { R, LAND_H } from "./geoLayout";

// Travelling-packet arcs: each is a short comet that hops node -> node (js/globe.js:35-38).
export const ARC_TAIL = 14; // points making up each comet (longer, smoother tail — user)
export const ARC_TAIL_FRAC = 0.42; // comet length as a fraction of its current arc (user-tuned)
export const ARC_SAMPLES = 24; // bezier samples baked per hop

const DEFAULT_MAX_AGENTS = 40; // js/globe.js:368 hard cap

export interface ArcEndpoint {
  dir: THREE.Vector3;
  node: { color?: THREE.Color; base?: THREE.Color; index: number };
}

export interface ArcAgent {
  from: ArcEndpoint;
  to: ArcEndpoint;
  curve: THREE.Vector3[];
  vstart: number;
  t: number;
  speed: number;
  state: "travel" | "pause";
  pause: number;
}

// Scratch vectors for arcCurve's bezier evaluation — never handed out, only read from into `out`.
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _mid = new THREE.Vector3();

// A curved hop between two unit directions, sampled into `out.length` (== ARC_SAMPLES) points —
// the same outward-bulging bezier the static arcs used (js/globe.js:432-437, `_arcCurve`).
// Fills the PRE-ALLOCATED `out` array in place; never allocates a Vector3 or a new array.
export function arcCurve(dirA: THREE.Vector3, dirB: THREE.Vector3, out: THREE.Vector3[]): void {
  const a = _a.copy(dirA).multiplyScalar(R + LAND_H + 0.02);
  const b = _b.copy(dirB).multiplyScalar(R + LAND_H + 0.02);
  const mid = _mid.copy(a).add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * (1.25 + a.distanceTo(b) / (R * 6)));
  const n = out.length;
  const last = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const t = i / last;
    const it = 1 - t;
    const w0 = it * it, w1 = 2 * it * t, w2 = t * t;
    out[i].set(
      w0 * a.x + w1 * mid.x + w2 * b.x,
      w0 * a.y + w1 * mid.y + w2 * b.y,
      w0 * a.z + w1 * mid.z + w2 * b.z,
    );
  }
}

// Pick the next node to travel to: just another random node in the network (anywhere, not
// necessarily nearby), avoiding staying put (js/globe.js:441-446, `_pickTarget` verbatim).
function pickTarget(pool: ArcEndpoint[], from: ArcEndpoint): ArcEndpoint {
  let c = from;
  for (let k = 0; k < 8 && c === from; k++) c = pool[(Math.random() * pool.length) | 0];
  return c;
}

export class ArcSim {
  agents: ArcAgent[] = [];
  pool: ArcEndpoint[] = [];
  // Pre-sized ring buffer of node indices an agent arrived at THIS step; bounded to the
  // capacity given at construction (default = the historical hard cap of 40 agents, so in
  // the ordinary case — at most one arrival per agent per step — it can never overflow).
  readonly flashHits: Int32Array;
  flashCount = 0;

  constructor(capacity: number = DEFAULT_MAX_AGENTS) {
    this.flashHits = new Int32Array(capacity);
  }

  // js/globe.js:359-397 (`_buildArcs`) agent seeding, minus the buffer/material setup (that's
  // Task 11's `Arcs.rebuildFrom(sim)`). `maxAgents` replaces the hardcoded 40 cap.
  rebuild(pts: ArcEndpoint[], maxAgents: number = DEFAULT_MAX_AGENTS): void {
    this.pool = pts; // nodes the packets route between ({ dir, node })
    this.agents = [];
    if (pts.length < 2) return;

    const N = Math.min(maxAgents, Math.max(6, Math.round(pts.length * 0.8)));
    const vertsPer = (ARC_TAIL - 1) * 2; // LineSegments: one span = two vertices

    for (let i = 0; i < N; i++) {
      const from = pts[(Math.random() * pts.length) | 0];
      const to = pickTarget(pts, from);
      const curve = Array.from({ length: ARC_SAMPLES }, () => new THREE.Vector3());
      arcCurve(from.dir, to.dir, curve);
      this.agents.push({
        from, to, curve, vstart: i * vertsPer,
        t: Math.random(), // spread the swarm along their hops
        speed: 0.15 + Math.random() * 0.20, // hop progress per second — calm drift (user-tuned)
        state: "travel",
        pause: 0,
      });
    }
  }

  // js/globe.js:448-452 (`_sampleCurve` verbatim).
  sampleCurve(curve: THREE.Vector3[], param: number, out: THREE.Vector3): THREE.Vector3 {
    const f = THREE.MathUtils.clamp(param, 0, 1) * (curve.length - 1);
    const i0 = Math.floor(f), i1 = Math.min(curve.length - 1, i0 + 1);
    return out.copy(curve[i0]).lerp(curve[i1], f - i0);
  }

  // js/globe.js:987-1009 minus the buffer writes (`_writeAgent`/`_colorAgent`/needsUpdate flags —
  // those are the scene-layer `Arcs` adapter's job in Task 11). `enabled` is the caller's fully
  // resolved gate (view + morph); when false this is a hard immediate no-op.
  step(dt: number, enabled: boolean): { retargeted: boolean } {
    this.flashCount = 0; // hits are per-step events, consumed by the caller after step returns
    if (!enabled) return { retargeted: false };

    let retargeted = false;
    for (const ag of this.agents) {
      if (ag.state === "travel") {
        ag.t += ag.speed * dt;
        if (ag.t >= 1) {
          ag.t = 1;
          if (this.flashCount < this.flashHits.length) this.flashHits[this.flashCount++] = ag.to.node.index;
          ag.state = "pause";
          ag.pause = 0.8 + Math.random() * 1.8; // dynamic rest before hopping on (calmer cadence)
        }
      } else {
        ag.pause -= dt;
        if (ag.pause <= 0) {
          ag.from = ag.to;
          ag.to = pickTarget(this.pool, ag.from); // route on to a nearby node
          arcCurve(ag.from.dir, ag.to.dir, ag.curve);
          ag.t = 0;
          ag.state = "travel";
          retargeted = true;
        }
      }
    }
    return { retargeted };
  }
}
