// The Hypergraph-only furniture that surrounds the shared validator nodes:
//   - the Global L0 core (Hypergraph heart)
//   - orbiting metagraph clusters tethered to L0
//
// The validator nodes themselves live in Globe (they morph between the shell
// layout and the geographic layout). Everything here fades out in the geography
// view by scaling `root` down.

import * as THREE from "three";
import { METAGRAPHS, type MetaConfig } from "../../config";
import { metaAnchor, META_RING, META_LAYERS } from "../../domain/hyperLayout";
import { armillaryFrame, type RingFrame } from "../../domain/nodeLayout";
import type { SceneColors } from "../../sceneColors";

const _pos = new THREE.Vector3(); // scratch for hub orbit positions (reused each frame)

// Resting opacity of the cyan structural hoops (subtle — structure, not a subject). Faded per
// frame with the hub/core reveal so the rings are Hypergraph-only furniture.
const HOOP_OP = 0.16;
// The faint cyan ground grid beneath the whole ring — the planar cyan context (geo/ledger peer).
const GROUND_OP = 0.05;

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
  pulseMesh: THREE.Mesh;
  pulse: number;
  anchor: THREE.Vector3;
  orbit: number;
  radius: number;
  incl: number;
  spin: number;
  active: boolean;
  hoops: THREE.LineLoop[]; // the cyan layer rings (structural) drawn around this hub
}

export class HyperView {
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
  private _ground!: THREE.GridHelper; // the faint cyan ground grid beneath the whole ring
  private _coreDim = 0; // eased 0→1: the DAG core fades back when a specific metagraph is the subject
  private _core: number; // the structural accent (colors.core) — the core sphere hue

  // `sceneColors` (id -> 0xRRGGBB) is the identity SCENE-lane colour map (Task 3), handed in by
  // the Engine at construction — HyperView builds all its hubs synchronously from
  // config.METAGRAPHS right here, before any API data exists, so the map has to arrive as a ctor
  // arg for the hubs to be born in the identity colour with no recolor pass / no first-paint flash.
  constructor(scene: THREE.Scene, colors: SceneColors, sceneColors?: Record<string, number>) {
    this.scene = scene;
    this._core = colors.core;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.pickables = [];
    this.metas = [];
    this.sceneColors = sceneColors || null;

    this._buildCore();
    this._buildMetagraphs();
    this._buildGround();

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

  // Hide/show the metagraph hubs + their tethers/pulses for the Snapshots view. Hidden state is
  // applied once here; the normal update loop early-returns while in ledger and re-shows everything
  // on exit.
  setLedger(on: boolean) {
    if (this.ledger === on) return;
    this.ledger = on;
    // The Hypergraph furniture is hidden in the Snapshots chamber (update() early-returns there, so
    // it can't fade these itself): the DAG core + its cyan hoops, the ground grid, and each hub +
    // its layer hoops. Restored on exit; update() then governs their per-frame fade again.
    this._ground.visible = !on;
    this.coreGroup.visible = !on;
    for (const m of this.metas) {
      m.hub.visible = !on;
      for (const h of m.hoops) h.visible = !on;
      if (on) {
        (m.tether.material as THREE.LineBasicMaterial).opacity = 0;
        (m.pulseMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }
  }

  // ---------------------------------------------------------------- Core
  private _buildCore() {
    this.coreGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: this._core, emissive: this._core, emissiveIntensity: 1.4,
      roughness: 0.25, metalness: 0.3, flatShading: true, transparent: true,
    });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 2), mat);
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
  pulseMeta(metaId: string) {
    if (this.ledger) return; // the hubs are hidden in ledger — don't accumulate an unrendered pulse
    const m = this.metas.find((x) => x.cfg.id === metaId);
    if (m) m.pulse = 1;
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

      const hubMat = new THREE.MeshStandardMaterial({
        color: this._core, emissive: this._core, emissiveIntensity: 1.1,
        roughness: 0.3, metalness: 0.4, flatShading: true, transparent: true,
      });
      const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), hubMat);
      hub.userData.pick = { kind: "meta", cfg, title: cfg.name, sub: `Metagraph · ${cfg.ticker}` };
      group.add(hub);
      this.pickables.push(hub);

      // Cyan structural "atom" hoops: one per LAYER, all the same diameter but at different tilt
      // angles (layer index = ring index — same armillaryFrame the nodes use), so L0/dL1/cL1 read
      // as distinct tilted rings. The group only ORBITS (no spin — see update), so hoops + nodes
      // stay registered.
      const hoops = META_LAYERS.map((_, li) => {
        const h = this._makeHoop(armillaryFrame(li, META_LAYERS.length, META_RING.tilt), META_RING.radius);
        group.add(h);
        return h;
      });

      const tether = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), pos.clone()]),
        new THREE.LineBasicMaterial({ color: this._core, transparent: true, opacity: 0.22 })
      );
      this.root.add(tether);

      const pulseMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 12),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0 })
      );
      this.root.add(pulseMesh);

      this.root.add(group);
      this.metas.push({ group, hub, cfg, state: null, tether, pulseMesh, pulse: 0, anchor: pos.clone(), orbit: an.a, radius: an.radius, incl: an.incl, spin: 0.3 + Math.random() * 0.5, active: true, hoops });
    });
  }

  // Mark which metagraph hubs are "active" (have locatable nodes). Inactive ones — registered
  // on-chain but with nothing to plot/filter — are dimmed to near-no glow here AND made
  // non-selectable by the engine (it skips their picks), so the Hypergraph still shows they
  // exist without inviting a dead-end click. `ids` is a Set of active ids, or null = all active
  // (e.g. before the node counts have loaded).
  setMetaActive(ids: Set<string> | null) {
    for (const m of this.metas) m.active = !ids || ids.has(m.cfg.id);
  }

  // A cyan structural hoop: a LineLoop circle of `radius` on the plane of ring `frame` (its two
  // in-plane basis vectors) — the redesign's "surface" primitive, tilted to match its node ring.
  private _makeHoop(frame: RingFrame, radius: number): THREE.LineLoop {
    const seg = 96;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(
        frame.t.clone().multiplyScalar(Math.cos(a) * radius).addScaledVector(frame.b, Math.sin(a) * radius),
      );
    }
    const mat = new THREE.LineBasicMaterial({ color: this._core, transparent: true, opacity: HOOP_OP });
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
  }

  // (Re)build the DAG core's tilted cyan hoops — one per ring of each armillary shell (L0 ball +
  // the separated $DAG L1 outer shell) — matching the node rings Globe placed. Called from
  // Globe.setNodes whenever the validator set changes.
  buildCoreRings(shells: { radius: number; numRings: number; tilt: number }[]) {
    for (const h of this._coreRings) {
      this.coreGroup.remove(h);
      h.geometry.dispose();
      (h.material as THREE.Material).dispose();
    }
    this._coreRings = [];
    for (const s of shells) {
      for (let k = 0; k < s.numRings; k++) {
        const h = this._makeHoop(armillaryFrame(k, s.numRings, s.tilt), s.radius);
        this.coreGroup.add(h);
        this._coreRings.push(h);
      }
    }
  }

  // The faint cyan ground grid beneath the whole ring — the planar cyan context that gives the
  // Hypergraph the geo-globe / ledger-plane design language. Static; faded with the hubs on the
  // morph (see update). Lives in the scene (not `root`) so it fades rather than scale-collapses.
  private _buildGround() {
    const g = new THREE.GridHelper(130, 26, this._core, this._core);
    const mat = g.material as THREE.LineBasicMaterial;
    mat.transparent = true;
    mat.opacity = GROUND_OP;
    g.position.y = -7;
    this.scene.add(g);
    this._ground = g;
  }

  // ---------------------------------------------------------------- Update loop
  // `morph` (0 = Hypergraph, 1 = globe) fades the metagraph hubs out early so
  // they don't visibly collapse into the globe's centre — their real nodes fly
  // out to the map (Globe) instead.
  update(dt: number, morph = 0, coreDimTarget = 0) {
    this.clock += dt;
    const t = this.clock;

    // Snapshots view: the hubs/tethers are hidden (set once in setLedger) and ledger.js owns the
    // metagraph blocks, so there's nothing to orbit here.
    if (this.ledger) return;

    // Hubs are fully gone by ~30% into the morph, before the root-scale collapse
    // would be noticeable.
    const hubFade = THREE.MathUtils.clamp(1 - morph / 0.3, 0, 1);
    // The cyan ground grid fades out with the hubs on the morph (Hypergraph-only furniture).
    this._ground.visible = hubFade > 0.001;
    (this._ground.material as THREE.LineBasicMaterial).opacity = GROUND_OP * hubFade;

    // Core stays fully lit; hubs fade out with the morph (hubFade).
    const coreF = 1;
    const metaF = hubFade;
    const coreOpacity = 1;
    const metaOpacity = hubFade;

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
    this.core.rotation.y += dt * 0.25;
    this.core.rotation.x += dt * 0.12;
    // Dim the glow as it dissolves so the fading sphere doesn't bloom out the view.
    const coreMat = this.core.material as THREE.MeshStandardMaterial;
    coreMat.emissiveIntensity = (0.6 + flash * 0.9) * coreF * coreReveal * (1 - 0.5 * (1 - coreReveal)) * (1 - this._coreDim * 0.6);
    coreMat.opacity = coreOpacity * coreReveal;
    this.coreGroup.visible = coreReveal > 0.001;
    // The DAG core's cyan "sun" hoops fade with the core on the morph, and dim with it when a
    // specific metagraph is the subject (_coreDim).
    const coreHoopOp = HOOP_OP * coreReveal * (1 - this._coreDim * 0.5);
    for (const h of this._coreRings) (h.material as THREE.LineBasicMaterial).opacity = coreHoopOp;
    if (this.coreFlash) this.coreFlash = Math.max(0, this.coreFlash - dt * 1.6);

    // Metagraphs — orbit, spin, tether pulses. While ANY metagraph is selected (focusId), the
    // whole constellation holds still — every hub's orbit AND its own axis spin freeze, not just
    // the focused one — so nothing drifts/spins around the framed selection. The node spheres still
    // tumble (globe.js) and data-driven anchor pulses still fire; only the hub motion stops.
    // The constellation holds still when a hub is focused (focusId) OR the view policy turns hub
    // orbits off (hubOrbits) — the two freezes are independent but drive the same hold.
    const frozen = this.focusId != null || !this.hubOrbits;
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
      // registered with the (non-spinning) node rings Globe places at the same radii.
      if (!frozen) m.hub.rotation.y += dt * m.spin;
      m.group.visible = hubFade > 0.001;
      if (!frozen) m.hub.rotation.x += dt * 0.5;
      // Registered-but-node-less hubs read as inactive: faded body, near-zero glow,
      // fainter tether — present in the architecture, but clearly not live.
      // When a metagraph is selected (focusId), dim the OTHER hubs *subtly* — a gentle
      // out-of-focus push (DoF + camera focus already carry most of the emphasis).
      const focusOther = this.focusId != null && m.cfg.id !== this.focusId;
      const fdim = focusOther ? 0.62 : 1; // glow / tether
      const glowMul = (m.active ? 1 : 0.08) * fdim;
      const hubMat = m.hub.material as THREE.MeshStandardMaterial;
      hubMat.opacity = metaOpacity * (m.active ? 1 : 0.5) * (focusOther ? 0.78 : 1);

      // The tether is a 2-vertex line fixed at the origin → hub. Write the moving endpoint
      // (vertex 1) straight into the existing buffer instead of setFromPoints, which would
      // rebuild the attribute (and drop its GPU buffer) every frame.
      const tetherPos = m.tether.geometry.attributes.position;
      tetherPos.setXYZ(1, _pos.x, _pos.y, _pos.z);
      tetherPos.needsUpdate = true;
      (m.tether.material as THREE.LineBasicMaterial).opacity = 0.22 * metaF * (m.active ? 1 : 0.35) * fdim;
      // The cyan layer hoops fade with the hubs on the morph, dim on inactive / out-of-focus hubs.
      const hoopOp = HOOP_OP * metaF * (m.active ? 1 : 0.4) * fdim;
      for (const h of m.hoops) (h.material as THREE.LineBasicMaterial).opacity = hoopOp;

      const pulseMat = m.pulseMesh.material as THREE.MeshBasicMaterial;
      if (m.pulse > 0) {
        m.pulse = Math.max(0, m.pulse - dt * 0.7);
        const e = 1 - m.pulse;
        m.pulseMesh.position.copy(_pos).multiplyScalar(1 - e);
        pulseMat.opacity = Math.sin(m.pulse * Math.PI) * 0.9 * metaF;
        hubMat.emissiveIntensity = (0.72 + m.pulse * 0.5) * metaF * glowMul;
      } else {
        pulseMat.opacity = 0;
        hubMat.emissiveIntensity = 0.72 * metaF * glowMul;
      }
    }
  }

}
