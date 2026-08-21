// The travelling-packet arcs — the LineSegments + shader material + shared position/colour
// buffers the swarm of comets is drawn into. Split out of js/globe.js (lines 359-478's buffer/
// material setup + `_colorAgent`/`_writeAgent`, and the per-frame buffer writes 989-1015) as the
// RENDER half of the arcs; the SIMULATION half (agent stepping, targeting, arrival detection) is
// the pure `ArcSim` (domain/arcSim). This adapter reads the sim's agents each frame, writes their
// comet geometry into the one shared LineSegments (a single draw call), and applies the sim's
// per-step `flashHits` back onto the node records as `_flash = 0.7` (the sim never touches the
// records — see arcSim's header).
//
// Flash disambiguation: the arc pool mixes validator AND metagraph node records, whose per-mesh
// `index` fields collide (both 0-based). So the endpoints handed to the sim carry a POOL-LOCAL
// index, and `flashHits` (which stores `endpoint.node.index`) therefore indexes `_poolRecs` — the
// records parallel to the pool — with no ambiguity. `_colorAgent` still reads the endpoint's own
// `color`/`base` for the comet tint.

import * as THREE from "three";
import { ARC_TAIL, ARC_TAIL_FRAC, type ArcAgent, type ArcSim } from "../../domain/arcSim";
import { glowBlend, type SceneColors } from "../../sceneColors";

// A node record the flash is applied back onto (validator or metagraph node).
interface FlashRec {
  _flash?: number;
}

export class Arcs {
  private parent: THREE.Group;
  private arcGroup: THREE.Group | null = null;
  private mat: THREE.ShaderMaterial | null = null;
  private arcPos: Float32Array = new Float32Array(0);
  private arcCol: Float32Array = new Float32Array(0);
  private arcPosAttr: THREE.BufferAttribute | null = null;
  private arcColAttr: THREE.BufferAttribute | null = null;
  private _cometPts: THREE.Vector3[] | null = null;
  private _sim: ArcSim | null = null;
  private _poolRecs: FlashRec[] = [];
  // The globe surface's shared camera-facing + closeness uniforms (GeoView builds them; Globe
  // hands them over once). See setFacing.
  private _camN: { value: THREE.Vector3 } = { value: new THREE.Vector3(0, 0, 1) };
  private _close: { value: number } = { value: 0 };
  hasArcs = false;
  // The travelling packets are additive GLOW on the dark ground and normal-blended INK on paper —
  // additive over a 0.965-L background saturates to white and draws nothing. Held as a field
  // because the material is rebuilt on every filter change (see rebuildFrom), so the blend mode has
  // to outlive it. See glowBlend.
  private _blend: THREE.Blending = THREE.AdditiveBlending;

  constructor(parent: THREE.Group) {
    this.parent = parent;
  }

  /** Theme flip: plain data in — rule 1 untouched. Re-points the blend mode of the live material
   *  and of every one the next rebuild makes. */
  setColors(c: SceneColors): void {
    this._blend = glowBlend(c);
    if (this.mat) { this.mat.blending = this._blend; this.mat.needsUpdate = true; }
  }

  // Adopt the surface's facing/closeness uniforms so a comet over the FAR hemisphere fades the
  // same way the walls and the graticule do. The holographic globe deliberately has no opaque
  // body sphere, so there is nothing to depth-occlude an arc — additive lines on the back side
  // otherwise draw at full strength straight through the planet (user, 2026-08-01). Called once,
  // right after buildGeoView; the material picks the refs up when it is next (re)built.
  setFacing(camN?: { value: THREE.Vector3 }, close?: { value: number }): void {
    if (camN) this._camN = camN;
    if (close) this._close = close;
  }

  // js/globe.js:359-427 (`_buildArcs`) minus the agent seeding (that's ArcSim.rebuild). Sizes the
  // shared buffers to the sim's already-seeded agents and bakes their static comet falloff.
  // `poolRecs[i]` is the node record for pool endpoint i, so `flashHits` (endpoint.node.index)
  // maps straight to a record.
  rebuildFrom(sim: ArcSim, poolRecs: FlashRec[]): void {
    if (this.arcGroup) {
      this.arcGroup.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) (m as THREE.Material).dispose(); });
      this.parent.remove(this.arcGroup);
    }
    this.arcGroup = new THREE.Group();
    this.parent.add(this.arcGroup);
    this.mat = null;
    this.hasArcs = false;
    this._sim = sim;
    this._poolRecs = poolRecs;
    const agents = sim.agents;
    if (agents.length === 0) return;

    const vertsPer = (ARC_TAIL - 1) * 2; // LineSegments: one span = two vertices
    const total = agents.length * vertsPer;
    const positions = new Float32Array(total * 3);
    const aTail = new Float32Array(total);
    const colors = new Float32Array(total * 3);
    this._cometPts = this._cometPts || Array.from({ length: ARC_TAIL }, () => new THREE.Vector3());
    this.arcPos = positions;
    this.arcCol = colors;

    for (const ag of agents) {
      // static comet falloff: aTail 0 at the head -> 1 at the tail tip
      for (let j = 0; j < ARC_TAIL - 1; j++) {
        aTail[ag.vstart + j * 2] = j / (ARC_TAIL - 1);
        aTail[ag.vstart + j * 2 + 1] = (j + 1) / (ARC_TAIL - 1);
      }
      this._colorAgent(ag);
      this._writeAgent(ag);
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3); posAttr.setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(colors, 3); colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", posAttr);
    geo.setAttribute("aTail", new THREE.BufferAttribute(aTail, 1));
    geo.setAttribute("aColor", colAttr);
    this.arcPosAttr = posAttr;
    this.arcColAttr = colAttr;

    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: this._blend,
      uniforms: {
        uM: { value: 0 }, // morph fade-in (geography view)
        uCamN: this._camN, // shared with the graticule/walls — see setFacing
        uClose: this._close,
      },
      vertexShader: `
        attribute float aTail; attribute vec3 aColor;
        varying float vB; varying vec3 vColor; varying vec3 vDir;
        void main() {
          vB = 1.0 - aTail;                 // bright (1) at the head -> 0 at the tail tip
          vColor = aColor;
          vDir = normalize(position);       // direction from the globe centre (group-local)
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uM; uniform vec3 uCamN; uniform float uClose;
        varying float vB; varying vec3 vColor; varying vec3 vDir;
        void main() {
          // FACING dim, the surface's own recipe (GeoView's graticule/walls): a comet over the
          // far hemisphere stays faintly present — the hologram reads through — but clearly
          // BEHIND, and damps to near-nothing as the camera closes in, where seeing through the
          // globe was pure noise. The arc apex rises above the surface, so the smoothstep window
          // is what keeps a comet crossing the limb from popping.
          float facing = mix(mix(0.22, 0.03, uClose), 1.0, smoothstep(-0.25, 0.12, dot(vDir, uCamN)));
          float a = vB * vB * uM * facing;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * (0.5 + vB), a);
        }`,
    });
    this.arcGroup.add(new THREE.LineSegments(geo, this.mat));
    this.hasArcs = true;
  }

  // js/globe.js:944 — morph fade-in of the whole swarm (set from setMorph's `extras`, not per hop).
  setUM(v: number): void {
    if (this.mat) this.mat.uniforms.uM.value = v;
  }

  // js/globe.js:990-1015's buffer writes: apply this step's arrival flashes to the node records,
  // rewrite every comet's position, and (when any agent retargeted) repaint their colours. Called
  // only while the arc gate is on (geo view, past the morph midpoint).
  writeFrame(sim: ArcSim, retargeted: boolean): void {
    for (let i = 0; i < sim.flashCount; i++) {
      const rec = this._poolRecs[sim.flashHits[i]];
      if (rec) rec._flash = 0.7; // light up the node it reaches
    }
    for (const ag of sim.agents) this._writeAgent(ag);
    if (this.arcPosAttr) this.arcPosAttr.needsUpdate = true;
    if (retargeted) {
      for (const ag of sim.agents) this._colorAgent(ag); // take on the new destination's colour
      if (this.arcColAttr) this.arcColAttr.needsUpdate = true;
    }
  }

  // Paint one packet's vertices the colour of the node it's heading to (js/globe.js:455-462).
  private _colorAgent(ag: ArcAgent): void {
    const c = ag.to.node.color || ag.to.node.base; // metanode .color / validator .base
    if (!c) return;
    const col = this.arcCol;
    for (let v = 0, n = (ARC_TAIL - 1) * 2; v < n; v++) {
      const ci = (ag.vstart + v) * 3;
      col[ci] = c.r; col[ci + 1] = c.g; col[ci + 2] = c.b;
    }
  }

  // Write a packet's comet into the shared position buffer: ARC_TAIL points trailing the head
  // along its current arc (collapsed onto the node while paused) (js/globe.js:466-478).
  private _writeAgent(ag: ArcAgent): void {
    if (!this._sim) return;
    const pos = this.arcPos, p = this._cometPts!;
    const step = ARC_TAIL_FRAC / (ARC_TAIL - 1);
    const collapsed = ag.state === "pause";
    for (let j = 0; j < ARC_TAIL; j++) {
      this._sim.sampleCurve(ag.curve, collapsed ? 1 : ag.t - j * step, p[j]);
    }
    for (let j = 0; j < ARC_TAIL - 1; j++) {
      const vi = (ag.vstart + j * 2) * 3, A = p[j], B = p[j + 1];
      pos[vi] = A.x; pos[vi + 1] = A.y; pos[vi + 2] = A.z;
      pos[vi + 3] = B.x; pos[vi + 4] = B.y; pos[vi + 5] = B.z;
    }
  }
}
