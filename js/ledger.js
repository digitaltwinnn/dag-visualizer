// The Snapshots (ledger) view, rendered on the shared Three.js canvas like the other views.
//
// A 3D stack of transparent glass FLOORS (one per layer; see config.LEDGER). The producer NODES
// are the SAME node meshes reused from the hyper/geo views, placed into their lanes by globe.js.
// This module owns what's unique to the view:
//   • the glass floor panes,
//   • the centred live global snapshot block + its left-trailing chain of completed snapshots,
//   • each metagraph's lane of snapshot blocks (real where it anchored, an empty placeholder where
//     it didn't), all drawn in one InstancedMesh,
//   • the node-group rings, and the per-block anchor LINKS + travelling pulses.
//
// Factual basis: block sizes come from anchored counts; links/pulses/rings come straight from the
// live getAnchor(ts).metaCounts — nothing fabricated. With no snapshot the centre block hides.

import * as THREE from "three";
import { COLORS, LEDGER, METAGRAPHS, ledgerSite, clusterRadius } from "./config.js";

// The glass floor heights (top→bottom): data producers · metagraph L1 · metagraph L0 · metagraph
// snapshots · hypergraph (global) L0 · hypergraph (DAG) L1. All one colour — labels (not colour) name
// them; the metagraph-snapshots floor is unlabelled (the snapshot blocks self-identify).
const FLOOR_Y = [LEDGER.rowProducers, LEDGER.rowML1, LEDGER.rowML0, LEDGER.rowMSnap, LEDGER.rowGL0, LEDGER.rowHypL0, LEDGER.rowDAGL1];

// Short layer labels. Two kinds of floor: node/validator layers (metagraph L1/L0, hypergraph L1) and
// snapshot/ledger layers (the L0 outputs — "metagraph snapshots", "global snapshots"). "data
// producers" is the symbolic top layer. Drawn at the front-left of each floor.
const FLOOR_LABELS = [
  { y: LEDGER.rowProducers, text: "data producers" },
  { y: LEDGER.rowML1, text: "metagraph L1" },
  { y: LEDGER.rowML0, text: "metagraph L0" },
  { y: LEDGER.rowMSnap, text: "metagraph snapshots" },
  { y: LEDGER.rowGL0, text: "global snapshots" },
  { y: LEDGER.rowHypL0, text: "hypergraph L0" },
  { y: LEDGER.rowDAGL1, text: "hypergraph L1" },
];

const PULSE_MAX = 220;       // pooled travelling-pulse instances
const PULSE_STAGGER = 0.035; // s between successive pulse emissions (a steady stream)
const META_TRAIL_MAX = 1500; // pooled metagraph trail-block instances — one per anchored snapshot,
                             // summed over all lanes × SLOT_N. A busy tick anchors ~138, so this is
                             // generous headroom (InstancedMesh cost is trivial; loop breaks if over).
const SLOT_SP = 3.6;         // X spacing of one tick/slot — SHARED by the global + metagraph chains
const SLOT_N = 9;            // visible blocks per chain (global + each metagraph lane)
const BLOCK_SIZE = 0.34;     // max size of an individual metagraph-snapshot tile (per-size = TODO)
// Z width of one lane (gap between adjacent lane sites) — the grid's depth budget.
const LANE_GAP_Z = Math.abs(ledgerSite(1, METAGRAPHS.length).z - ledgerSite(0, METAGRAPHS.length).z);
const LINK_CURVES = 110;     // max per-block anchor links drawn at once
const LINK_SEG = 44;         // line segments each link is tessellated into (smooth, not pointy — the
                            // curve swings through the global-L0 cluster so it needs a fine tessellation)
const LINK_VFRAC = 0.55;     // fraction of the anchor curve that drops straight down (MSnap→ML0)

// Block/link opacity from recency: 1 at the lead/newest, fading to 0 by the far (oldest) slot. A
// gentle linear cue — the heavy "old fades out" is now the depth FOG (scene-level, see Engine).
const slotFade = (slot) => Math.min(1, Math.max(0, 1 - (slot - 1) / (SLOT_N - 1)));

// One component of a cubic bézier (p0→p1, controls c0,c1) at t.
const cubic = (t, p0, c0, c1, p1) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * c0 + 3 * u * t * t * c1 + t * t * t * p1;
};

// A point at parameter t on the LITERAL production→anchor curve, in the metagraph's lane (sx, sz):
// straight DOWN the column from the data PRODUCERS (top) through L1 + L0 to the metagraph snapshot
// tile for t<LINK_VFRAC — passing the L1/L0 ring centres — then a cubic that swings to the lane CENTRE
// (z→0) by the hypergraph-L0 floor so it passes THROUGH the global validator cluster, then drops into
// the global block at (gx, GL0, 0). Used by the pulse path + the link.
function curvePoint(t, sx, sz, gx, out) {
  const top = LEDGER.rowProducers, snap = LEDGER.rowMSnap, ey = LEDGER.rowGL0;
  if (t <= LINK_VFRAC) return out.set(sx, top + (snap - top) * (t / LINK_VFRAC), sz);
  const u = (t - LINK_VFRAC) / (1 - LINK_VFRAC);
  const dy = (snap - ey) * 0.5;
  // z control (sz,sz,0,0): flat tangent at BOTH ends (smooth top junction + smooth landing) with the
  // swing toward centre in the MIDDLE — passes near the global-L0 cluster, no pointy top.
  return out.set(cubic(u, sx, sx, gx, gx), cubic(u, snap, snap - dy, ey + dy, ey), cubic(u, sz, sz, 0, 0));
}

const _dummy = new THREE.Object3D();
const _col = new THREE.Color();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3(); // scratch for link curve points
const _gx = new Map();          // reused per-frame: slot → global block X
// Quiet neutral the whole row (tiles + links) fades TO as it trails into the background — a deeply
// toned-down muted CYAN (the layer/global tone, not a grey). The metagraph trail mesh is ADDITIVE, so
// this low magnitude also reads as semi-transparent over the dark background. Metagraph colour is kept
// only at the live lead / when the snapshot is selected, so the background isn't a wall of colour.
const NEUTRAL_TILE = new THREE.Color(0.085, 0.24, 0.28);
const CORE_COLOR = new THREE.Color(COLORS.core); // bright cyan for the live/selected global block

export class Ledger {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.pickables = [];
    this.t = 0;
    this._latest = null;
    this._baseR = 1;

    // Anchor animation state. _anchorGroup holds the node-group rings (built once, persistent).
    this._anchorGroup = new THREE.Group();
    this.group.add(this._anchorGroup);
    this._ringGeo = new THREE.RingGeometry(0.84, 1.0, 36); // shared unit ring (scaled per group)
    this._curves = new Map();   // metaId -> { sx, sz, color, rings } (sx/sz = pulse curve origin)
    this._pulses = [];          // active { rec, t, speed }
    this._queue = [];           // pending emissions { id, dueAt }
    this._emitted = new Map();  // metaId -> pulses already emitted for the current tick
    this._tickOrdinal = null;
    this._lastDue = 0;
    this._flash = 0;            // centre-block arrival flash
    this._gL0Glow = 0;          // hypergraph-L0 ring glow — lights as anchor pulses reach that cluster
    this._selectedOrd = null;   // ordinal of the selected/hovered snapshot (from the LiveStrip / pick)
    this._selectedSlot = -1;    // its current slot (so its tiles stay COLOURED in the trail) — derived
    this._filter = "all";       // metagraph filter; when a single metagraph, the OTHERS go neutral

    // The global chain: completed snapshots become solid blocks that march LEFT into a trail (newest
    // just-left-of-centre, older further left). Mirrors the bottom bar-chart's left→right = old→new.
    this._trailGroup = new THREE.Group();
    this.group.add(this._trailGroup);
    this._trail = [];           // { mesh, slot } (X lives on mesh.position.x)
    this._trailGeo = new THREE.BoxGeometry(1.4, 1.4, 0.4); // shared by the centre + trail blocks

    // Per-metagraph chains: each metagraph's snapshot blocks trail left in its own lane (real where
    // it anchored, empty placeholder where it didn't). All drawn in one InstancedMesh.
    this._metaLanes = new Map(); // id -> { z, color, blocks:[{ x, slot, fade, size, filled }] }
    this._tickMetas = new Map(); // id -> count anchored in the CURRENT tick (flushed on tick change)
    this._metaLastDrawn = 0;

    this._buildFloors();
    this._buildCenter();
    this._buildPulses();
    this._buildMetaTrail();
    this._buildLinks();
    this._buildCurves(); // persistent flow line + rings per metagraph (kept as the visual linkage)

    // The hypergraph-L0 participation ring: a single ring round the global validator cluster that
    // lights up as it produces each new global snapshot (mirrors the metagraph node-group rings).
    this._gL0Ring = this._makeRing(0, LEDGER.rowHypL0, 0, COLORS.core);
    this._gL0Ring.scale.setScalar(LEDGER.dagCell + 0.7);
    this.group.add(this._gL0Ring);
  }

  // Per-block link segments: every completed metagraph block draws a line to the global block of
  // the same tick (they share an X). Rebuilt from the live block positions each frame so the links
  // travel left WITH the blocks. One dynamic LineSegments, coloured per metagraph.
  _buildLinks() {
    const geo = new THREE.BufferGeometry();
    const maxVerts = LINK_CURVES * LINK_SEG * 2;
    this._linkPos = new Float32Array(maxVerts * 3);
    this._linkCol = new Float32Array(maxVerts * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(this._linkPos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this._linkCol, 3));
    geo.setDrawRange(0, 0);
    this._linkGeo = geo;
    this._linkMesh = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.38, // soft
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this._linkMesh.frustumCulled = false;
    this.group.add(this._linkMesh);
  }

  // Build the persistent node-group rings (+ cache the pulse-curve origin) for every metagraph,
  // once. The rings stay regardless of anchoring; pulses travel the curve only when it anchors.
  _buildCurves() {
    for (const m of METAGRAPHS) this._addCurve(m.id);
  }

  // Live per-metagraph node counts per floor (from the globe) → size each ring to fit its dots.
  // `groups` = { metaId: { l0, l1 } }.
  setGroupSizes(groups) {
    if (!groups) return;
    for (const [id, rec] of this._curves) {
      const g = groups[id];
      if (!g) continue;
      for (const r of rec.rings) r.radius = clusterRadius(r.floor === "l0" ? g.l0 : g.l1);
    }
  }

  _buildMetaTrail() {
    this._metaTrailMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 0.35),
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      META_TRAIL_MAX,
    );
    this._metaTrailMesh.frustumCulled = false;
    this._metaTrailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < META_TRAIL_MAX; i++) this._metaTrailMesh.setColorAt(i, _col.set(0xffffff));
    _dummy.scale.setScalar(0);
    _dummy.updateMatrix();
    for (let i = 0; i < META_TRAIL_MAX; i++) this._metaTrailMesh.setMatrixAt(i, _dummy.matrix);
    this._metaTrailMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this._metaTrailMesh);
  }

  // Get (or lazily create) metagraph `i`'s lane record (keyed by id), positioned at its Z site.
  _lane(id, i) {
    let lane = this._metaLanes.get(id);
    if (!lane) {
      const s = ledgerSite(i, METAGRAPHS.length);
      lane = { id, z: s.z, color: new THREE.Color(METAGRAPHS[i].color), blocks: [] };
      this._metaLanes.set(id, lane);
    }
    return lane;
  }

  // Each anchored snapshot is a SEPARATE tile (no cap — a metagraph can anchor dozens into one tick),
  // laid out as a RECTANGULAR GRID. Spacing is UNIFORM and tiles continuously across ticks (X step =
  // SLOT_SP/cols) and lanes (Z step = LANE_GAP_Z/rows), with the grid INSET (centred) so an edge tile
  // never touches the neighbouring tick/lane — the gap matches the in-grid gap. Tiles shrink to fit.
  // The k=0 tile carries the single anchor link (drawn from the lane centre, so any tile works).
  _anchorTiles(count) {
    if (count <= 1) return [{ ox: 0, oz: 0, size: BLOCK_SIZE, link: true }];
    const cols = Math.min(count, Math.max(1, Math.round(Math.sqrt(count * (SLOT_SP / LANE_GAP_Z)))));
    const rows = Math.ceil(count / cols);
    const stepX = SLOT_SP / cols, stepZ = LANE_GAP_Z / rows; // uniform pitch → consistent gaps everywhere
    const size = Math.min(BLOCK_SIZE, 0.7 * Math.min(stepX, stepZ));
    const x0 = -((cols - 1) * stepX) / 2, z0 = -((rows - 1) * stepZ) / 2;
    const tiles = [];
    for (let k = 0; k < count; k++) {
      const r = Math.floor(k / cols), c = k % cols;
      const inRow = Math.min(cols, count - r * cols);          // tiles in this row (last row may be short)
      const ox = x0 + ((cols - inRow) / 2) * stepX + c * stepX; // centre a partial last row
      const oz = rows > 1 ? z0 + r * stepZ : 0;
      tiles.push({ ox, oz, size, link: k === 0 });
    }
    return tiles;
  }

  // A metagraph anchored into the LIVE tick → (re)build its slot-0 cluster: ONE tile per anchored
  // snapshot (it can anchor several per tick), aligned with the live global tile so the link is drawn
  // there + the anchoring animates right away. Re-runs as the count settles; preserves the slot-0 ease.
  _anchorMetaBlock(id, count) {
    const i = METAGRAPHS.findIndex((m) => m.id === id);
    if (i < 0) return; // unlisted — no lane
    const lane = this._lane(id, i);
    let bx = 0, bfade = 0;
    for (let j = lane.blocks.length - 1; j >= 0; j--) {
      if (lane.blocks[j].slot === 0) { bx = lane.blocks[j].x; bfade = lane.blocks[j].fade; lane.blocks.splice(j, 1); }
    }
    for (const tl of this._anchorTiles(count)) {
      lane.blocks.unshift({ x: bx, slot: 0, fade: bfade, ox: tl.ox, oz: tl.oz, size: tl.size, filled: true, link: tl.link });
    }
  }

  // One transparent GLASS pane per layer — a SQUARE sheet (no grid lines) with SOFT edges that
  // dissolve into the background. Shifted back over the trails (−X) so the empty area in front of
  // the lead (toward the camera) isn't covered, keeping the black background visible there.
  _buildFloors() {
    // Panes span the whole trail again, but are VERY transparent so even where they stack in perspective
    // they stay a subtle hint of a layer (not a wall) — the black background still reads through.
    const W = 38;        // X extent (camera-depth) — tight to the lead + trail span
    const D = 44;        // Z extent — tight to the lanes
    const cx = -16;      // centred on the content; +X (in front of the lead) stays black
    for (const y of FLOOR_Y) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this._paneMat(COLORS.core, 0.007));
      pane.rotation.x = -Math.PI / 2; // lie flat in the X/Z plane (W→X, D→Z)
      pane.position.set(cx, y, 0);
      pane.renderOrder = -1;
      this.group.add(pane);
    }
    // Front-left layer labels — printed flat ON each floor, tucked into its front-left corner.
    const lx = cx + W / 2 - 2, lz = D / 2 - 2.5;
    for (const { y, text } of FLOOR_LABELS) this.group.add(this._makeLabel(text, lx, y, lz));
  }

  // A flat, quiet text label lying ON a floor (not a billboard) — the very-short layer name, printed
  // on the glass, run parallel to the lane (Z) edge and readable from the default camera.
  _makeLabel(text, x, y, z) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const ctx = c.getContext("2d");
    ctx.font = "300 23px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(170,196,224,0.4)"; // subtle, low-contrast
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const h = 1.35, w = h * (c.width / c.height);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }),
    );
    // Lie flat, aligned to the floor's lane (Z) edge, oriented so it reads from the camera side.
    mesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(0, 0, -1),  // canvas right → -Z (along the edge, screen-right)
        new THREE.Vector3(-1, 0, 0),  // canvas up    → -X (tops of letters away from the camera)
        new THREE.Vector3(0, 1, 0),   // normal       → up off the floor
      ),
    );
    mesh.position.set(x, y + 0.06, z);
    mesh.renderOrder = 2;
    return mesh;
  }

  // Simple flat transparent pane — just a faint tint, NORMAL blending (not additive/glass), with a
  // barely-there fade right at the very edge so it doesn't end on a razor line.
  _paneMat(color, opacity) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: `
        varying vec2 vP;
        void main() {
          vP = uv * 2.0 - 1.0; // -1..1 across the rectangle
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity; varying vec2 vP;
        void main() {
          float e = max(abs(vP.x), abs(vP.y));          // distance to the edge
          float fade = 1.0 - smoothstep(0.96, 1.0, e);  // flat, just a hair of edge softening
          if (fade <= 0.002) discard;
          gl_FragColor = vec4(uColor, uOpacity * fade);
        }`,
    });
  }

  // The live global snapshot at centre — a SOLID block (it's always a real snapshot). When the
  // next tick lands a copy solidifies into the trail (see _spawnTrailTile). Clicking it opens the
  // snapshot card.
  _buildCenter() {
    this.centerMat = new THREE.MeshStandardMaterial({
      color: COLORS.core, emissive: COLORS.core, emissiveIntensity: 0.6, // kept low so it doesn't bloom out
      roughness: 0.4, metalness: 0.2, flatShading: true,
    });
    this.center = new THREE.Mesh(this._trailGeo, this.centerMat);
    this.center.position.set(0, LEDGER.rowGL0, 0);
    this.center.rotation.x = -Math.PI / 2; // lie the tile flat on the global-snapshot floor
    this.group.add(this.center);
    this.pickables = [this.center];
  }

  // A completed snapshot drops a SOLID block at centre that slides left into the trail; everything
  // already in the trail shifts one slot further left. `size` = that snapshot's tile scale; `ordinal`
  // tags which snapshot it is (so a selected/hovered tick can be found by ordinal → slot).
  _spawnTrailTile(size, ordinal) {
    for (const t of this._trail) t.slot += 1;
    const mesh = new THREE.Mesh(
      this._trailGeo,
      new THREE.MeshStandardMaterial({
        color: COLORS.core, emissive: COLORS.core, emissiveIntensity: 0.45,
        roughness: 0.45, metalness: 0.2, flatShading: true, transparent: true, opacity: 0,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, LEDGER.rowGL0, 0);
    mesh.scale.setScalar(size);
    this._trailGroup.add(mesh);
    this._trail.unshift({ mesh, slot: 1, ordinal });
    while (this._trail.length > SLOT_N) {
      const old = this._trail.pop();
      this._trailGroup.remove(old.mesh);
      old.mesh.material.dispose(); // geometry is shared (_trailGeo)
    }
  }

  // Pre-populate the trail + lanes from the retained snapshot window (the same buffer the LiveStrip
  // bar-chart reads) so the chain isn't empty on entry — it just continues live afterwards. Called
  // once, on the first data, for the SLOT_N completed ticks behind the live one. Blocks/tiles are
  // placed directly at their resting slot (no left-shift animation) so they appear already built up.
  _seedHistory(snaps, getAnchor) {
    const n = snaps.length;
    const count = Math.min(SLOT_N, n - 1); // ticks behind the latest (the latest is the live centre)
    for (let s = 1; s <= count; s++) {
      const snap = snaps[n - 1 - s];
      const total = typeof snap.metagraphSnapshotCount === "number" ? snap.metagraphSnapshotCount : 0;
      this._seedTile(1.0 + Math.min(1, total / 24) * 1.6, s, snap.ordinal);
      const a = getAnchor ? getAnchor(snap.timestamp) : null;
      const counts = a && a.metaCounts ? a.metaCounts : null;
      for (let i = 0; i < METAGRAPHS.length; i++) {
        const id = METAGRAPHS[i].id;
        const nc = counts ? counts.get(id) || 0 : 0;
        const lane = this._lane(id, i);
        if (nc > 0) {
          if (!this._curves.get(id)) this._addCurve(id); // ensure its node-group rings exist
          for (const tl of this._anchorTiles(nc)) {
            lane.blocks.push({ x: -s * SLOT_SP, slot: s, fade: slotFade(s), ox: tl.ox, oz: tl.oz, size: tl.size, filled: true, link: tl.link });
          }
        } else {
          lane.blocks.push({ x: -s * SLOT_SP, slot: s, fade: slotFade(s), ox: 0, oz: 0, size: 0.17, filled: false, link: false });
        }
      }
    }
  }

  // A trail tile placed directly at a slot (history seeding — already at its resting X/opacity).
  _seedTile(size, slot, ordinal) {
    const mesh = new THREE.Mesh(
      this._trailGeo,
      new THREE.MeshStandardMaterial({
        color: COLORS.core, emissive: COLORS.core, emissiveIntensity: 0.45,
        roughness: 0.45, metalness: 0.2, flatShading: true, transparent: true,
        opacity: 0.92 * slotFade(slot),
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(-slot * SLOT_SP, LEDGER.rowGL0, 0);
    mesh.scale.setScalar(size);
    this._trailGroup.add(mesh);
    this._trail.push({ mesh, slot, ordinal });
  }

  // Pooled glowing spheres that travel the anchor flow lines.
  _buildPulses() {
    this._pulseMat = new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._pulseMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 8), this._pulseMat, PULSE_MAX);
    this._pulseMesh.frustumCulled = false;
    this._pulseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < PULSE_MAX; i++) this._pulseMesh.setColorAt(i, _col.set(0xffffff)); // alloc instanceColor
    this._hideAllPulses();
    this.group.add(this._pulseMesh);
  }

  _hideAllPulses() {
    _dummy.position.set(0, 0, 0);
    _dummy.scale.setScalar(0);
    _dummy.updateMatrix();
    for (let i = 0; i < PULSE_MAX; i++) this._pulseMesh.setMatrixAt(i, _dummy.matrix);
    this._pulseMesh.instanceMatrix.needsUpdate = true;
  }

  // Build metagraph `id`'s node-group rings + cache its pulse-curve origin (the lane site). The
  // visible anchor line is NOT built here — it's drawn dynamically per block in the link pass
  // (via curvePoint) so it travels with the block; only the pulses use the cached origin.
  _addCurve(id) {
    const i = METAGRAPHS.findIndex((m) => m.id === id);
    if (i < 0) return null; // unlisted — no site
    const s = ledgerSite(i, METAGRAPHS.length);
    const color = METAGRAPHS[i].color;
    // Rings around the L1 + L0 node groups this metagraph produces from; they light up as a pulse
    // passes through (see update).
    const dR = clusterRadius(3); // default until the live node counts arrive (setGroupSizes)
    const rings = [
      { mesh: this._makeRing(s.x, LEDGER.rowML1, s.z, color), y: LEDGER.rowML1, glow: 0, radius: dR, floor: "l1" },
      { mesh: this._makeRing(s.x, LEDGER.rowML0, s.z, color), y: LEDGER.rowML0, glow: 0, radius: dR, floor: "l0" },
    ];
    for (const r of rings) {
      r.mesh.scale.setScalar(r.radius);
      this._anchorGroup.add(r.mesh);
    }
    const rec = { sx: s.x, sz: s.z, color, rings };
    this._curves.set(id, rec);
    return rec;
  }

  // A thin ring lying flat on a floor, sharing the unit `_ringGeo` (scaled per group to its
  // count-based radius — see setGroupSizes / the update glow loop) so it fits the dots.
  _makeRing(x, y, z, color) {
    const ring = new THREE.Mesh(
      this._ringGeo,
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2; // lie flat on the floor
    ring.position.set(x, y + 0.02, z);
    ring.userData.baseOpacity = 0; // INVISIBLE at rest; only shows while a pulse is passing through it
    return ring;
  }

  _clearCurves() {
    for (const o of this._anchorGroup.children.slice()) {
      this._anchorGroup.remove(o);
      o.material?.dispose(); // geometry is the shared _ringGeo (disposed once in dispose)
    }
    this._curves.clear();
  }

  // Re-read the live tick. `snaps` = the Global L0 buffer (oldest→newest); `getAnchor(ts)` = the
  // per-tick anchor aggregate ({ count, fee, metaCounts:Map(id→n) }).
  setData(snaps, getAnchor) {
    const latest = snaps && snaps.length ? snaps[snaps.length - 1] : null;
    this._latest = latest;
    if (!latest) {
      this.center.visible = false;
      this.center.userData.pick = null;
      return;
    }
    this.center.visible = true;
    // First data after entering the view: seed the trail + lanes from the retained history so it's
    // already built up (instead of filling in live over the next ~SLOT_N ticks).
    if (this._tickOrdinal === null && snaps.length > 1) this._seedHistory(snaps, getAnchor);
    const isNewTick = latest.ordinal !== this._tickOrdinal;
    const prevBaseR = this._baseR; // size of the snapshot that is now completing (for its trail block)
    const total = typeof latest.metagraphSnapshotCount === "number" ? latest.metagraphSnapshotCount : 0;
    // Size by anchored count (clamped) so a busy tick reads bigger; never fabricate a minimum.
    this._baseR = 1.0 + Math.min(1, total / 24) * 1.6;
    const blk = Array.isArray(latest.blocks) ? latest.blocks.length : 0;
    const blkTxt = blk > 0 ? ` · ${blk} DAG-L1 block${blk === 1 ? "" : "s"}` : "";
    this.center.userData.pick = {
      kind: "snapshot",
      data: latest,
      title: `Global snapshot #${latest.ordinal}`,
      sub: `${total} metagraph snapshot${total === 1 ? "" : "s"} anchored${blkTxt}`,
    };

    // ── live anchor animation: emit a pulse per metagraph snapshot anchored into this tick ──
    const a = getAnchor ? getAnchor(latest.timestamp) : null;
    if (isNewTick) {
      // The previous snapshot completed → drop it into the global trail and advance every lane one
      // slot; then seed the new live tick with an empty placeholder at slot 0 for each metagraph
      // (upgraded to a real block when it anchors). Rings/curves are persistent, not reset here.
      if (this._tickOrdinal !== null) {
        this._spawnTrailTile(prevBaseR, this._tickOrdinal); // the snapshot now completing is _tickOrdinal
        // Advance every lane one slot — the live slot-0 blocks become slot 1 (real or empty), scroll.
        for (const lane of this._metaLanes.values()) {
          for (const b of lane.blocks) b.slot += 1;
          while (lane.blocks.length && lane.blocks[lane.blocks.length - 1].slot > SLOT_N) lane.blocks.pop();
        }
      }
      this._tickMetas.clear();
      this._tickOrdinal = latest.ordinal;
      this._emitted.clear();
      this._queue.length = 0;
      // The new LIVE tick starts with an empty placeholder at slot 0 for EVERY metagraph (shown on
      // the latest too); _anchorMetaBlock upgrades it to a real, sized block if the metagraph anchors.
      for (let i = 0; i < METAGRAPHS.length; i++) {
        this._lane(METAGRAPHS[i].id, i).blocks.unshift({ x: 0, slot: 0, fade: 0, ox: 0, oz: 0, size: 0.17, filled: false, link: false });
      }
      // Curves are persistent now (the linkage stays) — don't clear them per tick.
    }
    if (!a || !a.metaCounts) return;
    const mf = this._filter !== "all" && this._filter !== "dag" ? this._filter : null;
    for (const [id, n] of a.metaCounts) {
      this._tickMetas.set(id, n); // remember for this metagraph's lane block when the tick completes
      const prev = this._emitted.get(id) || 0;
      if (n <= prev) continue;
      const rec = this._curves.get(id) || this._addCurve(id);
      if (!rec) {
        this._emitted.set(id, n); // unlisted: no curve, but don't re-check
        continue;
      }
      this._anchorMetaBlock(id, n); // draw the real block at the lead now + animate the anchoring
      // Only the selected metagraph emits pulses (so only ITS rings light) when a filter is active.
      if (!mf || id === mf) {
        for (let k = prev; k < n && this._queue.length < PULSE_MAX * 2; k++) {
          this._lastDue = Math.max(this.t, this._lastDue + PULSE_STAGGER); // global stagger = a stream
          this._queue.push({ id, dueAt: this._lastDue });
        }
      }
      this._emitted.set(id, n);
    }
    this._recomputeSelectedSlot(); // slots just shifted on a new tick → refresh which slot is selected
  }

  // The selected/hovered snapshot (by ordinal, from the LiveStrip bar-chart or the centre pick) keeps
  // its metagraph COLOUR even after it trails into the neutral background. Null = nothing selected.
  setSelected(ordinal) {
    this._selectedOrd = ordinal == null ? null : ordinal;
    this._recomputeSelectedSlot();
  }

  // The network filter: when a single metagraph is selected, the OTHER metagraphs' lead tiles + links
  // go neutral too (so the lead row shows only the selected metagraph in colour). "all"/"dag" = no dim.
  setFilter(filter) {
    this._filter = filter || "all";
  }

  // Map the selected ordinal → its current slot (0 = the live centre; else find it in the trail).
  _recomputeSelectedSlot() {
    if (this._selectedOrd == null) { this._selectedSlot = -1; return; }
    if (this._selectedOrd === this._tickOrdinal) { this._selectedSlot = 0; return; }
    const t = this._trail.find((x) => x.ordinal === this._selectedOrd);
    this._selectedSlot = t ? t.slot : -1;
  }

  update(dt) {
    this.t += dt;
    if (!this._latest) return;

    const k = Math.min(1, dt * 3); // shared ease factor for the trail + lanes this frame

    // The centre block (LIVE snapshot) pulses subtly + flashes as pulses arrive — UNLESS an older
    // snapshot is selected, in which case the live lead also drops to the neutral tone (only the
    // selected row is coloured anywhere).
    this._flash = Math.max(0, this._flash - dt * 2.2);
    const leadNeutral = this._selectedSlot > 0;
    const cCol = leadNeutral ? NEUTRAL_TILE : CORE_COLOR;
    this.centerMat.color.copy(cCol);
    this.centerMat.emissive.copy(cCol);
    this.centerMat.emissiveIntensity = leadNeutral ? 0.22 : 0.55 + this._flash * 0.6;

    // Hypergraph-L0 participation ring: glows as the global L0 produces each snapshot, then fades.
    this._gL0Glow = Math.max(0, this._gL0Glow - dt * 1.4);
    this._gL0Ring.material.opacity = this._gL0Ring.userData.baseOpacity + this._gL0Glow * 0.9;
    this.center.scale.setScalar(this._baseR * (1 + Math.sin(this.t * 2.2) * 0.06 + this._flash * 0.12));

    // The global trail eases left into its slots; trailing blocks get the SAME treatment as the tiles
    // and links — bright cyan only when SELECTED, otherwise the toned-down NEUTRAL (the live lead is the
    // separate centre block). Fades + grows transparent by recency.
    for (const t of this._trail) {
      t.mesh.position.x += (-t.slot * SLOT_SP - t.mesh.position.x) * k;
      const sel = t.slot === this._selectedSlot;
      const col = sel ? CORE_COLOR : NEUTRAL_TILE;
      t.mesh.material.color.copy(col);
      t.mesh.material.emissive.copy(col);
      t.mesh.material.emissiveIntensity = sel ? 0.7 : 0.22;
      const target = sel ? 0.95 : 0.55 * slotFade(t.slot);
      t.mesh.material.opacity += (target - t.mesh.material.opacity) * k;
    }

    // The per-metagraph lanes: each lane's blocks ease left + fade by recency, all drawn in the one
    // instanced mesh; each REAL block also draws a per-block anchor link to its global block.
    {
      // slot → global block X (slot 0 = the live centre block), so a freshly-anchored block links there.
      _gx.clear();
      _gx.set(0, this.center.position.x);
      for (const t of this._trail) _gx.set(t.slot, t.mesh.position.x);
      // A single-metagraph filter neutralises every OTHER lane (even on the lead row).
      const mf = this._filter !== "all" && this._filter !== "dag" ? this._filter : null;
      let mi = 0, li = 0;
      for (const lane of this._metaLanes.values()) {
        const laneOff = mf != null && lane.id !== mf; // filtered out → never coloured
        for (const b of lane.blocks) {
          if (mi >= META_TRAIL_MAX) break;
          b.x += (-b.slot * SLOT_SP - b.x) * k; // trail LEFT, same direction + spacing as the global
          b.fade += (slotFade(b.slot) - b.fade) * k;
          _dummy.position.set(b.x + b.ox, LEDGER.rowMSnap, lane.z + b.oz); // ox/oz = its tile in the cluster
          _dummy.rotation.set(-Math.PI / 2, 0, 0); // lie flat on the snapshot floor (same as global)
          _dummy.scale.set(b.size, b.size, b.size * (b.filled ? 1 : 0.18)); // empty = thin ghost tile
          _dummy.updateMatrix();
          this._metaTrailMesh.setMatrixAt(mi, _dummy.matrix);
          // Colour belongs to the LIVE lead (slot 0) and to a SELECTED snapshot; trailing tiles fade to
          // a quiet neutral so the background isn't a wall of colour. Brightness still fades by recency.
          // Colour is binary, and EXACTLY ONE row is ever coloured: a selected OLDER snapshot
          // (`_selectedSlot > 0`) wins outright — the live lead goes neutral with everything else;
          // otherwise the live lead (slot 0) is the coloured row. A filtered-out lane is never coloured.
          const hot = !laneOff && (this._selectedSlot > 0 ? b.slot === this._selectedSlot : b.slot <= 0);
          const colAmt = hot ? 1 : 0;
          const bright = (hot ? Math.max(b.fade, 0.7) : b.fade) * (b.filled ? 0.6 : 0.13);
          this._metaTrailMesh.setColorAt(mi, _col.copy(NEUTRAL_TILE).lerp(lane.color, colAmt).multiplyScalar(bright));
          mi++;

          // One anchor link per cluster (from its centre tile) — the shared curvePoint shape: straight
          // down through the L1/L0 ring centres, then into the global block, travelling with the blocks.
          const g = _gx.get(b.slot);
          if (b.filled && b.link && g !== undefined && li + LINK_SEG <= LINK_CURVES * LINK_SEG) {
            // Same lead/selected = coloured, trail = neutral treatment as the tiles (consistent row).
            _col.copy(NEUTRAL_TILE).lerp(lane.color, colAmt).multiplyScalar((hot ? Math.max(b.fade, 0.7) : b.fade) * 0.42);
            curvePoint(0, b.x, lane.z, g, _q);
            let px = _q.x, py = _q.y, pz = _q.z;
            for (let s = 1; s <= LINK_SEG; s++) {
              curvePoint(s / LINK_SEG, b.x, lane.z, g, _q);
              const o = li * 6;
              this._linkPos[o] = px; this._linkPos[o + 1] = py; this._linkPos[o + 2] = pz;
              this._linkPos[o + 3] = _q.x; this._linkPos[o + 4] = _q.y; this._linkPos[o + 5] = _q.z;
              this._linkCol[o] = _col.r; this._linkCol[o + 1] = _col.g; this._linkCol[o + 2] = _col.b;
              this._linkCol[o + 3] = _col.r; this._linkCol[o + 4] = _col.g; this._linkCol[o + 5] = _col.b;
              li++;
              px = _q.x; py = _q.y; pz = _q.z;
            }
          }
        }
      }
      const prev = this._metaLastDrawn || 0;
      if (mi < prev) {
        _dummy.scale.setScalar(0);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        for (let j = mi; j < prev; j++) this._metaTrailMesh.setMatrixAt(j, _dummy.matrix);
      }
      this._metaLastDrawn = mi;
      this._metaTrailMesh.instanceMatrix.needsUpdate = true;
      if (this._metaTrailMesh.instanceColor) this._metaTrailMesh.instanceColor.needsUpdate = true;

      this._linkGeo.setDrawRange(0, li * 2);
      this._linkGeo.attributes.position.needsUpdate = true;
      this._linkGeo.attributes.color.needsUpdate = true;
    }

    // Spawn any due pulses (a metagraph snapshot beginning its descent to the global tile).
    while (this._queue.length && this._queue[0].dueAt <= this.t && this._pulses.length < PULSE_MAX) {
      const { id } = this._queue.shift();
      const rec = this._curves.get(id);
      if (rec) this._pulses.push({ rec, t: 0, speed: 0.85 + Math.random() * 0.25 });
    }

    // Advance + render the travelling pulses; as each passes through a node group it lights that
    // group's ring (it did work on this snapshot), and arrivals flash the centre tile.
    let i = 0;
    for (const p of this._pulses) {
      p.t += dt * p.speed;
      if (p.t >= 1) {
        this._flash = 1;
        continue; // dropped below (compacted)
      }
      curvePoint(p.t, p.rec.sx, p.rec.sz, 0, _p);
      for (const r of p.rec.rings) if (Math.abs(_p.y - r.y) < 1.3) r.glow = 1;
      // The global-L0 ring lights only when an anchor pulse actually reaches that cluster's floor.
      if (Math.abs(_p.y - LEDGER.rowHypL0) < 1.3) this._gL0Glow = 1;
      _dummy.position.copy(_p);
      _dummy.scale.setScalar(1);
      _dummy.quaternion.identity();
      _dummy.updateMatrix();
      this._pulseMesh.setMatrixAt(i, _dummy.matrix);
      this._pulseMesh.setColorAt(i, _col.set(p.rec.color));
      i++;
    }
    // Keep only the still-travelling pulses.
    if (i < this._pulses.length) this._pulses = this._pulses.filter((p) => p.t < 1);
    // Hide instances that were drawn last frame but aren't now.
    const prevDrawn = this._lastDrawn || 0;
    if (i < prevDrawn) {
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      for (let j = i; j < prevDrawn; j++) this._pulseMesh.setMatrixAt(j, _dummy.matrix);
    }
    this._lastDrawn = i;
    this._pulseMesh.instanceMatrix.needsUpdate = true;
    if (this._pulseMesh.instanceColor) this._pulseMesh.instanceColor.needsUpdate = true;

    // Decay + apply the node-group ring highlights (brighter + slightly larger while a pulse is in).
    for (const rec of this._curves.values()) {
      for (const r of rec.rings) {
        r.glow = Math.max(0, r.glow - dt * 2.4);
        r.mesh.material.opacity = r.mesh.userData.baseOpacity + r.glow * 0.9; // highlight on anchor
        r.mesh.scale.setScalar(r.radius * (1 + r.glow * 0.12)); // count-sized, a touch bigger on a pulse
      }
    }
  }

  dispose() {
    this._clearCurves();
    for (const t of this._trail) t.mesh.material.dispose(); // geometry is the shared _trailGeo
    this._trail = [];
    this._ringGeo.dispose();
    for (const o of this.group.children.slice()) {
      this.group.remove(o);
      o.geometry?.dispose();
      o.material?.map?.dispose?.(); // label sprite canvas textures
      o.material?.dispose();
      o.dispose?.();
    }
    this.pickables = [];
  }
}
