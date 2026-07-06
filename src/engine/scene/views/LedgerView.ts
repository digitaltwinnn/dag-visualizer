// The Snapshots (ledger) view, rendered on the shared Three.js canvas like the other views.
//
// A 3D stack of transparent glass FLOORS (one per layer; see config.LEDGER). The producer NODES
// are the SAME node meshes reused from the hyper/geo views, placed into their lanes by Globe.
// This module owns what's unique to the view:
//   • the glass floor panes,
//   • the centred live global snapshot block + its left-trailing chain of completed snapshots,
//   • each metagraph's lane of snapshot blocks (real where it anchored, an empty placeholder where
//     it didn't), all drawn in one InstancedMesh,
//   • the node-group rings, and the per-block anchor LINKS + travelling pulses.
//
// Factual basis: block sizes come from anchored counts; links/pulses/rings come straight from the
// live getAnchor(ts).metaCounts — nothing fabricated. With no snapshot the centre block hides.
//
// ─── STATE vs. MESH split (Task 13) ────────────────────────────────────────────────────────────
// This class is the SCENE ADAPTER over LedgerModel (src/engine/domain/ledgerModel.ts). The domain
// state machine — which slot a block sits in, the trail/lane arrays, tickOrdinal, the selected slot,
// the seed/tick-advance/anchor logic — lives in `this.model`. This class owns every mesh, material,
// label, ring, pulse and the per-frame draw, and pairs model rows to meshes by ordinal (trail) /
// array iteration (lanes → the one InstancedMesh).
//
// OWNERSHIP NOTE on per-frame easing: the model's LaneBlock carries `x`/`fade` as STATE fields, but
// the frame-by-frame EASING of them (and of the trail meshes' positions/opacity) is a VISUAL concern
// done here in update(). This adapter mutates the model's LaneBlock `x`/`fade` in place each frame —
// they're the shared data this view renders, and js/ledger.js eased those same fields inline
// (js/ledger.js:626-644). The model owns the discrete transitions (slot advance, block creation);
// this view owns the continuous interpolation toward each block's resting slot.

import * as THREE from "three";
import { LEDGER, METAGRAPHS, ledgerSite, clusterRadius } from "../../config";
import type { SceneColors } from "../../sceneColors";
import { LedgerModel, SLOT_SP, slotFade, curvePoint } from "../../domain/ledgerModel";
import type { GlobalSnapshot, Anchor, PickDescriptor } from "@/src/data/types";

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
const LINK_CURVES = 110;     // max per-block anchor links drawn at once
const LINK_SEG = 44;         // line segments each link is tessellated into (smooth, not pointy — the
                            // curve swings through the global-L0 cluster so it needs a fine tessellation)

// Trail/lead block size from a snapshot's anchored count (clamped) so a busy tick reads bigger; never
// fabricate a minimum. Shared by the live lead (_baseR) + the trail-tile reconciliation.
const sizeForCount = (count: number): number => 1.0 + Math.min(1, count / 24) * 1.6;

const _dummy = new THREE.Object3D();
const _col = new THREE.Color();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3(); // scratch for link curve points
const _gx = new Map<number, number>(); // reused per-frame: slot → global block X
// The trail tiles/links fade TO a quiet neutral as they recede into the background; the live lead /
// selected block wear the bright accent. Both come from the CSS token (colors.core) set per-instance
// in the constructor: `_coreCol` is --primary; `_neutralTile` is that SAME accent rendered dim (×0.28
// below), ADDITIVELY blended so its low magnitude also reads semi-transparent. The ledger tiles and
// the geo hologram therefore share --primary and stay calm by low brightness — the two views match by
// construction (no bespoke teal).
const NEUTRAL_DIM = 0.28; // how far the recessive tile tone dims the accent

interface RingRec {
  mesh: THREE.Mesh;
  y: number;
  glow: number;
  radius: number;
  floor: "l0" | "l1";
}
interface CurveRec {
  sx: number;
  sz: number;
  color: number;
  rings: RingRec[];
}
interface Pulse {
  rec: CurveRec;
  t: number;
  speed: number;
}
interface QueueItem {
  id: string;
  dueAt: number;
}

export class LedgerView {
  group: THREE.Group;
  private _core: number;             // the structural accent (colors.core), as a number
  private _coreCol: THREE.Color;     // the accent as a Color (live/selected blocks)
  private _neutralTile: THREE.Color; // the accent dimmed — the recessive trail tone
  // Identity SCENE-lane colour map (id -> 0xRRGGBB), set by the Engine so lane tiles / anchor rings /
  // links / pulses use the metagraph's identity hue (not the raw config colour). Null until set → the
  // `?? METAGRAPHS[i].color` fallbacks below keep it working. NOTE: the Engine sets this AFTER
  // construction, so the node-group rings/pulses (_buildCurves in the ctor) resolve to the CONFIG
  // colour, while lane tiles (resolved lazily on the first setData) use the identity map — verbatim
  // js/ledger.js behaviour, intentionally preserved.
  sceneColors: Record<string, number> | null;
  pickables: THREE.Object3D[];

  private model = new LedgerModel();
  private t: number;
  private _latest: GlobalSnapshot | null;
  private _baseR: number;
  private _filter: string; // metagraph filter; when a single metagraph, the OTHERS go neutral

  // Anchor animation state. _anchorGroup holds the node-group rings (built once, persistent).
  private _anchorGroup: THREE.Group;
  private _ringGeo: THREE.RingGeometry;
  private _curves: Map<string, CurveRec>; // metaId -> { sx, sz, color, rings } (sx/sz = pulse curve origin)
  private _pulses: Pulse[];               // active { rec, t, speed }
  private _queue: QueueItem[];            // pending emissions { id, dueAt }
  private _lastDue: number;
  private _flash: number;                 // centre-block arrival flash
  private _gL0Glow: number;               // hypergraph-L0 ring glow — lights as anchor pulses reach that cluster
  private _lastDrawn = 0;

  // The global chain: completed snapshots become solid blocks that march LEFT into a trail (newest
  // just-left-of-centre, older further left). Mirrors the bottom bar-chart's left→right = old→new.
  private _trailGroup: THREE.Group;
  private _trailMeshes: Map<number, THREE.Mesh>; // ordinal -> mesh (model.trail owns { ordinal, slot })
  private _trailGeo: THREE.BoxGeometry;          // shared by the centre + trail blocks

  // Per-metagraph chains: each metagraph's snapshot blocks trail left in its own lane (all drawn in
  // one InstancedMesh). model.lanes owns the block state; this resolves the per-lane colour.
  private _metaTrailMesh!: THREE.InstancedMesh;
  private _metaLastDrawn = 0;
  private _laneColors: Map<string, THREE.Color> = new Map();

  private centerMat!: THREE.MeshStandardMaterial;
  private center!: THREE.Mesh;

  private _linkPos!: Float32Array;
  private _linkCol!: Float32Array;
  private _linkGeo!: THREE.BufferGeometry;
  private _linkMesh!: THREE.LineSegments;

  private _pulseMat!: THREE.MeshBasicMaterial;
  private _pulseMesh!: THREE.InstancedMesh;

  private _gL0Ring: THREE.Mesh;

  constructor(scene: THREE.Scene, colors: SceneColors) {
    this._core = colors.core;
    this._coreCol = new THREE.Color(colors.core);
    this._neutralTile = new THREE.Color(colors.core).multiplyScalar(NEUTRAL_DIM);
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.pickables = [];
    this.sceneColors = null;
    this.t = 0;
    this._latest = null;
    this._baseR = 1;

    this._anchorGroup = new THREE.Group();
    this.group.add(this._anchorGroup);
    this._ringGeo = new THREE.RingGeometry(0.84, 1.0, 36); // shared unit ring (scaled per group)
    this._curves = new Map();
    this._pulses = [];
    this._queue = [];
    this._lastDue = 0;
    this._flash = 0;
    this._gL0Glow = 0;
    this._filter = "all";

    this._trailGroup = new THREE.Group();
    this.group.add(this._trailGroup);
    this._trailMeshes = new Map();
    this._trailGeo = new THREE.BoxGeometry(1.4, 1.4, 0.4); // shared by the centre + trail blocks

    this._buildFloors();
    this._buildCenter();
    this._buildPulses();
    this._buildMetaTrail();
    this._buildLinks();
    this._buildCurves(); // persistent flow line + rings per metagraph (kept as the visual linkage)

    // The hypergraph-L0 participation ring: a single ring round the global validator cluster that
    // lights up as it produces each new global snapshot (mirrors the metagraph node-group rings).
    this._gL0Ring = this._makeRing(0, LEDGER.rowHypL0, 0, this._core);
    this._gL0Ring.scale.setScalar(LEDGER.dagCell + 0.7);
    this.group.add(this._gL0Ring);
  }

  // Per-block link segments: every completed metagraph block draws a line to the global block of
  // the same tick (they share an X). Rebuilt from the live block positions each frame so the links
  // travel left WITH the blocks. One dynamic LineSegments, coloured per metagraph.
  private _buildLinks() {
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
  private _buildCurves() {
    for (const m of METAGRAPHS) this._addCurve(m.id);
  }

  // Live per-metagraph node counts per floor (from the globe) → size each ring to fit its dots.
  // `groups` = { metaId: { l0, l1 } }.
  setGroupSizes(groups: Record<string, { l0: number; l1: number }>) {
    if (!groups) return;
    for (const [id, rec] of this._curves) {
      const g = groups[id];
      if (!g) continue;
      for (const r of rec.rings) r.radius = clusterRadius(r.floor === "l0" ? g.l0 : g.l1);
    }
  }

  private _buildMetaTrail() {
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

  // Resolve (and cache) metagraph `id`'s lane tile colour — the identity SCENE hue, falling back to
  // the config colour. Mirrors js/ledger.js's `_lane` colour resolution (model.lanes carries no
  // colour — it's a scene concern). Resolved lazily on the first update after the Engine has set
  // sceneColors, so lane tiles get the identity hue (unlike the ctor-built curves).
  private _laneColor(id: string): THREE.Color {
    let c = this._laneColors.get(id);
    if (!c) {
      const i = METAGRAPHS.findIndex((m) => m.id === id);
      const hex = (this.sceneColors && this.sceneColors[id]) ?? (i >= 0 ? METAGRAPHS[i].color : this._core);
      c = new THREE.Color(hex);
      this._laneColors.set(id, c);
    }
    return c;
  }

  // One transparent GLASS pane per layer — a SQUARE sheet (no grid lines) with SOFT edges that
  // dissolve into the background. Shifted back over the trails (−X) so the empty area in front of
  // the lead (toward the camera) isn't covered, keeping the black background visible there.
  private _buildFloors() {
    // Panes span the whole trail again, but are VERY transparent so even where they stack in perspective
    // they stay a subtle hint of a layer (not a wall) — the black background still reads through.
    const W = 38;        // X extent (camera-depth) — tight to the lead + trail span
    const D = 44;        // Z extent — tight to the lanes
    const cx = -16;      // centred on the content; +X (in front of the lead) stays black
    for (const y of FLOOR_Y) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this._paneMat(this._core, 0.007));
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
  private _makeLabel(text: string, x: number, y: number, z: number): THREE.Mesh {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const ctx = c.getContext("2d")!;
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
  private _paneMat(color: number, opacity: number): THREE.ShaderMaterial {
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
  // next tick lands a copy solidifies into the trail. Clicking it opens the snapshot card.
  private _buildCenter() {
    this.centerMat = new THREE.MeshStandardMaterial({
      color: this._core, emissive: this._core, emissiveIntensity: 0.6, // kept low so it doesn't bloom out
      roughness: 0.4, metalness: 0.2, flatShading: true,
    });
    this.center = new THREE.Mesh(this._trailGeo, this.centerMat);
    this.center.position.set(0, LEDGER.rowGL0, 0);
    this.center.rotation.x = -Math.PI / 2; // lie the tile flat on the global-snapshot floor
    this.group.add(this.center);
    this.pickables = [this.center];
  }

  // Reconcile the trail meshes to model.trail (paired by ordinal): create a mesh for each model trail
  // entry that has none yet, and dispose meshes whose ordinal has scrolled off the model's window.
  // `seeded` = this is the first (history-seed) call → new tiles appear directly at their resting
  // slot/opacity (js/ledger.js `_seedTile`); otherwise a new tile is a just-completed snapshot that
  // slides in from centre with a fade-in (js/ledger.js `_spawnTrailTile`).
  private _reconcileTrail(snaps: GlobalSnapshot[], seeded: boolean) {
    const present = new Set(this.model.trail.map((t) => t.ordinal));
    for (const [ord, mesh] of this._trailMeshes) {
      if (present.has(ord)) continue;
      this._trailGroup.remove(mesh);
      (mesh.material as THREE.Material).dispose(); // geometry is shared (_trailGeo)
      this._trailMeshes.delete(ord);
    }
    for (const t of this.model.trail) {
      if (this._trailMeshes.has(t.ordinal)) continue;
      const snap = snaps.find((s) => s.ordinal === t.ordinal);
      const total = snap && typeof snap.metagraphSnapshotCount === "number" ? snap.metagraphSnapshotCount : 0;
      const mesh = new THREE.Mesh(
        this._trailGeo,
        new THREE.MeshStandardMaterial({
          color: this._core, emissive: this._core, emissiveIntensity: 0.45,
          roughness: 0.45, metalness: 0.2, flatShading: true, transparent: true,
          opacity: seeded ? 0.92 * slotFade(t.slot) : 0,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(seeded ? -t.slot * SLOT_SP : 0, LEDGER.rowGL0, 0);
      mesh.scale.setScalar(sizeForCount(total));
      this._trailGroup.add(mesh);
      this._trailMeshes.set(t.ordinal, mesh);
    }
  }

  // Pooled glowing spheres that travel the anchor flow lines.
  private _buildPulses() {
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

  private _hideAllPulses() {
    _dummy.position.set(0, 0, 0);
    _dummy.scale.setScalar(0);
    _dummy.updateMatrix();
    for (let i = 0; i < PULSE_MAX; i++) this._pulseMesh.setMatrixAt(i, _dummy.matrix);
    this._pulseMesh.instanceMatrix.needsUpdate = true;
  }

  // Build metagraph `id`'s node-group rings + cache its pulse-curve origin (the lane site). The
  // visible anchor line is NOT built here — it's drawn dynamically per block in the link pass
  // (via curvePoint) so it travels with the block; only the pulses use the cached origin.
  private _addCurve(id: string): CurveRec | null {
    const i = METAGRAPHS.findIndex((m) => m.id === id);
    if (i < 0) return null; // unlisted — no site
    const s = ledgerSite(i, METAGRAPHS.length);
    const color = (this.sceneColors && this.sceneColors[id]) ?? METAGRAPHS[i].color;
    // Rings around the L1 + L0 node groups this metagraph produces from; they light up as a pulse
    // passes through (see update).
    const dR = clusterRadius(3); // default until the live node counts arrive (setGroupSizes)
    const rings: RingRec[] = [
      { mesh: this._makeRing(s.x, LEDGER.rowML1, s.z, color), y: LEDGER.rowML1, glow: 0, radius: dR, floor: "l1" },
      { mesh: this._makeRing(s.x, LEDGER.rowML0, s.z, color), y: LEDGER.rowML0, glow: 0, radius: dR, floor: "l0" },
    ];
    for (const r of rings) {
      r.mesh.scale.setScalar(r.radius);
      this._anchorGroup.add(r.mesh);
    }
    const rec: CurveRec = { sx: s.x, sz: s.z, color, rings };
    this._curves.set(id, rec);
    return rec;
  }

  // A thin ring lying flat on a floor, sharing the unit `_ringGeo` (scaled per group to its
  // count-based radius — see setGroupSizes / the update glow loop) so it fits the dots.
  private _makeRing(x: number, y: number, z: number, color: number): THREE.Mesh {
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

  private _clearCurves() {
    for (const o of this._anchorGroup.children.slice()) {
      this._anchorGroup.remove(o);
      (o as THREE.Mesh).material && ((o as THREE.Mesh).material as THREE.Material).dispose(); // geometry is the shared _ringGeo
    }
    this._curves.clear();
  }

  // Re-read the live tick. `snaps` = the Global L0 buffer (oldest→newest); `getAnchor(ts)` = the
  // per-tick anchor aggregate ({ count, fee, metaCounts:Map(id→n) }). The domain state transitions
  // run in model.setData; this method owns the centre pick, the trail meshes, and pulse spawning.
  setData(snaps: GlobalSnapshot[], getAnchor: (ts: string) => Anchor | null) {
    const latest = snaps && snaps.length ? snaps[snaps.length - 1] : null;
    this._latest = latest;
    if (!latest) {
      this.center.visible = false;
      this.center.userData.pick = null;
      return;
    }
    this.center.visible = true;

    // Snapshot the model's pre-call state so we can classify what changed after the transition:
    //   • willSeed → this call seeds history (new trail tiles appear at rest, not fading in)
    //   • isNewTick → the queue is cleared before re-filling (mirrors js/ledger.js:526)
    const prevTick = this.model.tickOrdinal;
    const willSeed = prevTick === null && snaps.length > 1;
    const isNewTick = latest.ordinal !== prevTick;

    // Size by anchored count (clamped) so a busy tick reads bigger; never fabricate a minimum.
    const total = typeof latest.metagraphSnapshotCount === "number" ? latest.metagraphSnapshotCount : 0;
    this._baseR = sizeForCount(total);
    const blk = Array.isArray(latest.blocks) ? latest.blocks.length : 0;
    const blkTxt = blk > 0 ? ` · ${blk} DAG-L1 block${blk === 1 ? "" : "s"}` : "";
    this.center.userData.pick = {
      kind: "snapshot",
      data: latest,
      title: `Global snapshot #${latest.ordinal}`,
      sub: `${total} metagraph snapshot${total === 1 ? "" : "s"} anchored${blkTxt}`,
    } satisfies PickDescriptor;

    // Advance the domain state machine (seed / tick-advance / anchor blocks / recompute selected slot).
    const changes = this.model.setData(snaps, getAnchor);

    // Pair trail meshes to the (now-updated) model.trail.
    this._reconcileTrail(snaps, willSeed);

    // ── live anchor animation: emit a pulse per NEWLY anchored metagraph snapshot into this tick ──
    // On a new tick the pending queue is cleared first (js/ledger.js:526); the running stagger clock
    // (_lastDue) is NOT reset (it's max'd against this.t). Only the selected metagraph emits pulses
    // when a single-metagraph filter is active (so only ITS rings light).
    if (isNewTick) this._queue.length = 0;
    const mf = this._filter !== "all" && this._filter !== "dag" ? this._filter : null;
    for (const ch of changes) {
      const rec = this._curves.get(ch.id) || this._addCurve(ch.id);
      if (!rec) continue; // unlisted: no curve (model already excludes these from changes)
      if (!mf || ch.id === mf) {
        for (let k = 0; k < ch.delta && this._queue.length < PULSE_MAX * 2; k++) {
          this._lastDue = Math.max(this.t, this._lastDue + PULSE_STAGGER); // global stagger = a stream
          this._queue.push({ id: ch.id, dueAt: this._lastDue });
        }
      }
    }
  }

  // The selected/hovered snapshot (by ordinal, from the LiveStrip bar-chart or the centre pick) keeps
  // its metagraph COLOUR even after it trails into the neutral background. Null = nothing selected.
  setSelected(ordinal: number | null) {
    this.model.setSelected(ordinal);
  }

  // The network filter: when a single metagraph is selected, the OTHER metagraphs' lead tiles + links
  // go neutral too (so the lead row shows only the selected metagraph in colour). "all"/"dag" = no dim.
  setFilter(filter: string) {
    this._filter = filter || "all";
  }

  update(dt: number) {
    this.t += dt;
    if (!this._latest) return;

    const k = Math.min(1, dt * 3); // shared ease factor for the trail + lanes this frame
    const selectedSlot = this.model.selectedSlot;

    // The centre block (LIVE snapshot) pulses subtly + flashes as pulses arrive — UNLESS an older
    // snapshot is selected, in which case the live lead also drops to the neutral tone (only the
    // selected row is coloured anywhere).
    this._flash = Math.max(0, this._flash - dt * 2.2);
    const leadNeutral = selectedSlot > 0;
    const cCol = leadNeutral ? this._neutralTile : this._coreCol;
    this.centerMat.color.copy(cCol);
    this.centerMat.emissive.copy(cCol);
    this.centerMat.emissiveIntensity = leadNeutral ? 0.22 : 0.55 + this._flash * 0.6;

    // Hypergraph-L0 participation ring: glows as the global L0 produces each snapshot, then fades.
    this._gL0Glow = Math.max(0, this._gL0Glow - dt * 1.4);
    (this._gL0Ring.material as THREE.MeshBasicMaterial).opacity = this._gL0Ring.userData.baseOpacity + this._gL0Glow * 0.9;
    this.center.scale.setScalar(this._baseR * (1 + Math.sin(this.t * 2.2) * 0.06 + this._flash * 0.12));

    // The global trail eases left into its slots; trailing blocks get the SAME treatment as the tiles
    // and links — bright cyan only when SELECTED, otherwise the toned-down NEUTRAL (the live lead is the
    // separate centre block). Fades + grows transparent by recency.
    for (const t of this.model.trail) {
      const mesh = this._trailMeshes.get(t.ordinal);
      if (!mesh) continue;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mesh.position.x += (-t.slot * SLOT_SP - mesh.position.x) * k;
      const sel = t.slot === selectedSlot;
      const col = sel ? this._coreCol : this._neutralTile;
      mat.color.copy(col);
      mat.emissive.copy(col);
      mat.emissiveIntensity = sel ? 0.7 : 0.22;
      const target = sel ? 0.95 : 0.55 * slotFade(t.slot);
      mat.opacity += (target - mat.opacity) * k;
    }

    // The per-metagraph lanes: each lane's blocks ease left + fade by recency, all drawn in the one
    // instanced mesh; each REAL block also draws a per-block anchor link to its global block.
    {
      // slot → global block X (slot 0 = the live centre block), so a freshly-anchored block links there.
      _gx.clear();
      _gx.set(0, this.center.position.x);
      for (const t of this.model.trail) {
        const mesh = this._trailMeshes.get(t.ordinal);
        if (mesh) _gx.set(t.slot, mesh.position.x);
      }
      // A single-metagraph filter neutralises every OTHER lane (even on the lead row).
      const mf = this._filter !== "all" && this._filter !== "dag" ? this._filter : null;
      let mi = 0, li = 0;
      for (const lane of this.model.lanes.values()) {
        const laneOff = mf != null && lane.id !== mf; // filtered out → never coloured
        const laneColor = this._laneColor(lane.id);
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
          // (`selectedSlot > 0`) wins outright — the live lead goes neutral with everything else;
          // otherwise the live lead (slot 0) is the coloured row. A filtered-out lane is never coloured.
          const hot = this.model.isRowHot(laneOff, b.slot);
          const colAmt = hot ? 1 : 0;
          const bright = (hot ? Math.max(b.fade, 0.7) : b.fade) * (b.filled ? 0.6 : 0.13);
          this._metaTrailMesh.setColorAt(mi, _col.copy(this._neutralTile).lerp(laneColor, colAmt).multiplyScalar(bright));
          mi++;

          // One anchor link per cluster (from its centre tile) — the shared curvePoint shape: straight
          // down through the L1/L0 ring centres, then into the global block, travelling with the blocks.
          const g = _gx.get(b.slot);
          if (b.filled && b.link && g !== undefined && li + LINK_SEG <= LINK_CURVES * LINK_SEG) {
            // Same lead/selected = coloured, trail = neutral treatment as the tiles (consistent row).
            _col.copy(this._neutralTile).lerp(laneColor, colAmt).multiplyScalar((hot ? Math.max(b.fade, 0.7) : b.fade) * 0.42);
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
      const { id } = this._queue.shift()!;
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
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.mesh.userData.baseOpacity + r.glow * 0.9; // highlight on anchor
        r.mesh.scale.setScalar(r.radius * (1 + r.glow * 0.12)); // count-sized, a touch bigger on a pulse
      }
    }
  }

  dispose() {
    this._clearCurves();
    for (const mesh of this._trailMeshes.values()) (mesh.material as THREE.Material).dispose(); // geometry is the shared _trailGeo
    this._trailMeshes.clear();
    this._ringGeo.dispose();
    for (const o of this.group.children.slice()) {
      this.group.remove(o);
      const obj = o as THREE.Mesh & { dispose?: () => void };
      obj.geometry?.dispose();
      const mat = obj.material as (THREE.Material & { map?: { dispose?: () => void } }) | undefined;
      mat?.map?.dispose?.(); // label sprite canvas textures
      mat?.dispose?.();
      obj.dispose?.();
    }
    this.pickables = [];
  }
}
