// The Hypergraph-only furniture that surrounds the shared validator nodes:
//   - the Global L0 core (Hypergraph heart)
//   - orbiting metagraph clusters tethered to L0
//
// The validator nodes themselves live in Globe (they morph between the shell
// layout and the geographic layout). Everything here fades out in the geography
// view by scaling `root` down.

import * as THREE from "three";
import { METAGRAPHS, type MetaConfig } from "../../config";
import { metaAnchor, META_RING, META_LAYERS, HYPER_TILT, applyHyperRig } from "../../domain/hyperLayout";
import { armillaryFrame, ringFramePos, ringNormal, type RingFrame } from "../../domain/nodeLayout";
import type { StageLight } from "../objects/StageLight";
import { STAGE_LIGHTS } from "../../domain/stageLight";
import { FadeSet } from "../objects/FadeSet";
import { ORB_FRESNEL_GLSL, ORB_FRESNEL_MIX } from "../objects/NodeFabric";
import { offNetMul } from "../../domain/dimModel";
import { makeRadialGradientTexture } from "../objects/gradientTexture";
import type { SceneColors } from "../../sceneColors";
import type { TuneSchema } from "../../tune";
import type { SceneView } from "./SceneView";

const _pos = new THREE.Vector3(); // scratch for hub orbit positions (reused each frame)
const _tcol = new THREE.Color(); // scratch for the tether colour bake (event-time, reused)
const _tend = new THREE.Color(); // ditto — the hub-end identity colour

// ---------------------------------------------------------------- the tether
// The line from the DAG core out to each metagraph hub. It was ONE straight segment at a flat 0.22
// opacity, which is the boring version and also the WRONG one: ten flat lines converging on the
// core pile into a knot exactly where the brightest object in the view already is, and each one
// ends by stabbing its hub's orb. Subdividing it buys a per-vertex ALPHA PROFILE that fixes both
// ends — a long fade out of the core (the knot dissolves) and a short one into the hub (the line
// lands in the orb instead of hitting it) — plus a colour run from the structural core blue toward
// the metagraph's own identity hue, so the line says WHOSE tether it is on its way out.
//
// Positions stay pure lerps of the hub position, so the per-frame write is `hubPos × f` with `f`
// precomputed below: one multiply per vertex, no allocation (rule 5). The COLOURS are baked once
// (and on a ?tune edit — hence the group's onChange), because nothing about them moves.
const TETHER_SEG = 24;
/** `j / TETHER_SEG` for every vertex — the lerp fraction along core → hub, precomputed once. */
const TETHER_F = new Float32Array(TETHER_SEG + 1).map((_, j) => j / TETHER_SEG);

/** Smoothstep, the ease both tip fades ride. */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** The live-tunable tether look (dev `?tune` panel binds these; the values are the shipped look). */
export interface TetherTune {
  restOp: number;   // resting line opacity (× the per-hub fades) — the pre-existing 0.22
  coreFade: number; // fraction of the run spent fading UP out of the core (kills the convergence knot)
  hubFade: number;  // fraction spent fading DOWN into the hub orb
  identity: number; // 0 = core blue all the way, 1 = full identity hue at the hub end
  brightness: number; // vertex-colour multiplier (additive blending → perceived brightness)
}

export const TETHER_TUNE_DEFAULTS: TetherTune = {
  restOp: 0.34,
  coreFade: 0.58,
  hubFade: 0.14,
  identity: 0.85,
  brightness: 1,
};

/** The `?tune` knob ranges (contract: src/engine/tune.ts) — colocated so a range sits next to the
 *  number it bounds. Type-only import: no runtime coupling to the panel. */
export const TETHER_TUNE_SCHEMA: TuneSchema<TetherTune> = {
  restOp: { min: 0, max: 1, step: 0.01, label: "opacity" },
  coreFade: { min: 0, max: 0.9, step: 0.01, label: "fade from core" },
  hubFade: { min: 0, max: 0.5, step: 0.01, label: "fade into hub" },
  identity: { min: 0, max: 1, step: 0.05, label: "identity hue" },
  brightness: { min: 0.1, max: 2, step: 0.05 },
};

// Resting opacity of the cyan structural hoops (subtle — structure, not a subject). Faded per
// frame with the hub/core reveal so the rings are Hypergraph-only furniture.
const HOOP_OP = 0.08;
// Resting opacity of the soft rim-fill disk under each ring (populated layers only) — more cyan
// presence + anchors the layer label, which otherwise floated between the thin rings (user).
const FILL_OP = 0.09;
// How much of hyper's off-focus `elem` dim the hub BODY takes, versus the glow/tether/hoops/fills
// that take all of it: the solid orb keeps a hub legible as a place in the structure while its
// light recedes. A fraction OF the knob rather than its own number, so `elem` stays one knob with
// one effect (two channels of it) and turning it to 0 removes both.
const HUB_BODY_SOFT = 0.58;

// Anchor-packet stream tuning: each anchored snapshot launches one packet hub→core; a burst of N
// streams out staggered, reusing a small pool (which naturally throttles very large bursts).
const PKT_TRAVEL = 0.85; // seconds hub → core
const PKT_STAGGER = 0.07; // seconds between launches within a burst
const PKT_POOL = 14; // reusable packet meshes per metagraph (caps simultaneous in-flight)

// The focus SPOTLIGHT (see scene/objects/StageLight) — staged above the focused metagraph's ring
// plane (or the DAG core's, a bigger stage) so the selected atom catches a stage-light wash.
// Values live in domain/stageLight.ts's STAGE_LIGHTS.hyper row (angle/distance/intensity/
// penumbra/height/heightDag) — the viewPolicy idiom, one row per view.


// ONE HUB ORB for every network, the DAG core included (user, 2026-08-11): the core used to be a
// bigger sphere (r 1.5) than the metagraph hubs (r 0.9), which said "different kind of thing" — but
// its CENTRAL POSITION already says the only thing that is different about it. Shared because it is
// literally the same object at the same size; these are built once and live for the app's lifetime,
// so there is nothing to dispose and no reason for N copies of one icosahedron.
const HUB_ORB = new THREE.IcosahedronGeometry(0.9, 4);

// Give a single (non-instanced) emissive sphere the SAME fresnel-rim ORB look as the node instances
// (NodeFabric._makeNodeMaterial): a view-dependent rim multiplied onto its emissive so the core /
// hub read as lit 3D orbs, not flat faceted suns (user). The nodes are instanced (per-instance
// aBase/aEmissive) so their material can't be reused directly; this replays the same shader tail
// against the material's own emissive. Smooth-shade the mesh (drop flatShading) so the rim is even.
function applyOrbFresnel(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      // The SHARED orb rim chunk (NodeFabric.ORB_FRESNEL_*) — one curve for instanced nodes
      // and these single orbs, so tuning it can never diverge the two materials.
      `#include <emissivemap_fragment>\n${ORB_FRESNEL_GLSL}totalEmissiveRadiance *= ${ORB_FRESNEL_MIX};`,
    );
  };
}

// One orbiting metagraph hub record in HyperView.metas (the exact shape the constructor
// builds — scene/Globe.ts (via `layers.metas.find`, keying off `.cfg.id`/`.group`) and
// Engine.ts (`.cfg.id` lookups for DoF/filter) read these fields off the instances handed
// to them, so this type must track _buildMetagraphs verbatim).
export interface MetaHubRec {
  group: THREE.Group;
  hub: THREE.Mesh;
  cfg: MetaConfig;
  state: null;
  tether: THREE.Line;
  // Anchor "packets": one travels hub→core per snapshot the metagraph anchored into a tick (same
  // count the Snapshots view shows). `pending` snapshots launch staggered, reusing the `pool`.
  packets: { t: number; mesh: THREE.Mesh }[];
  pool: THREE.Mesh[];
  pending: number;
  lastLaunch: number;
  glow: number; // decaying hub-glow boost on each launch
  anchor: THREE.Vector3;
  orbit: number;
  radius: number;
  incl: number;
  spin: number;
  active: boolean;
  hoops: THREE.LineLoop[]; // the cyan layer rings (structural) drawn around this hub
  fills: THREE.Mesh[]; // soft radial fill disks under each ring (rim-weighted, fade to transparent)
}

export class HyperView implements SceneView {
  scene: THREE.Scene;
  root: THREE.Group;
  pickables: THREE.Object3D[];
  metas: MetaHubRec[];
  sceneColors: Record<string, number> | null;
  clock: number;
  focusId: string | null;
  ledger: boolean;
  // View-derived gate from VIEW_POLICIES: when false the hub constellation holds still (folds into
  // `frozen` in update, alongside — but independent of — the focusId freeze). Only hyper leaves it on.
  hubOrbits: boolean;
  coreGroup!: THREE.Group;
  core!: THREE.Mesh;
  coreFlash?: number;
  private _coreRings: THREE.LineLoop[] = []; // the DAG core's cyan "sun" hoops (rebuilt on node load)
  private _coreFills: THREE.Mesh[] = []; // the DAG core's shell rim-fill disks (same as a metagraph's)
  private _fillTex?: THREE.Texture; // shared rim-weighted radial gradient for the ring fill disks
  // The focus spotlight (see SPOT_* above) + per-frame scratch. The light itself is shared and
  // owned by the Engine — this view only CLAIMS it while a subject is focused.
  private readonly stage: StageLight;
  private _spotPos = new THREE.Vector3();
  private _spotN = new THREE.Vector3();
  private _coreDim = 0; // eased 0→1: the DAG core fades back when a specific metagraph is the subject
  private _core: number; // the structural accent (colors.core) — the core sphere hue
  // furnitureAlpha("hyper") — the view-transition build/teardown fade. FadeSet is the single owner
  // of the alpha; every site here is a DYNAMIC per-frame expression (verified — zero static
  // registrations in this view today), so they all just read `_fades.alpha`.
  private _fades = new FadeSet();
  /** The live look of the core→hub tethers. Baked into vertex colours, so a `?tune` edit re-bakes. */
  tetherTune: TetherTune = { ...TETHER_TUNE_DEFAULTS };

  // `sceneColors` (id -> 0xRRGGBB) is the identity SCENE-lane colour map (Task 3), handed in by
  // the Engine at construction — HyperView builds all its hubs synchronously from
  // config.METAGRAPHS right here, before any API data exists, so the map has to arrive as a ctor
  // arg for the hubs to be born in the identity colour with no recolor pass / no first-paint flash.
  constructor(scene: THREE.Scene, colors: SceneColors, stage: StageLight, sceneColors?: Record<string, number>) {
    this.scene = scene;
    this._core = colors.core;
    this.stage = stage;
    this.root = new THREE.Group();
    // Tilt the hub/tether/hoop structure to read top-down from the shared overview camera (Globe
    // tilts the node group + HyperView the core by the same HYPER_TILT, so all three stay registered).
    applyHyperRig(this.root, 0);
    scene.add(this.root);

    // The focus spotlight is claimed per frame in update() (world-space — the hub position is
    // resolved through root's tilt+spin there). Its staging row lives in domain/stageLight.ts:
    // distance 40 clears the DAG stage's farthest shell node (~21), and penumbra is kept SMALL on
    // purpose — the full-intensity cone is angle·(1−penumbra), and a soft-edged cone lit only the
    // inner rings, leaving the outer dL1/cL1 rings in the falloff reading like a DIFFERENT
    // material (user bug).

    this.pickables = [];
    this.metas = [];
    this.sceneColors = sceneColors || null;

    this._buildCore();
    this._buildMetagraphs();
    this._bakeTethers();

    this.clock = 0;


    // When a metagraph is focused in the Hypergraph, its hub's orbit is paused
    // (anchored) so it stays framed & in focus; the rest keep orbiting.
    this.focusId = null;

    // In the Snapshots (ledger) view the hubs (and their tethers/pulses) are hidden — ledger.js
    // draws the metagraph snapshot blocks itself. Toggled by the engine via setLedger.
    this.ledger = false;

    // Hub orbit motion runs by default; the Engine gates it per view via setHubOrbits.
    this.hubOrbits = true;
  }

  // View-derived hub-orbit gate from VIEW_POLICIES (Engine calls this on mode change). When off, the
  // hub constellation freezes; in geo/flat the hubs are already invisible so this is a no-op there.
  setHubOrbits(on: boolean) {
    this.hubOrbits = on;
  }

  // The view-transition furniture multiplier (Engine, per frame). The spotlight needs no gate of
  // its own: the Engine hands the same alpha to StageLight as this view's presence, so a claim
  // made while the view fades out is scaled to nothing.
  setViewAlpha(a: number): void {
    this._fades.apply(a);
  }

  // Hide/show the metagraph hubs + their tethers/pulses for the Snapshots view. Hidden state is
  // applied once here; the normal update loop early-returns while in ledger and re-shows everything
  // on exit.
  setLedger(on: boolean) {
    if (this.ledger === on) return;
    this.ledger = on;
    // The Hypergraph furniture is hidden in the Snapshots chamber (update() early-returns there, so
    // it can't fade these itself): the DAG core + its cyan hoops, and each hub + its layer hoops.
    // Restored on exit; update() then governs their per-frame fade again.
    this.coreGroup.visible = !on;
    for (const m of this.metas) {
      m.hub.visible = !on;
      for (const h of m.hoops) h.visible = !on;
      for (const f of m.fills) f.visible = !on && f.userData.populated !== false; // restore populated fills on exit
      if (on) {
        (m.tether.material as THREE.LineBasicMaterial).opacity = 0;
        // Retire any in-flight anchor packets + clear the pending queue.
        for (const pk of m.packets) { pk.mesh.visible = false; (pk.mesh.material as THREE.MeshBasicMaterial).opacity = 0; m.pool.push(pk.mesh); }
        m.packets.length = 0;
        m.pending = 0;
      }
    }
  }

  // ---------------------------------------------------------------- Core
  private _buildCore() {
    this.coreGroup = new THREE.Group();
    applyHyperRig(this.coreGroup, 0); // match the tilted node group + hubs (see root)
    const mat = new THREE.MeshStandardMaterial({
      color: this._core, emissive: this._core, emissiveIntensity: 1.4,
      roughness: 0.5, metalness: 0.2, transparent: true, // match the node orbs (smooth + fresnel)
    });
    applyOrbFresnel(mat);
    this.core = new THREE.Mesh(HUB_ORB, mat);
    this.core.userData.pick = {
      kind: "core",
      title: "Global L0 — the Hypergraph core",
      sub: "Security & settlement layer",
    };
    this.coreGroup.add(this.core);

    // The core lives directly in the scene (not under `root`), so the morph's root-collapse
    // doesn't shrink it — instead it dissolves in place (coreReveal) in update() while the globe
    // fades in on its own (the old grow-into-globe swell was removed).
    this.scene.add(this.coreGroup);
    this.pickables.push(this.core);
  }

  // Called when a new global snapshot lands so the core pulses in sync with the
  // bottom snapshot stream. `strength` scales the flash by how many metagraphs the
  // snapshot anchored (more anchored = brighter). Math.max so overlapping flashes
  // don't cut each other short.
  flashCore(strength = 1) { this.coreFlash = Math.max(this.coreFlash || 0, strength); }

  // Fire an "anchored into L0" packet from a metagraph's hub toward the core —
  // called when that metagraph actually records a snapshot that anchored into a
  // global tick (the `anchor` event), so the packets reflect real anchoring.
  // Queue `count` anchor packets (one per snapshot the metagraph anchored into a tick) to stream
  // from its hub toward the core — the same count the Snapshots view renders as tiles. They launch
  // staggered in update(); the pool caps how many fly at once (very large bursts just take longer).
  pulseMeta(metaId: string, count = 1) {
    if (this.ledger) return; // the hubs are hidden in ledger — don't accumulate unrendered packets
    const m = this.metas.find((x) => x.cfg.id === metaId);
    if (m) m.pending += Math.max(1, count);
  }

  // ---------------------------------------------------------------- Metagraphs
  private _buildMetagraphs() {
    const n = METAGRAPHS.length;
    METAGRAPHS.forEach((cfg, i) => {
      const group = new THREE.Group();
      const an = metaAnchor(i, n);
      const pos = new THREE.Vector3(an.x, an.y, an.z);
      group.position.copy(pos);

      // Identity SCENE colour when available (Task 3); `?? cfg.color` is only a safety net — the
      // Engine sets `sceneColors` (the config map) before this constructor runs, so `col` is
      // already the identity scene colour on this first build.
      const col = (this.sceneColors && this.sceneColors[cfg.id]) ?? cfg.color;

      // Hub sphere = the metagraph's OWN identity colour (user; the cyan structure is carried by the
      // rings + hoops). A little smaller than before so the ring atom leads.
      const hubMat = new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 1.1,
        roughness: 0.5, metalness: 0.2, transparent: true, // match the node orbs (smooth + fresnel)
      });
      applyOrbFresnel(hubMat);
      const hub = new THREE.Mesh(HUB_ORB, hubMat);
      hub.userData.pick = { kind: "meta", cfg, title: cfg.name, sub: `Metagraph · ${cfg.ticker}` };
      group.add(hub);
      this.pickables.push(hub);

      // Each layer is ONE structural ring: a cyan hoop + the shared rim-fill decoration. Same
      // treatment the DAG core shells get (see buildCoreRings) — one ring model.
      const hoops: THREE.LineLoop[] = [];
      const fills: THREE.Mesh[] = [];
      META_LAYERS.forEach((layer, li) => {
        const frame = armillaryFrame(li, META_LAYERS.length, META_RING.tilt);
        const radius = META_RING.radii[layer];
        const h = this._makeHoop(frame, radius);
        group.add(h);
        hoops.push(h);
        fills.push(this._makeRingDecor(group, frame, radius)); // fill toggled per populated layer by setHoopPresence
      });

      // The tether: TETHER_SEG segments core → hub, carrying a baked colour/alpha profile (see the
      // block at the top of this file). Transparent line → don't WRITE depth (the standard for
      // transparents; avoids z-fighting where the tethers converge at the core). Still depth-TESTED,
      // so it's properly occluded in 3D by opaque objects in front — real depth, not a
      // render-on-top hack. ADDITIVE like the anchor packets, and for the same reason: under normal
      // blending the line's own faded-to-black tips DARKEN the bloomed core they lie over (the
      // "black objects" bug the packets already hit). Additive makes a black vertex simply absent,
      // which is exactly what an alpha profile baked into the colour needs.
      const tGeo = new THREE.BufferGeometry();
      const tPos = new THREE.Float32BufferAttribute(new Float32Array((TETHER_SEG + 1) * 3), 3);
      tPos.setUsage(THREE.DynamicDrawUsage); // rewritten every frame as the hub orbits
      tGeo.setAttribute("position", tPos);
      tGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array((TETHER_SEG + 1) * 3), 3));
      const tether = new THREE.Line(
        tGeo,
        new THREE.LineBasicMaterial({
          vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      // The positions are rewritten per frame without recomputing bounds, so the bounding sphere
      // baked from this all-zero buffer would cull the line the moment its hub swings away.
      tether.frustumCulled = false;
      this.root.add(tether);

      // A pool of anchor "packets" (reused) — one launches per anchored snapshot (see pulseMeta).
      const pool: THREE.Mesh[] = [];
      for (let p = 0; p < PKT_POOL; p++) {
        const pk = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 12, 12),
          // Additive (only ever BRIGHTENS — normal blending darkened the bloomed tether/core as a
          // packet passed over, the "black objects"); depthTest off so it never occludes the line.
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }),
        );
        pk.renderOrder = 4;
        pk.visible = false;
        this.root.add(pk);
        pool.push(pk);
      }

      this.root.add(group);
      this.metas.push({ group, hub, cfg, state: null, tether, packets: [], pool, pending: 0, lastLaunch: 0, glow: 0, anchor: pos.clone(), orbit: an.a, radius: an.radius, incl: an.incl, spin: 0.3 + Math.random() * 0.5, active: true, hoops, fills });
    });
  }

  /** Re-bake every tether's vertex colours (construction, and on a `?tune` edit). */
  private _bakeTethers() {
    for (const m of this.metas) this._bakeTether(m);
  }

  /** Apply the tune knobs (see TETHER_TUNE_DEFAULTS) to the tether's baked look.
   *  `setTetherTune({})` re-bakes with the values the panel has already mutated in place. */
  setTetherTune(t: Partial<TetherTune>) {
    Object.assign(this.tetherTune, t);
    this._bakeTethers();
  }

  // One tether's colour attribute: a run from the core's structural blue toward the metagraph's own
  // identity hue, multiplied by the tip-fade profile. The ALPHA lives in the colour rather than in a
  // per-vertex alpha because the material blends ADDITIVELY — black IS invisible there — which keeps
  // the whole profile in one attribute and the material's own `opacity` free to carry the per-frame
  // fades. Baked, not per-frame: nothing here moves. (Not a `_write*`/`_apply*` name on purpose —
  // this is event-time work, outside the render loop rule 5 polices.)
  private _bakeTether(m: MetaHubRec) {
    const { coreFade, hubFade, identity, brightness } = this.tetherTune;
    _tcol.setHex(this._core);
    _tend.setHex((this.sceneColors && this.sceneColors[m.cfg.id]) ?? m.cfg.color);
    const col = m.tether.geometry.attributes.color as THREE.BufferAttribute;
    for (let j = 0; j <= TETHER_SEG; j++) {
      const t = TETHER_F[j];
      // Colour: hold the core blue for most of the run and hand over LATE. The handover is a
      // straight RGB lerp, and blue→orange in RGB passes through GREY — measured live, a gentle
      // `t^1.5` ramp made the whole middle of the line a pale wire (which is what "boring" looked
      // like). `t^4` keeps the desaturated crossing short and puts it where the hub fade is already
      // taking the line down, so what reads is: structural blue, then the metagraph's own hue as it
      // lands.
      const mix = t * t * t * t * identity;
      const r = _tcol.r + (_tend.r - _tcol.r) * mix;
      const g = _tcol.g + (_tend.g - _tcol.g) * mix;
      const b = _tcol.b + (_tend.b - _tcol.b) * mix;
      // Long fade UP out of the core (dissolves the knot where ten tethers meet), short fade DOWN
      // into the hub (the line lands in the orb instead of stabbing it).
      const a = smoothstep(0, coreFade, t) * smoothstep(0, hubFade, 1 - t) * brightness;
      col.setXYZ(j, r * a, g * a, b * a);
    }
    col.needsUpdate = true;
  }

  // Mark which metagraph hubs are "active" (have locatable nodes). Inactive ones — registered
  // on-chain but with nothing to plot/filter — are dimmed to near-no glow here AND made
  // non-selectable by the engine (it skips their picks), so the Hypergraph still shows they
  // exist without inviting a dead-end click. `ids` is a Set of active ids, or null = all active
  // (e.g. before the node counts have loaded).
  setMetaActive(ids: Set<string> | null) {
    for (const m of this.metas) m.active = !ids || ids.has(m.cfg.id);
  }

  // Spin the hub + core structure about its own vertical axis by `y`, keeping the HYPER_TILT (Euler
  // XYZ → tilt applied after the Y-spin). The Engine drives this with the SAME angle it gives the
  // node group, so hubs/core/hoops and the nodes stay registered while the whole atom rotates.
  setHyperSpin(y: number, tiltX: number = HYPER_TILT) {
    applyHyperRig(this.root, y, tiltX);
    applyHyperRig(this.coreGroup, y, tiltX);
  }

  // A metagraph's 3 layer hoops render SOLID where the layer has nodes and DOTTED where the layer
  // exists in the architecture but is empty — a data-only metagraph (DED) has no cL1 → dotted outer
  // ring; a node-LESS metagraph (not in `present`) shows ALL THREE dotted (user). metaId → [l0,dl1,cl1].
  setHoopPresence(present: Map<string, boolean[]>) {
    for (const m of this.metas) {
      const p = present.get(m.cfg.id);
      m.hoops.forEach((h, li) => {
        const mat = h.material as THREE.LineDashedMaterial;
        const has = !!(p && p[li]); // no presence entry = node-less metagraph → every ring dotted
        mat.dashSize = has ? 1e3 : 0.5; // huge dash + 0 gap = solid; small dash + gap = dotted
        mat.gapSize = has ? 0 : 0.7;
        if (m.fills[li]) { m.fills[li].userData.populated = has; m.fills[li].visible = has && !this.ledger; } // fill only under populated rings
      });
    }
  }

  // A cyan structural hoop: a LineLoop circle of `radius` on the plane of ring `frame` (its two
  // in-plane basis vectors) — the redesign's "surface" primitive, tilted to match its node ring.
  private _makeHoop(frame: RingFrame, radius: number): THREE.LineLoop {
    const seg = 96;
    const pts: THREE.Vector3[] = [];
    // The hoop's circle comes from the SAME parametrization that places the nodes on this ring
    // (Globe → ringFramePos) — one curve source, so nodes can never drift off their hoop.
    for (let i = 0; i < seg; i++) pts.push(ringFramePos(i, seg, radius, frame));
    // Dash-capable material: a populated layer renders SOLID (gapSize 0), an empty layer renders
    // DOTTED (set by setHoopPresence) to show the layer exists in the architecture but has no nodes.
    const mat = new THREE.LineDashedMaterial({ color: this._core, transparent: true, opacity: HOOP_OP, dashSize: 1e3, gapSize: 0 });
    const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
    loop.computeLineDistances(); // required for the dashed (empty-layer) style
    return loop;
  }

  // A soft cyan fill DISK for a ring: a circle of `radius` on ring `frame`'s plane whose radial fill
  // is weighted to the OUTER edge and fades quickly to transparent inward (like the geo pools, but
  // rim-first). Adds cyan body to the ring + a surface for its label to sit on. Populated rings only.
  private _makeRingFill(frame: RingFrame, radius: number): THREE.Mesh {
    // A rim-weighted radial gradient (white; the material tints it cyan) for the ring fill disks:
    // transparent at the centre, ramping to a soft band at the OUTER edge (the ring), so a
    // CircleGeometry reads as a filled ring that fades quickly inward. CircleGeometry's rim
    // samples at gradient r≈1.
    if (!this._fillTex) {
      this._fillTex = makeRadialGradientTexture([
        [0, "rgba(255,255,255,0)"],
        [0.84, "rgba(255,255,255,0)"],
        [0.96, "rgba(255,255,255,0.35)"],
        [1, "rgba(255,255,255,0.8)"],
      ]);
    }
    const geo = new THREE.CircleGeometry(radius, 96);
    const mat = new THREE.MeshBasicMaterial({
      map: this._fillTex, color: new THREE.Color(this._core), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: FILL_OP, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Orient the disk into the ring's tilted plane: CircleGeometry lies in XY (+Z normal) → map its
    // X/Y/Z axes onto the ring's t / b / (t×b) basis.
    const n = ringNormal(frame, new THREE.Vector3()); // event-time
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.t, frame.b, n));
    mesh.renderOrder = -1; // behind the hoops + nodes
    return mesh;
  }

  // The shared ring rim-fill disk, added to `group` for one ring plane at `radius`. Used
  // identically by the metagraph layer rings AND the DAG core shells (one ring model). The
  // per-ring layer-code labels that sat here were removed (user: too distracting).
  private _makeRingDecor(group: THREE.Object3D, frame: RingFrame, radius: number): THREE.Mesh {
    const fill = this._makeRingFill(frame, radius);
    group.add(fill);
    return fill;
  }

  // (Re)build the DAG core's tilted cyan hoops — one per ring of each armillary shell (L0 ball +
  // the separated $DAG L1 outer shell) — matching the node rings Globe placed. Called from
  // Globe.setNodes whenever the validator set changes.
  buildCoreRings(shells: { radius: number; numRings: number; tilt: number; code: string }[]) {
    for (const h of this._coreRings) {
      this.coreGroup.remove(h);
      h.geometry.dispose();
      (h.material as THREE.Material).dispose();
    }
    this._coreRings = [];
    for (const m of this._coreFills) {
      this.coreGroup.remove(m);
      m.geometry.dispose(); // each fill owns its CircleGeometry (leaked before, ~every 25s poll)
      // NB: the material's map is the SHARED lazily-created _fillTex (also referenced by every
      // metagraph ring fill) — deliberately NOT disposed here; it lives for the app's lifetime.
      (m.material as THREE.Material).dispose();
    }
    this._coreFills = [];
    for (const s of shells) {
      for (let k = 0; k < s.numRings; k++) {
        const frame = armillaryFrame(k, s.numRings, s.tilt);
        const h = this._makeHoop(frame, s.radius);
        this.coreGroup.add(h);
        this._coreRings.push(h);
        // Rim-fill disc on EVERY ring of the shell (user: a multi-ring shell like the Global L0
        // must show the fill on all its rings, not just the k=0 representative).
        const fill = this._makeRingFill(frame, s.radius);
        this.coreGroup.add(fill);
        this._coreFills.push(fill);
      }
    }
  }

  // ---------------------------------------------------------------- Update loop
  // `morph` (0 = Hypergraph, 1 = globe) fades the metagraph hubs out early so
  // they don't visibly collapse into the globe's centre — their real nodes fly
  // out to the map (Globe) instead.
  // `spinFrozen` (set when the camera is zoomed in to inspect) stops the overall SPHERE spin — the
  // core + hub meshes — so a close-up reads still; the per-node axis spin (Globe) keeps going.
  update(dt: number, morph = 0, coreDimTarget = 0, spinFrozen = false, _cam?: THREE.Camera, dagFocused = false) {
    this.clock += dt;
    const t = this.clock;

    // Snapshots view: the hubs/tethers are hidden (set once in setLedger) and ledger.js owns the
    // metagraph blocks, so there's nothing to orbit here.
    if (this.ledger) return;

    // Hubs are fully gone by ~30% into the morph, before the root-scale collapse
    // would be noticeable.
    const hubFade = THREE.MathUtils.clamp(1 - morph / 0.3, 0, 1);

    // Core stays fully lit; hubs fade out with the morph (hubFade).
    const coreF = 1;
    const metaF = hubFade;
    const coreOpacity = 1;
    const metaOpacity = hubFade;

    // Hoisted per frame (the tune hoist rule): ONE read for the core and all 10 hubs. The per-network
    // furniture's off-focus dim is hyper's `elem` knob — the same "the view's own ELEMENTS drop when
    // off-subject" number the ledger spends on its bands, tiles and ribbons.
    const hubOffMul = offNetMul("hyper");
    // The hub BODY is the softer of the knob's two channels: glow/tether/hoops/fills take the
    // full drop, the solid body only HUB_BODY_SOFT of it, so an out-of-focus hub stays clearly
    // present while its light recedes. Derived, not a second magic number — at the shipped
    // default the two read 0.62 and 0.78, and `elem: 0` still turns BOTH off.
    const hubBodyMul = 1 - (1 - hubOffMul) * HUB_BODY_SOFT;

    // Core pulse + flash. The core no longer SWELLS out into the globe on the morph (user removed
    // the grow-into-globe transition): it just dissolves in place (coreReveal) while the Earth fades
    // in on its own, so geo/ledger simply appear rather than being born from the core. The node
    // transforms (the fly-out to map positions) are untouched.
    const flash = this.coreFlash || 0;
    const coreReveal = 1 - THREE.MathUtils.clamp((morph - 0.3) / 0.35, 0, 1); // 1 -> 0 over 0.3..0.65
    // The DAG core IS the DAG's heart, so it tracks the DAG's highlight state like the validator
    // nodes do: lit when the subject is "all"/"dag", faded back when a specific metagraph is the
    // hovered/committed subject (user: hovering a metagraph highlighted its nodes but left the core
    // full-bright). Eased so it fades rather than snaps.
    this._coreDim += (coreDimTarget - this._coreDim) * Math.min(1, dt * 4);
    const pulse = 1 + Math.sin(t * 1.6) * 0.04 + flash * 0.25;
    this.core.scale.setScalar(pulse);
    if (!spinFrozen) {
      this.core.rotation.y += dt * 0.25;
      this.core.rotation.x += dt * 0.12;
    }
    // ONE NODE MODEL (user, 2026-08-11): the core is a metagraph-shaped hub, so ITS furniture answers
    // the same `elem` knob every other hub's does. It used to fade on two magic coefficients of its
    // own (0.6 for the glow, 0.5 for the hoops/fills), so turning `elem` down left the DAG's rings
    // sitting at full brightness while every metagraph's dropped. `_coreDim` is the core's own eased
    // stand-in for a hub's binary `focusOther`, so the knob is lerped by it rather than switched.
    const coreOffMul = 1 - this._coreDim * (1 - hubOffMul);
    const coreMat = this.core.material as THREE.MeshStandardMaterial;
    coreMat.emissiveIntensity = (0.6 + flash * 0.9) * coreF * coreReveal * (1 - 0.5 * (1 - coreReveal)) * coreOffMul * this._fades.alpha;
    // The core BODY keeps full opacity — a hub's soft channel (hubBodyMul) taken to its limit,
    // because the one sphere at the origin is the structure's centre and always reads as a position.
    coreMat.opacity = coreOpacity * coreReveal * this._fades.alpha;
    this.coreGroup.visible = coreReveal > 0.001;
    // The DAG core's cyan "sun" hoops fade with the core on the morph, and take the full `elem` drop
    // when a specific metagraph is the subject — exactly what a metagraph's own layer hoops take.
    const coreHoopOp = HOOP_OP * coreReveal * coreOffMul;
    for (const h of this._coreRings) (h.material as THREE.LineBasicMaterial).opacity = coreHoopOp * this._fades.alpha;
    // The core shells' rim-fill disks fade the same way (same treatment as a metagraph's fills).
    const coreFillOp = FILL_OP * coreReveal * coreOffMul;
    for (const f of this._coreFills) (f.material as THREE.MeshBasicMaterial).opacity = coreFillOp * this._fades.alpha;
    if (this.coreFlash) this.coreFlash = Math.max(0, this.coreFlash - dt * 1.6);

    // Metagraphs — orbit, spin, tether pulses. While ANY metagraph is selected (focusId), the
    // whole constellation holds still — every hub's orbit AND its own axis spin freeze, not just
    // the focused one — so nothing drifts/spins around the framed selection. The node spheres still
    // tumble (globe.js) and data-driven anchor pulses still fire; only the hub motion stops.
    // The constellation holds still when a hub is focused (focusId) OR the view policy turns hub
    // orbits off (hubOrbits) — the two freezes are independent but drive the same hold.
    const frozen = this.focusId != null || !this.hubOrbits;
    const tetherOp = this.tetherTune.restOp; // hoisted: one property load per frame, not per hub
    for (const m of this.metas) {
      if (!frozen) m.orbit += dt * 0.03;
      const a = m.orbit;
      // Scratch vector reused every frame — this runs for all 10 hubs at 60fps, so a fresh
      // Vector3 here would be ~600 throwaway allocations/sec.
      _pos.set(
        Math.cos(a) * m.radius,
        Math.sin(a) * m.radius * Math.sin(m.incl) + (m.anchor.y * 0.4),
        Math.sin(a) * m.radius * Math.cos(m.incl)
      );
      m.group.position.copy(_pos);
      // Spin the hub MESH, not the group — the group also holds the cyan hoops, which must stay
      // registered with the (non-spinning) node rings Globe places at the same radii. Frozen when a
      // hub is focused OR the camera is zoomed in (spinFrozen).
      if (!frozen && !spinFrozen) m.hub.rotation.y += dt * m.spin;
      m.group.visible = hubFade > 0.001;
      if (!frozen && !spinFrozen) m.hub.rotation.x += dt * 0.5;
      // Registered-but-node-less hubs read as inactive: faded body, near-zero glow,
      // fainter tether — present in the architecture, but clearly not live.
      // When a metagraph is selected (focusId), dim the OTHER hubs *subtly* — a gentle
      // out-of-focus push (DoF + camera focus already carry most of the emphasis).
      const focusOther = this.focusId != null && m.cfg.id !== this.focusId;
      const fdim = focusOther ? hubOffMul : 1; // glow / tether
      // Inactive (node-less) metagraphs read as present-but-quiet — dimmer than active, but NOT
      // buried (user: decrease the inactive dim); their rings are all-dotted (setHoopPresence).
      const glowMul = (m.active ? 1 : 0.35) * fdim;
      const hubMat = m.hub.material as THREE.MeshStandardMaterial;
      hubMat.opacity = metaOpacity * (m.active ? 1 : 0.8) * (focusOther ? hubBodyMul : 1) * this._fades.alpha;

      // The tether is a subdivided line from the origin out to the hub, so write every vertex as a
      // lerp of the live hub position (vertex 0 stays at the core). Straight into the existing
      // buffer rather than setFromPoints, which would rebuild the attribute (and drop its GPU
      // buffer) every frame. The look — the tip fades and the colour run — is BAKED into the vertex
      // colours (_bakeTether); this only moves the line.
      const tetherPos = m.tether.geometry.attributes.position;
      for (let j = 1; j <= TETHER_SEG; j++) {
        const f = TETHER_F[j];
        tetherPos.setXYZ(j, _pos.x * f, _pos.y * f, _pos.z * f);
      }
      tetherPos.needsUpdate = true;
      (m.tether.material as THREE.LineBasicMaterial).opacity = tetherOp * metaF * (m.active ? 1 : 0.6) * fdim * this._fades.alpha;
      // The cyan layer hoops fade with the hubs on the morph, dim on inactive / out-of-focus hubs.
      const hoopOp = HOOP_OP * metaF * (m.active ? 1 : 0.7) * fdim;
      for (const h of m.hoops) (h.material as THREE.LineBasicMaterial).opacity = hoopOp * this._fades.alpha;
      // The rim-fill disks fade with the hoops (populated rings only — empty ones were hidden).
      const fillOp = FILL_OP * metaF * (m.active ? 1 : 0.7) * fdim;
      for (const f of m.fills) (f.material as THREE.MeshBasicMaterial).opacity = fillOp * this._fades.alpha;


      // Anchor packets: launch one per pending snapshot (staggered), advance the in-flight ones
      // hub→core, and boost the hub glow while any are flowing. `_pos` is the hub's live position.
      if (m.pending > 0 && m.pool.length && t - m.lastLaunch >= PKT_STAGGER) {
        const pk = m.pool.pop()!;
        m.packets.push({ t: 0, mesh: pk });
        m.pending--;
        m.lastLaunch = t;
        m.glow = 1;
      }
      m.glow = Math.max(0, m.glow - dt * 1.4);
      for (let pi = m.packets.length - 1; pi >= 0; pi--) {
        const pk = m.packets[pi];
        pk.t += dt / PKT_TRAVEL;
        const mat = pk.mesh.material as THREE.MeshBasicMaterial;
        if (pk.t >= 1) {
          pk.mesh.visible = false;
          mat.opacity = 0;
          m.pool.push(pk.mesh);
          m.packets.splice(pi, 1);
          continue;
        }
        pk.mesh.visible = true;
        pk.mesh.position.copy(_pos).multiplyScalar(1 - pk.t); // hub (t=0) → core (t=1)
        mat.opacity = Math.sin(pk.t * Math.PI) * 0.9 * metaF * this._fades.alpha;
      }
      hubMat.emissiveIntensity = (0.72 + m.glow * 0.5) * metaF * glowMul * this._fades.alpha;
      // Stash the FOCUSED hub's root-local position for the spotlight block below (the loop's
      // `_pos` scratch is overwritten per hub).
      if (m.cfg.id === this.focusId) this._spotPos.copy(m.group.position);
    }

    // Focus SPOTLIGHT: stage a white key above the focused subject's ring plane — a metagraph atom's
    // hub, or the DAG CORE itself (same subject at a bigger scale; higher stage, same cone) — so the
    // selection catches a real light wash on top of the DoF/dim emphasis (user). Rests dark
    // otherwise: not claiming IS off, so there is no spot to switch back off here.
    const spotMeta = this.focusId != null && this.metas.some((m) => m.cfg.id === this.focusId);
    if (spotMeta || dagFocused) {
      // Only while focused: resolve the subject to world once per frame (root tilt+spin+scale) —
      // the metagraph loop stashed its hub's ROOT-LOCAL position; the DAG core sits at the origin.
      this._spotN.set(0, 1, 0).applyEuler(this.root.rotation); // the ring-plane normal (world)
      if (spotMeta) this._spotPos.applyEuler(this.root.rotation).multiplyScalar(this.root.scale.x);
      else this._spotPos.set(0, 0, 0);
      // The fade is the SUBJECT's own ramp only — StageLight applies this view's presence itself,
      // so passing `_fades.alpha` here too would square it.
      this.stage.claim(
        "hyper",
        this._spotPos,
        this._spotN,
        spotMeta ? STAGE_LIGHTS.hyper.height : STAGE_LIGHTS.hyper.heightDag!,
        spotMeta ? hubFade : coreReveal,
      );
    }
  }

}
