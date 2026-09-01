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
import { glowBlend, isLightGround, type SceneColors } from "../../sceneColors";
import { joinBloom } from "../SceneContext";

// A node record the flash is applied back onto (validator or metagraph node).
interface FlashRec {
  _flash?: number;
}

/**
 * THE HEAD IS A LIGHT; THE TRAIL IS ITS PATH. One packet, two marks, and on paper they answer the
 * ground question with OPPOSITE answers — which is why the head is a mesh of its own rather than
 * the bright end of the trail's vertex ramp.
 *
 * The trail is where the packet HAS BEEN: a path drawn on the wall, so it takes `glowBlend`'s ink
 * on paper like every other piece of furniture, and wave 8 judged it right ("fine ink trails").
 *
 * ⚠️ AND SO, IN THE END, DOES THE HEAD — corrected 2026-09-01, after the user reported the light
 * ground twice: first that the arcs were "hardly visible", then that the heads were "still too
 * light/bright". Both are the same mistake made at two strengths, and the record of the wrong
 * reasoning is kept here because it is a persuasive wrong reasoning.
 *
 * The old argument ran: the head is the packet ITSELF, a travelling light, and a light that fades
 * into the wall the moment the ground turns pale is not a light — so it stays ADDITIVE on both
 * grounds. It leaned on the scene's light ground being SILVER rather than the HUD's paper
 * (`--scene-ground` sits ~184/255 against the page's ~240, "marks can exceed the ground"), and
 * spent that headroom on a bigger point with a whiter core.
 *
 * What that misses is the DIRECTION additive can move. Adding light to a 0.72-L ground can only
 * push toward white, so every knob meant to make the spark READ — more size, more white in the
 * core, the selective bloom halo on top — moved it closer to the ground it was trying to stand
 * against, and the compensation made the wash worse. The 70 bytes of headroom are real; they are
 * just not enough to build a mark out of, while the ~180 bytes BELOW the silver are.
 *
 * So on paper the head is the DENSEST INK in the swarm, not the brightest light: normal-blended, a
 * deepened version of its own hue, and no bigger than it needs to be. The packet still leads its
 * trail — it is darker and more saturated than the path behind it, which is exactly the same
 * hierarchy the dark ground states with brightness, expressed for a ground that reads by contrast
 * downward. On black nothing changes: it is the hot white-cored spark it always was.
 *
 * The head — the head ALONE — joins BLOOM_LAYER, which on the dark ground bleeds a halo the
 * additive dot cannot draw for itself. On paper the mark is dark, so it feeds that pass almost
 * nothing and the layer costs nothing to leave it in. The TRAIL must stay out either way: it is a
 * wide soft sheet of near-identical ink, and blurred it would smear the whole swarm into one
 * coloured fog — the same reason the ledger's ribbons are excluded.
 */
const HEAD_TUNE_DEFAULTS = Object.freeze({
  size: 5.5,     //  point diameter in CSS px at the resting geo distance
  sizeMin: 3,    //  px floor — a spark zoomed out must still be a spark, not a speck
  sizeMax: 26,   //  px ceiling — and zoomed in it must not become a blob
  paperMul: 1.15, //  how much bigger the head runs on silver. It was 2 while the head was a
                  //  washed-out additive blob and the size was compensating; ink needs no such
                  //  help, and a big dark dot reads as a bug rather than as a packet.
  core: 0.85,    //  weight of the tight hot centre over the coloured skirt
  white: 0.45,   //  how far that centre pushes toward white — DARK GROUND ONLY. On paper the head
                 //  has no white in it at all; see paperInk.
  paperInk: 0.92, //  how deep the paper head's ink runs, as a fraction of its own hue. This is the
                  //  mark's whole colour there — no skirt/core summing, which under a normal blend
                  //  would clip straight to white at the centre.
                  //  ⚠️ NEAR 1 ON PURPOSE (user, 2026-09-01: "now a darker color than the chips;
                  //  make the overall color lighter and closer to the chip colors"). The first ink
                  //  pass deepened the hue to 0.42 to buy contrast, which bought it against the
                  //  NODE CHIPS instead of against the ground — a packet arriving at a chip read as
                  //  a different, darker network. A packet and the node it travels to are the same
                  //  identity and must wear the same colour. The head still LEADS its trail, but
                  //  through ALPHA (below), not through a darker tint: same hue, more of it.
  alpha: 1,      //  overall additive weight
});

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
  // The comet HEADS — their own Points mesh, and the only member of BLOOM_LAYER here. See the
  // HEAD_TUNE_DEFAULTS header for why the head is a separate mark from the trail it leads.
  private headMat: THREE.ShaderMaterial | null = null;
  private headPos: Float32Array = new Float32Array(0);
  private headCol: Float32Array = new Float32Array(0);
  private headPosAttr: THREE.BufferAttribute | null = null;
  private headColAttr: THREE.BufferAttribute | null = null;
  // The ground question, hoisted at event time (setColors) so the per-frame path is plain writes.
  private _paper = false;

  constructor(parent: THREE.Group) {
    this.parent = parent;
  }

  /** Theme flip: plain data in — rule 1 untouched. Re-points the blend mode of the live material
   *  and of every one the next rebuild makes. The HEAD keeps its additive blend on both grounds
   *  (see HEAD_TUNE_DEFAULTS) — only its weight themes, through the uniforms below. */
  setColors(c: SceneColors): void {
    this._blend = glowBlend(c);
    this._paper = isLightGround(c);
    if (this.mat) { this.mat.blending = this._blend; this.mat.needsUpdate = true; this._stageTrail(this.mat); }
    if (this.headMat) this._stageHead(this.headMat);
  }

  /** ⚠️ SWAPPING THE BLEND IS ONLY HALF THE GROUND QUESTION (user, 2026-09-01: the arcs "are great
   *  in dark-mode, but in light-mode hardly visible"). `glowBlend` re-pointed the trail from
   *  additive glow to normal-blended ink — correct, and it is why the trail is DRAWN on paper — but
   *  its WEIGHT stayed authored for the dark ground, where the mark adds light to black and a long
   *  faint tail still reads. Composited as ink over the 0.72-L silver, that same weight is a tint
   *  nobody can see. This is exactly the second answer `inkPresence` gives for marks whose presence
   *  is baked into a vertex colour; the arcs bake theirs into the fragment ALPHA, so they need it
   *  here instead. Two terms translate, both riding one 0/1 uniform so the dark path is untouched:
   *
   *    · the FALLOFF. `vB*vB` is an additive curve — light accumulates, so a quadratic tail still
   *      carries. Ink does not accumulate, so on paper the tail runs LINEAR and reaches further back
   *      at a weight the eye can find.
   *    · the TINT. On black, `0.5 + vB` brightens toward the head because more light IS more
   *      presence. On paper that lifts the ink toward the page and REMOVES contrast — the same
   *      inversion the ink lane hits everywhere else — so the head end deepens the hue instead.
   *
   *  The HEAD is not part of this: it stays additive on both grounds and spends the silver ground's
   *  own headroom (see HEAD_TUNE_DEFAULTS). Trail = ink, head = light, on either ground. */
  private _stageTrail(m: THREE.ShaderMaterial): void {
    m.uniforms.uInk.value = this._paper ? 1 : 0;
  }

  // The head's ground-dependent state, in one place so construction and a live theme flip can
  // never disagree about what a spark weighs on this ground. The BLEND is part of that state now
  // (2026-09-01): additive can only move toward white, so an additive head on silver had no way to
  // be anything but pale — see the header.
  private _stageHead(m: THREE.ShaderMaterial): void {
    const t = HEAD_TUNE_DEFAULTS;
    m.uniforms.uSize.value = t.size * (this._paper ? t.paperMul : 1);
    m.uniforms.uInk.value = this._paper ? 1 : 0;
    m.blending = this._paper ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.needsUpdate = true;
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
    this.headMat = null;
    this.headPosAttr = null;
    this.headColAttr = null;
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
    // One head per agent. `vstart` is `agentIndex * vertsPer` (arcSim), so the head index is
    // derivable from the agent alone and no parallel bookkeeping is needed.
    this.headPos = new Float32Array(agents.length * 3);
    this.headCol = new Float32Array(agents.length * 3);

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
        uInk: { value: this._paper ? 1 : 0 }, // 0 = additive glow, 1 = ink on paper (_stageTrail)
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
        uniform float uM; uniform vec3 uCamN; uniform float uClose; uniform float uInk;
        varying float vB; varying vec3 vColor; varying vec3 vDir;
        void main() {
          // FACING dim, the surface's own recipe (GeoView's graticule/walls): a comet over the
          // far hemisphere stays faintly present — the hologram reads through — but clearly
          // BEHIND, and damps to near-nothing as the camera closes in, where seeing through the
          // globe was pure noise. The arc apex rises above the surface, so the smoothstep window
          // is what keeps a comet crossing the limb from popping.
          float facing = mix(mix(0.22, 0.03, uClose), 1.0, smoothstep(-0.25, 0.12, dot(vDir, uCamN)));
          // The comet falloff, themed: quadratic where the mark ADDS light, linear where it lays
          // ink. See _stageTrail for why the two grounds cannot share one curve.
          float a = mix(vB * vB, vB, uInk) * uM * facing;
          if (a < 0.01) discard;
          // …and the tint with it: brighten toward the head on black, where more light IS more
          // presence. On paper the hue stays close to the node chips' own (see paperInk) — the
          // trail is a hair lighter than the head and the falloff above does the rest, because a
          // packet must read as the SAME network as the chip it is flying to.
          gl_FragColor = vec4(vColor * mix(0.5 + vB, 0.74 + 0.16 * vB, uInk), a);
        }`,
    });
    this.arcGroup.add(new THREE.LineSegments(geo, this.mat));

    // ── The heads ───────────────────────────────────────────────────────────────────────────────
    const hGeo = new THREE.BufferGeometry();
    const hPosAttr = new THREE.BufferAttribute(this.headPos, 3); hPosAttr.setUsage(THREE.DynamicDrawUsage);
    const hColAttr = new THREE.BufferAttribute(this.headCol, 3); hColAttr.setUsage(THREE.DynamicDrawUsage);
    hGeo.setAttribute("position", hPosAttr);
    hGeo.setAttribute("aColor", hColAttr);
    // A Points cloud has no bounding sphere until one is computed, and the head positions start at
    // the origin, so let three skip the frustum test rather than cull the whole swarm on frame 1.
    hGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.headPosAttr = hPosAttr;
    this.headColAttr = hColAttr;

    const t = HEAD_TUNE_DEFAULTS;
    // gl_PointSize is in PHYSICAL pixels while the tune is authored in CSS px, so the size carries
    // the renderer's own pixel-ratio clamp (SceneContext: min(devicePixelRatio, 2)).
    const px = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio, 2);
    this.headMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uM: { value: 0 },
        uCamN: this._camN,
        uClose: this._close,
        uSize: { value: t.size },
        uWhite: { value: t.white },
        uInk: { value: this._paper ? 1 : 0 }, // 0 = additive spark, 1 = ink on paper (_stageHead)
        uPx: { value: px },
      },
      vertexShader: `
        attribute vec3 aColor;
        uniform float uSize; uniform float uPx;
        varying vec3 vColor; varying vec3 vDir;
        void main() {
          vColor = aColor;
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Attenuated, then CLAMPED at both ends: a spark that shrinks to a speck when the globe
          // is framed whole has stopped being an accent, and one that swells to a blob up close has
          // stopped being a packet. The clamp is what keeps it reading at every orbit distance.
          gl_PointSize = clamp(uSize * uPx * (55.0 / max(-mv.z, 1.0)), ${t.sizeMin.toFixed(1)} * uPx, ${t.sizeMax.toFixed(1)} * uPx);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uM; uniform vec3 uCamN; uniform float uClose; uniform float uWhite;
        uniform float uInk;
        varying vec3 vColor; varying vec3 vDir;
        void main() {
          // The same FACING dim the trail and the globe surface run, so a head crossing the limb
          // goes behind the hologram with its own tail rather than popping off it.
          float facing = mix(mix(0.22, 0.03, uClose), 1.0, smoothstep(-0.25, 0.12, dot(vDir, uCamN)));
          float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
          if (d >= 1.0) discard;
          float f = 1.0 - d;
          float skirt = f * f;            // the coloured falloff — this is what carries the hue
          float core = pow(f, 7.0);       // the tight centre — this is what reads as hot
          // TWO MARKS, ONE SPRITE. On black the colour SUMS — a coloured skirt plus a white-hot
          // centre, which is what additive light does and what makes the dot read as a spark.
          // On paper that same sum would clip to white at the centre under a normal blend (skirt
          // and core both peak at 1 there), so the ink form carries ONE deepened hue and lets the
          // ALPHA do the falloff instead. Same sprite, opposite arithmetic, per the header.
          vec3 glowRgb = vColor * skirt + mix(vColor, vec3(1.0), uWhite) * core * ${t.core.toFixed(2)};
          vec3 inkRgb = vColor * ${t.paperInk.toFixed(2)};
          float glowA = (skirt * 0.75 + core) * ${t.alpha.toFixed(2)};
          float inkA = clamp(skirt * 0.55 + core * 0.9, 0.0, 1.0);
          float a = mix(glowA, inkA, uInk) * uM * facing;
          if (a < 0.004) discard;
          gl_FragColor = vec4(mix(glowRgb, inkRgb, uInk), a);
        }`,
    });
    this._stageHead(this.headMat);
    const headPoints = new THREE.Points(hGeo, this.headMat);
    joinBloom(headPoints); // the head is the spark — see HEAD_TUNE_DEFAULTS. The trail stays out.
    this.arcGroup.add(headPoints);

    this.hasArcs = true;
  }

  // js/globe.js:944 — morph fade-in of the whole swarm (set from setMorph's `extras`, not per hop).
  setUM(v: number): void {
    if (this.mat) this.mat.uniforms.uM.value = v;
    if (this.headMat) this.headMat.uniforms.uM.value = v;
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
    if (this.headPosAttr) this.headPosAttr.needsUpdate = true;
    if (retargeted) {
      for (const ag of sim.agents) this._colorAgent(ag); // take on the new destination's colour
      if (this.arcColAttr) this.arcColAttr.needsUpdate = true;
      if (this.headColAttr) this.headColAttr.needsUpdate = true;
    }
  }

  // Paint one packet's vertices the colour of the node it's heading to (js/globe.js:455-462).
  private _colorAgent(ag: ArcAgent): void {
    const c = ag.to.node.color || ag.to.node.base; // metanode .color / validator .base
    if (!c) return;
    const col = this.arcCol;
    const vertsPer = (ARC_TAIL - 1) * 2;
    for (let v = 0; v < vertsPer; v++) {
      const ci = (ag.vstart + v) * 3;
      col[ci] = c.r; col[ci + 1] = c.g; col[ci + 2] = c.b;
    }
    const hi = (ag.vstart / vertsPer) * 3;
    this.headCol[hi] = c.r; this.headCol[hi + 1] = c.g; this.headCol[hi + 2] = c.b;
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
    // The head rides p[0] — the same sample the trail's bright end already uses, so the spark can
    // never drift off the comet it leads.
    const hi = (ag.vstart / ((ARC_TAIL - 1) * 2)) * 3, H = p[0];
    this.headPos[hi] = H.x; this.headPos[hi + 1] = H.y; this.headPos[hi + 2] = H.z;
  }
}
