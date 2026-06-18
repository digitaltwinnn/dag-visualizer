// The Hypergraph-only furniture that surrounds the shared validator nodes:
//   - the Global L0 core (Hypergraph heart)
//   - orbiting metagraph clusters tethered to L0
//
// The validator nodes themselves live in Globe (they morph between the shell
// layout and the geographic layout). Everything here fades out in the geography
// view by scaling `root` down.

import * as THREE from "three";
import { COLORS, METAGRAPHS, metaAnchor } from "./config.js";

const R_GLOBE = 16;  // must match Globe's R — the radius the core grows out to
const CORE_R = 3.1;  // the core IcosahedronGeometry radius

export class Layers {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.pickables = [];
    this.metas = [];

    this._buildCore();
    this._buildMetagraphs();

    this.clock = 0;

    // Highlight/dim state for the "Understand the network" panel: when a topic
    // is selected, the unrelated furniture fades toward dark. 0 = full bright,
    // 1 = fully dimmed; `dim` eases toward `dimTarget` in the update loop.
    this.dim = { core: 0, meta: 0 };
    this.dimTarget = { core: 0, meta: 0 };

    // When a metagraph is focused in the Hypergraph, its hub's orbit is paused
    // (anchored) so it stays framed & in focus; the rest keep orbiting.
    this.focusId = null;
  }

  // Focus one topic from the learn panel and dim the rest. `focus` is one of
  // overview | l0 | l1 | metagraphs | null (null/overview clears the dim).
  setHighlight(focus) {
    let core = 0, meta = 0;
    if (focus === "l0")            { meta = 1; }            // core stays lit
    else if (focus === "l1")       { core = 1; meta = 1; }  // outer shell only
    else if (focus === "metagraphs") { core = 1; }          // metas stay lit
    this.dimTarget.core = core;
    this.dimTarget.meta = meta;
  }

  // ---------------------------------------------------------------- Core
  _buildCore() {
    this.coreGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.core, emissive: COLORS.core, emissiveIntensity: 1.4,
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
      new THREE.MeshBasicMaterial({ color: COLORS.core, wireframe: true, transparent: true, opacity: 0.16 })
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
  pulseMeta(metaId) {
    const m = this.metas.find((x) => x.cfg.id === metaId);
    if (m) m.pulse = 1;
  }

  // ---------------------------------------------------------------- Metagraphs
  _buildMetagraphs() {
    const n = METAGRAPHS.length;
    METAGRAPHS.forEach((cfg, i) => {
      const group = new THREE.Group();
      const an = metaAnchor(i, n);
      const pos = new THREE.Vector3(an.x, an.y, an.z);
      group.position.copy(pos);

      const hubMat = new THREE.MeshStandardMaterial({
        color: cfg.color, emissive: cfg.color, emissiveIntensity: 1.1,
        roughness: 0.3, metalness: 0.4, flatShading: true, transparent: true,
      });
      const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), hubMat);
      hub.userData.pick = { kind: "meta", cfg, title: cfg.name, sub: `Metagraph · ${cfg.ticker}` };
      group.add(hub);
      this.pickables.push(hub);

      const tether = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), pos.clone()]),
        new THREE.LineBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.22 })
      );
      this.root.add(tether);

      const pulseMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 12),
        new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0 })
      );
      this.root.add(pulseMesh);

      this.root.add(group);
      this.metas.push({ group, hub, cfg, state: null, tether, pulseMesh, pulse: 0, anchor: pos.clone(), orbit: an.a, radius: an.radius, incl: an.incl, spin: 0.3 + Math.random() * 0.5 });
    });
  }

  // Updates a hub's latest-snapshot state (for the inspector). The hub->core packet
  // is no longer fired here — it's driven by the real `anchor` event via pulseMeta.
  updateMeta(name, state) {
    const m = this.metas.find((x) => x.cfg.name === name);
    if (!m) return;
    m.state = state;
    m.hub.userData.pick.state = state;
  }

  // ---------------------------------------------------------------- Update loop
  // `morph` (0 = Hypergraph, 1 = globe) fades the metagraph hubs out early so
  // they don't visibly collapse into the globe's centre — their real nodes fly
  // out to the map (Globe) instead.
  update(dt, morph = 0) {
    this.clock += dt;
    const t = this.clock;

    // Hubs are fully gone by ~30% into the morph, before the root-scale collapse
    // would be noticeable.
    const hubFade = THREE.MathUtils.clamp(1 - morph / 0.3, 0, 1);

    // Ease the highlight dim levels toward their targets, then derive a glow
    // multiplier (coreF/metaF) and an opacity for each dimmable group.
    const k = Math.min(1, dt * 4);
    this.dim.core += (this.dimTarget.core - this.dim.core) * k;
    this.dim.meta += (this.dimTarget.meta - this.dim.meta) * k;
    const coreF = 1 - this.dim.core * 0.9;
    const metaF = (1 - this.dim.meta * 0.9) * hubFade;
    const coreOpacity = 1 - this.dim.core * 0.85;
    const metaOpacity = (1 - this.dim.meta * 0.85) * hubFade;

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
    this.core.material.emissiveIntensity = (1.4 + flash * 1.2) * coreF * coreReveal * (1 - 0.5 * (1 - coreReveal));
    this.core.material.opacity = coreOpacity * coreReveal;
    this.coreGroup.visible = coreReveal > 0.001;
    // The wireframe halo only makes sense at Hypergraph scale — fade it out early.
    this.halo.material.opacity = 0.16 * coreF * THREE.MathUtils.clamp(1 - morph / 0.25, 0, 1);
    this.halo.rotation.y -= dt * 0.15;
    this.halo.rotation.z += dt * 0.08;
    if (this.coreFlash) this.coreFlash = Math.max(0, this.coreFlash - dt * 1.6);

    // Metagraphs — orbit, spin, tether pulses
    for (const m of this.metas) {
      if (m.cfg.id !== this.focusId) m.orbit += dt * 0.03; // anchor the focused hub
      const a = m.orbit;
      const pos = new THREE.Vector3(
        Math.cos(a) * m.radius,
        Math.sin(a) * m.radius * Math.sin(m.incl) + (m.anchor.y * 0.4),
        Math.sin(a) * m.radius * Math.cos(m.incl)
      );
      m.group.position.copy(pos);
      m.group.rotation.y += dt * m.spin;
      m.group.visible = hubFade > 0.001;
      m.hub.rotation.x += dt * 0.5;
      m.hub.material.opacity = metaOpacity;

      m.tether.geometry.setFromPoints([new THREE.Vector3(), pos]);
      m.tether.geometry.attributes.position.needsUpdate = true;
      m.tether.material.opacity = 0.22 * metaF;

      if (m.pulse > 0) {
        m.pulse = Math.max(0, m.pulse - dt * 0.7);
        const e = 1 - m.pulse;
        m.pulseMesh.position.copy(pos).multiplyScalar(1 - e);
        m.pulseMesh.material.opacity = Math.sin(m.pulse * Math.PI) * 0.9 * metaF;
        m.hub.material.emissiveIntensity = (1.1 + m.pulse * 1.6) * metaF;
      } else {
        m.pulseMesh.material.opacity = 0;
        m.hub.material.emissiveIntensity = 1.1 * metaF;
      }
    }
  }
}
