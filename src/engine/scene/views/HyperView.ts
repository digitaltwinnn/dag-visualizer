// The Hypergraph-only furniture that surrounds the shared validator nodes:
//   - the Global L0 core (Hypergraph heart)
//   - orbiting metagraph clusters tethered to L0
//
// The validator nodes themselves live in Globe (they morph between the shell
// layout and the geographic layout). Everything here fades out in the geography
// view by scaling `root` down.

import * as THREE from "three";
import { METAGRAPHS, type MetaConfig } from "../../config";
import { metaAnchor } from "../../domain/hyperLayout";
import type { SceneColors } from "../../sceneColors";
import { R_GLOBE, CORE_R } from "../../domain/morph";

const _pos = new THREE.Vector3(); // scratch for hub orbit positions (reused each frame)

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
  halo!: THREE.Mesh;
  coreFlash?: number;
  private _core: number; // the structural accent (colors.core) — the core sphere + halo hue

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
    for (const m of this.metas) {
      m.hub.visible = !on;
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
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(3.1, 2), mat);
    this.core.userData.pick = {
      kind: "core",
      title: "Global L0 — the Hypergraph core",
      sub: "Security & settlement layer",
    };
    this.coreGroup.add(this.core);

    this.halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(4.4, 1),
      new THREE.MeshBasicMaterial({ color: this._core, wireframe: true, transparent: true, opacity: 0.16 })
    );
    this.coreGroup.add(this.halo);

    // The core lives directly in the scene (not under `root`), so the morph's
    // root-collapse doesn't shrink it — instead it grows into the globe in update().
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
        color: col, emissive: col, emissiveIntensity: 1.1,
        roughness: 0.3, metalness: 0.4, flatShading: true, transparent: true,
      });
      const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), hubMat);
      hub.userData.pick = { kind: "meta", cfg, title: cfg.name, sub: `Metagraph · ${cfg.ticker}` };
      group.add(hub);
      this.pickables.push(hub);

      const tether = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), pos.clone()]),
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.22 })
      );
      this.root.add(tether);

      const pulseMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 12),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0 })
      );
      this.root.add(pulseMesh);

      this.root.add(group);
      this.metas.push({ group, hub, cfg, state: null, tether, pulseMesh, pulse: 0, anchor: pos.clone(), orbit: an.a, radius: an.radius, incl: an.incl, spin: 0.3 + Math.random() * 0.5, active: true });
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

  // ---------------------------------------------------------------- Update loop
  // `morph` (0 = Hypergraph, 1 = globe) fades the metagraph hubs out early so
  // they don't visibly collapse into the globe's centre — their real nodes fly
  // out to the map (Globe) instead.
  update(dt: number, morph = 0) {
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

    // Core pulse + flash, plus the morph "core -> globe" transform: the blue
    // Hypergraph heart swells out to the globe's radius and dissolves as the Earth
    // fades in beneath the nodes, so it reads as the core becoming the globe.
    const flash = this.coreFlash || 0;
    // Reach the globe's full radius early (by ~0.5) so the core is the SAME size
    // as the Earth during the cross-fade, then dissolve sooner to hand off.
    const grow = THREE.MathUtils.lerp(1, R_GLOBE / CORE_R, THREE.MathUtils.clamp(morph / 0.5, 0, 1));
    const coreReveal = 1 - THREE.MathUtils.clamp((morph - 0.3) / 0.35, 0, 1); // 1 -> 0 over 0.3..0.65
    const pulse = 1 + Math.sin(t * 1.6) * 0.04 + flash * 0.25;
    this.core.scale.setScalar(pulse * grow);
    this.core.rotation.y += dt * 0.25;
    this.core.rotation.x += dt * 0.12;
    // Dim the glow as it expands so the swelling sphere doesn't bloom out the view.
    const coreMat = this.core.material as THREE.MeshStandardMaterial;
    coreMat.emissiveIntensity = (0.6 + flash * 0.9) * coreF * coreReveal * (1 - 0.5 * (1 - coreReveal));
    coreMat.opacity = coreOpacity * coreReveal;
    this.coreGroup.visible = coreReveal > 0.001;
    // The wireframe halo only makes sense at Hypergraph scale — fade it out early.
    (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.16 * coreF * THREE.MathUtils.clamp(1 - morph / 0.25, 0, 1);
    this.halo.rotation.y -= dt * 0.15;
    this.halo.rotation.z += dt * 0.08;
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
      if (!frozen) m.group.rotation.y += dt * m.spin;
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
