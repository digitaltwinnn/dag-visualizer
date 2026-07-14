// The Hypergraph-only furniture that surrounds the shared validator nodes:
//   - the Global L0 core (Hypergraph heart)
//   - orbiting metagraph clusters tethered to L0
//
// The validator nodes themselves live in Globe (they morph between the shell
// layout and the geographic layout). Everything here fades out in the geography
// view by scaling `root` down.

import * as THREE from "three";
import { METAGRAPHS, type MetaConfig } from "../../config";
import { metaAnchor, META_RING, META_LAYERS, HYPER_TILT } from "../../domain/hyperLayout";
import { armillaryFrame, type RingFrame } from "../../domain/nodeLayout";
import type { SceneColors } from "../../sceneColors";

const _pos = new THREE.Vector3(); // scratch for hub orbit positions (reused each frame)

// Resting opacity of the cyan structural hoops (subtle — structure, not a subject). Faded per
// frame with the hub/core reveal so the rings are Hypergraph-only furniture.
const HOOP_OP = 0.08;
// Resting opacity of the soft rim-fill disk under each ring (populated layers only) — more cyan
// presence + anchors the layer label, which otherwise floated between the thin rings (user).
const FILL_OP = 0.055;

// Ring layer-code labels — the text a focused metagraph shows on each of its three layer rings so
// the L0 / dL1 / cL1 shells read WITH text (user: hard to tell which ring is which). Only the
// focused atom labels (one at a time), so the resting overview never gets busy.
const LAYER_CODE: Record<"l0" | "dl1" | "cl1", string> = { l0: "L0", dl1: "dL1", cl1: "cL1" };

// A rim-weighted radial gradient (white; the material tints it cyan) for the ring fill disks:
// transparent at the centre, ramping to a soft band at the OUTER edge (the ring), so a CircleGeometry
// reads as a filled ring that fades quickly inward. CircleGeometry's rim samples at gradient r≈1.
function makeRingFillTexture(): THREE.Texture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.84, "rgba(255,255,255,0)");
  g.addColorStop(0.96, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0.8)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Store a label's ring-plane normal (local, unrotated frame) so _faceLabelInPlane can lay it flat
// IN the plane each frame — front toward the camera, text upright — for a real 3D-on-the-plane look.
function storeRingNormal(mesh: THREE.Object3D, frame: RingFrame): void {
  mesh.userData.ringN = frame.t.clone().cross(frame.b).normalize();
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
  pulseMesh: THREE.Mesh;
  pulse: number;
  anchor: THREE.Vector3;
  orbit: number;
  radius: number;
  incl: number;
  spin: number;
  active: boolean;
  hoops: THREE.LineLoop[]; // the cyan layer rings (structural) drawn around this hub
  fills: THREE.Mesh[]; // soft radial fill disks under each ring (rim-weighted, fade to transparent)
  labels: THREE.Mesh[]; // per-ring layer-code labels (L0 / dL1 / cL1) — shown only while focused
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
  private _coreLabels: THREE.Mesh[] = []; // the DAG core's shell labels (L0 / L1), shown when DAG focused
  private _fillTex?: THREE.Texture; // shared rim-weighted radial gradient for the ring fill disks
  // Scratch for _faceLabelInPlane (per-frame label orientation) — never allocate in the loop.
  private _lN = new THREE.Vector3();
  private _lUp = new THREE.Vector3();
  private _lRight = new THREE.Vector3();
  private _lPos = new THREE.Vector3();
  private _lCam = new THREE.Vector3();
  private _lPQ = new THREE.Quaternion();
  private _lQ = new THREE.Quaternion();
  private _lM = new THREE.Matrix4();
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
    // Tilt the hub/tether/hoop structure to read top-down from the shared overview camera (Globe
    // tilts the node group + HyperView the core by the same HYPER_TILT, so all three stay registered).
    this.root.rotation.x = HYPER_TILT;
    scene.add(this.root);

    this.pickables = [];
    this.metas = [];
    this.sceneColors = sceneColors || null;

    this._buildCore();
    this._buildMetagraphs();

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
    // it can't fade these itself): the DAG core + its cyan hoops, and each hub + its layer hoops.
    // Restored on exit; update() then governs their per-frame fade again.
    this.coreGroup.visible = !on;
    for (const m of this.metas) {
      m.hub.visible = !on;
      for (const h of m.hoops) h.visible = !on;
      for (const f of m.fills) f.visible = !on && f.userData.populated !== false; // restore populated fills on exit
      if (on) for (const lb of m.labels) lb.visible = false;
      if (on) {
        (m.tether.material as THREE.LineBasicMaterial).opacity = 0;
        (m.pulseMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }
  }

  // ---------------------------------------------------------------- Core
  private _buildCore() {
    this.coreGroup = new THREE.Group();
    this.coreGroup.rotation.x = HYPER_TILT; // match the tilted node group + hubs (see root)
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

      // Hub sphere = the metagraph's OWN identity colour (user; the cyan structure is carried by the
      // rings + hoops). A little smaller than before so the ring atom leads.
      const hubMat = new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 1.1,
        roughness: 0.3, metalness: 0.4, flatShading: true, transparent: true,
      });
      const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), hubMat);
      hub.userData.pick = { kind: "meta", cfg, title: cfg.name, sub: `Metagraph · ${cfg.ticker}` };
      group.add(hub);
      this.pickables.push(hub);

      // Cyan structural "atom" hoops: one per LAYER, all the same diameter but at different tilt
      // angles (layer index = ring index — same armillaryFrame the nodes use), so L0/dL1/cL1 read
      // as distinct tilted rings. The group only ORBITS (no spin — see update), so hoops + nodes
      // stay registered.
      const hoops = META_LAYERS.map((layer, li) => {
        const h = this._makeHoop(armillaryFrame(li, META_LAYERS.length, META_RING.tilt), META_RING.radii[layer]);
        group.add(h);
        return h;
      });

      // Soft rim-fill disk behind each ring (populated layers only — toggled by setHoopPresence).
      const fills = META_LAYERS.map((layer, li) => {
        const f = this._makeRingFill(armillaryFrame(li, META_LAYERS.length, META_RING.tilt), META_RING.radii[layer]);
        group.add(f);
        return f;
      });

      // One layer-code label per ring, lying IN the ring's tilted plane (3D effect, tilts with the
      // ring — not billboarded) at its outer rim, hidden until this metagraph is focused.
      const labels = META_LAYERS.map((layer, li) => {
        const frame = armillaryFrame(li, META_LAYERS.length, META_RING.tilt);
        const lb = this._makeRingLabel(LAYER_CODE[layer]);
        lb.position.copy(frame.t).multiplyScalar(META_RING.radii[layer] + 0.2);
        storeRingNormal(lb, frame);
        lb.visible = false;
        group.add(lb);
        return lb;
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
      this.metas.push({ group, hub, cfg, state: null, tether, pulseMesh, pulse: 0, anchor: pos.clone(), orbit: an.a, radius: an.radius, incl: an.incl, spin: 0.3 + Math.random() * 0.5, active: true, hoops, fills, labels });
    });
  }

  // Lay a ring label flat IN its ring plane, but oriented so it reads: front toward the camera
  // (whichever side of the plane faces it) and text "up" = world-up projected onto the plane. Runs
  // per frame only for the few CURRENTLY-SHOWN labels, so the 3D tilt is real but text stays legible.
  private _faceLabelInPlane(lb: THREE.Object3D, cam: THREE.Camera): void {
    const localN = lb.userData.ringN as THREE.Vector3 | undefined;
    if (!localN || !lb.parent) return;
    lb.parent.getWorldQuaternion(this._lPQ);
    this._lN.copy(localN).applyQuaternion(this._lPQ).normalize(); // ring normal in world
    lb.getWorldPosition(this._lPos);
    cam.getWorldPosition(this._lCam).sub(this._lPos); // label → camera
    if (this._lN.dot(this._lCam) < 0) this._lN.negate(); // front faces the camera
    // text up = world-up projected onto the plane (fallback if the plane is near-horizontal)
    this._lUp.set(0, 1, 0).addScaledVector(this._lN, -this._lN.y);
    if (this._lUp.lengthSq() < 1e-5) this._lUp.set(0, 0, 1).addScaledVector(this._lN, -this._lN.z);
    this._lUp.normalize();
    this._lRight.crossVectors(this._lUp, this._lN).normalize();
    this._lUp.crossVectors(this._lN, this._lRight); // re-orthogonalize
    this._lM.makeBasis(this._lRight, this._lUp, this._lN);
    this._lQ.setFromRotationMatrix(this._lM); // desired WORLD orientation
    lb.quaternion.copy(this._lPQ).invert().multiply(this._lQ); // → local (relative to the hub group)
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
  setHyperSpin(y: number) {
    this.root.rotation.set(HYPER_TILT, y, 0);
    this.coreGroup.rotation.set(HYPER_TILT, y, 0);
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
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(
        frame.t.clone().multiplyScalar(Math.cos(a) * radius).addScaledVector(frame.b, Math.sin(a) * radius),
      );
    }
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
    if (!this._fillTex) this._fillTex = makeRingFillTexture();
    const geo = new THREE.CircleGeometry(radius, 96);
    const mat = new THREE.MeshBasicMaterial({
      map: this._fillTex, color: new THREE.Color(this._core), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: FILL_OP, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Orient the disk into the ring's tilted plane: CircleGeometry lies in XY (+Z normal) → map its
    // X/Y/Z axes onto the ring's t / b / (t×b) basis.
    const n = frame.t.clone().cross(frame.b).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.t, frame.b, n));
    mesh.renderOrder = -1; // behind the hoops + nodes
    return mesh;
  }

  // A small cyan layer-code label ("L0" / "dL1" / "cL1") as a billboard plane. Text-only (structural
  // annotation → the accent token, not identity); billboarded to the camera each frame in update().
  private _makeRingLabel(text: string): THREE.Mesh {
    const SS = 2;
    const c = document.createElement("canvas");
    c.width = 128 * SS;
    c.height = 64 * SS;
    const ctx = c.getContext("2d")!;
    const cc = new THREE.Color(this._core);
    ctx.fillStyle = `rgba(${Math.round(cc.r * 255)},${Math.round(cc.g * 255)},${Math.round(cc.b * 255)},0.92)`;
    ctx.font = `600 ${34 * SS}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, c.width / 2, c.height / 2 + 2 * SS);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const h = 0.62, w = h * (c.width / c.height);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
    );
    mesh.renderOrder = 3; // over the hoops/nodes
    return mesh;
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
    for (const lb of this._coreLabels) {
      this.coreGroup.remove(lb);
      (lb.material as THREE.MeshBasicMaterial).map?.dispose();
      (lb.material as THREE.Material).dispose();
    }
    this._coreLabels = [];
    for (const s of shells) {
      for (let k = 0; k < s.numRings; k++) {
        const h = this._makeHoop(armillaryFrame(k, s.numRings, s.tilt), s.radius);
        this.coreGroup.add(h);
        this._coreRings.push(h);
      }
      // One shell label (L0 / L1) at the shell's outer edge, lying in its ring plane — shown only
      // while the DAG is focused.
      const frame = armillaryFrame(0, s.numRings, s.tilt);
      const lb = this._makeRingLabel(s.code);
      lb.position.copy(frame.t).multiplyScalar(s.radius + 0.8);
      storeRingNormal(lb, frame);
      lb.visible = false;
      this.coreGroup.add(lb);
      this._coreLabels.push(lb);
    }
  }

  // ---------------------------------------------------------------- Update loop
  // `morph` (0 = Hypergraph, 1 = globe) fades the metagraph hubs out early so
  // they don't visibly collapse into the globe's centre — their real nodes fly
  // out to the map (Globe) instead.
  // `spinFrozen` (set when the camera is zoomed in to inspect) stops the overall SPHERE spin — the
  // core + hub meshes — so a close-up reads still; the per-node axis spin (Globe) keeps going.
  update(dt: number, morph = 0, coreDimTarget = 0, spinFrozen = false, cam?: THREE.Camera, dagFocused = false) {
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
    // Dim the glow as it dissolves so the fading sphere doesn't bloom out the view.
    const coreMat = this.core.material as THREE.MeshStandardMaterial;
    coreMat.emissiveIntensity = (0.6 + flash * 0.9) * coreF * coreReveal * (1 - 0.5 * (1 - coreReveal)) * (1 - this._coreDim * 0.6);
    coreMat.opacity = coreOpacity * coreReveal;
    this.coreGroup.visible = coreReveal > 0.001;
    // The DAG core's cyan "sun" hoops fade with the core on the morph, and dim with it when a
    // specific metagraph is the subject (_coreDim).
    const coreHoopOp = HOOP_OP * coreReveal * (1 - this._coreDim * 0.5);
    for (const h of this._coreRings) (h.material as THREE.LineBasicMaterial).opacity = coreHoopOp;
    // Core shell labels (L0 / L1) — shown only when the DAG is focused; laid in the ring plane +
    // re-oriented each frame (front to camera, upright).
    const showCoreLabels = dagFocused && coreReveal > 0.5 && !this.ledger;
    for (const lb of this._coreLabels) {
      lb.visible = showCoreLabels;
      if (showCoreLabels && cam) this._faceLabelInPlane(lb, cam);
    }
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
      const fdim = focusOther ? 0.62 : 1; // glow / tether
      // Inactive (node-less) metagraphs read as present-but-quiet — dimmer than active, but NOT
      // buried (user: decrease the inactive dim); their rings are all-dotted (setHoopPresence).
      const glowMul = (m.active ? 1 : 0.35) * fdim;
      const hubMat = m.hub.material as THREE.MeshStandardMaterial;
      hubMat.opacity = metaOpacity * (m.active ? 1 : 0.8) * (focusOther ? 0.78 : 1);

      // The tether is a 2-vertex line fixed at the origin → hub. Write the moving endpoint
      // (vertex 1) straight into the existing buffer instead of setFromPoints, which would
      // rebuild the attribute (and drop its GPU buffer) every frame.
      const tetherPos = m.tether.geometry.attributes.position;
      tetherPos.setXYZ(1, _pos.x, _pos.y, _pos.z);
      tetherPos.needsUpdate = true;
      (m.tether.material as THREE.LineBasicMaterial).opacity = 0.22 * metaF * (m.active ? 1 : 0.6) * fdim;
      // The cyan layer hoops fade with the hubs on the morph, dim on inactive / out-of-focus hubs.
      const hoopOp = HOOP_OP * metaF * (m.active ? 1 : 0.7) * fdim;
      for (const h of m.hoops) (h.material as THREE.LineBasicMaterial).opacity = hoopOp;
      // The rim-fill disks fade with the hoops (populated rings only — empty ones were hidden).
      const fillOp = FILL_OP * metaF * (m.active ? 1 : 0.7) * fdim;
      for (const f of m.fills) (f.material as THREE.MeshBasicMaterial).opacity = fillOp;

      // Layer-code labels: ONLY the focused metagraph shows them; they lie in the ring plane but are
      // re-oriented each frame (front to camera, upright) so the 3D tilt reads while staying legible.
      const showLabels = this.focusId === m.cfg.id && metaF > 0.5;
      for (const lb of m.labels) {
        lb.visible = showLabels;
        if (showLabels && cam) this._faceLabelInPlane(lb, cam);
      }

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
