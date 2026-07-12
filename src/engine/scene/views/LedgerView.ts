// The Snapshots (ledger) view, rendered on the shared Three.js canvas like the other views.
//
// A 3D stack of transparent glass FLOORS (one per layer; see domain/ledgerLayout.ts). The producer NODES
// are the SAME node meshes reused from the hyper/geo views, placed into their lanes by Globe.
// This module owns what's unique to the view:
//   • the glass floor panes,
//   • the centred live global snapshot block + its left-trailing chain of completed snapshots,
//   • each metagraph's lane of snapshot blocks (real where it anchored, an empty placeholder where
//     it didn't), all drawn in one InstancedMesh,
//   • the node-group station DIALS (the resting identity marks), and the per-block anchor LINKS +
//     travelling pulses.
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
import { METAGRAPHS } from "../../config";
import { LEDGER, HYP_SPLIT, LAYER_GEOM, ledgerSite, DIAL_R } from "../../domain/ledgerLayout";
import type { SceneColors } from "../../sceneColors";
import { LedgerModel, SLOT_SP, slotFade, curvePoint } from "../../domain/ledgerModel";
import type { GlobalSnapshot, Anchor, PickDescriptor } from "@/src/data/types";
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers"; // shared display copy + ORDER — floor labels = panel rows

// Floor plane geometry comes from the shared domain table (ledgerLayout.LAYER_GEOM): the FULL-WIDTH
// floors are exactly its laneZ === 0 entries; the split hypergraph panes (hypl0/hypl1, laneZ ≠ 0)
// are built separately below. Layer NAMES come from the shared UI copy table
// (src/data/ledgerLayers.ts) — rendered in-scene as flat front-left corner labels (_makeLabel) AND
// by the explore panel rows, one source; a plane's pick still carries only its layerId.
// Floor-frame + edge-fill opacities at rest and when a plane is highlighted from the explore panel.
// The resting frame sits at ~the geo view's coastal-wall rim brightness (user-tuned) so the two
// views' structural edges read as one weight.
// NB: the frame material's colour is HDR-overdriven ×2 (see _buildFloors) so these opacities are
// roughly HALF the perceived line brightness — 0.16×2 ≈ the previous 0.28 line, now with bloom.
// FILL has two parts: the pixelated EDGE band (op) and the flat INNER sheet (inner) — the inner is
// 0 at rest (the centre stays fully transparent by design) and fills in on highlight so the tiles/
// nodes clearly sit ON the selected plane when the layer-focus camera is close.
const FLOOR_FRAME_OP = 0.11, FLOOR_FILL_OP = 0.03, FLOOR_INNER_OP = 0; // resting frame kept quiet (user-tuned
  // down from 0.16/0.04: the default view's plane lines read too strong once the subjects grew)
const FLOOR_FRAME_HI = 0.4, FLOOR_FILL_HI = 0.055, FLOOR_INNER_HI = 0.008; // fill kept airy (user-tuned
  // down twice: the sheet over the see-through stack read too busy — the bright FRAME is the cue)
// While ONE plane is selected, the OTHERS recede — dimmed structural cyan (the planes' colour is
// already the neutral/structural accent; dimming is the recede, no colour swap).
const FLOOR_FRAME_OFF = 0.055, FLOOR_FILL_OFF = 0.015;

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
const sizeForCount = (count: number): number => 1.4 + Math.min(1, count / 24) * 2.0;

const _dummy = new THREE.Object3D();
const _col = new THREE.Color();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3(); // scratch for link curve points
const _gx = new Map<number, number>(); // reused per-frame: slot → global block X
// The trail tiles/links keep their identity/accent colour; recency is carried by slotFade brightness
// alone (the neutral-tone + depth-fog recency treatment was removed — a future session may revisit).
// Station-dial brightness model: REST (inactive — deliberately dim so the lit state carries the
// signal) → LIT (this metagraph anchored into the CURRENT tick; held until the next global
// snapshot arrives, cleared in setData on the tick change) → plus a transient pulse sparkle
// while an anchor pulse is actually passing through.
const DIAL_REST_OP = 0.13; // resting identity mark — dim
const DIAL_LIT_OP = 0.78;  // added while latched as did-work-this-tick (user: brighter highlight)

// The shared unit station DIAL geometry — the instrument-ruler language bent around the node
// field: a hairline HEXAGON (user, 2026-07-12 — the honeycomb-stacked chips fill a hexagonal
// footprint now, so the circle read as a mismatched frame; vertices at k·60° match the hex
// grid's neighbour axes) plus radial ruler ticks that follow the hex boundary (fine ticks all
// round, longer ones at the six corners), mirroring the rail threads' ruler spec in-scene.
// Unit circumradius; each dial scales it to its fixed radius. Construction-time allocation
// (once, shared by every dial).
function buildDialGeometry(): THREE.BufferGeometry {
  const pts: number[] = [];
  // A regular hexagon's boundary distance at angle a (circumradius 1, vertices at k·60°).
  const SIXTH = Math.PI / 3;
  const rHex = (a: number) => {
    const m = ((a % SIXTH) + SIXTH) % SIXTH - SIXTH / 2;
    return Math.sqrt(3) / 2 / Math.cos(m);
  };
  for (let i = 0; i < 6; i++) {
    const a0 = i * SIXTH, a1 = (i + 1) * SIXTH;
    pts.push(Math.cos(a0), 0, Math.sin(a0), Math.cos(a1), 0, Math.sin(a1));
  }
  const TICKS = 48;
  for (let i = 0; i < TICKS; i++) {
    const a = (i / TICKS) * Math.PI * 2;
    const corner = i % (TICKS / 6) === 0; // 6 longer corner ticks
    const rb = rHex(a);
    const r0 = rb * 1.04, r1 = rb * (corner ? 1.2 : 1.11);
    pts.push(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * r1, 0, Math.sin(a) * r1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
  return geo;
}

interface RingRec {
  mesh: THREE.LineSegments;
  y: number;
  glow: number;   // transient sparkle while a pulse passes (decays)
  lit: boolean;   // latched: anchored into the CURRENT tick (cleared on the next tick)
  radius: number;
  floor: "l0" | "l1";
}
interface CurveRec {
  id: string; // metagraph id — carried on the rec so the per-frame loop can iterate .values()
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
  // Identity SCENE-lane colour map (id -> 0xRRGGBB) — the ONE colour system, shared with the
  // hubs/nodes/HUD (src/palette/identity.ts via the Engine). Required at construction so nothing
  // in this view is ever built from a raw config colour; refreshed via setSceneColors() when the
  // live metagraph set arrives. Defensive fallback is the structural accent, never config.
  sceneColors: Record<string, number>;
  pickables: THREE.Object3D[];

  private model = new LedgerModel();
  private t: number;
  private _latest: GlobalSnapshot | null;
  private _baseR: number;
  private _filter: string; // metagraph filter; when a single metagraph, the OTHERS dim strongly

  // Anchor animation state. _anchorGroup holds the node-group station dials (built once, persistent).
  private _anchorGroup: THREE.Group;
  private _dialGeo: THREE.BufferGeometry;
  private _curves: Map<string, CurveRec>; // metaId -> { sx, sz, color, rings } (sx/sz = pulse curve origin)
  private _pulses: Pulse[];               // active { rec, t, speed }
  private _queue: QueueItem[];            // pending emissions { id, dueAt }
  private _lastDue: number;
  private _flash: number;                 // centre-block arrival flash
  private _gL0Glow: number;               // hypergraph-L0 dial sparkle — as anchor pulses reach that cluster
  private _gL0Lit = false;                // latched: produced the CURRENT tick (cleared on the next)
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

  private _gL0Ring: THREE.LineSegments;
  private _dagL1Ring: THREE.LineSegments;
  // Per-plane materials keyed by layer id, so setHighlight() can brighten one floor (explore panel).
  private _floorMats = new Map<string, { frame: THREE.LineBasicMaterial; fill: THREE.ShaderMaterial }>();

  constructor(scene: THREE.Scene, colors: SceneColors, sceneColors: Record<string, number>) {
    this._core = colors.core;
    this._coreCol = new THREE.Color(colors.core);
    this.sceneColors = sceneColors;
    this.group = new THREE.Group();
    this.group.visible = false;
    // Whole-view orientation (tilt ∘ rotY) + scale so the ledger frames well under the SHARED overview
    // camera — the camera never moves; the group does. Globe bakes the SAME matrix (Rx·Ry) into the
    // node ledger positions so planes + nodes stay aligned — set the quaternion from that exact matrix.
    this.group.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeRotationX(LEDGER.viewTiltX).multiply(new THREE.Matrix4().makeRotationY(LEDGER.viewRotY)),
    );
    this.group.scale.setScalar(LEDGER.viewScale);
    scene.add(this.group);
    this.pickables = [];
    this.t = 0;
    this._latest = null;
    this._baseR = 1;

    this._anchorGroup = new THREE.Group();
    this.group.add(this._anchorGroup);
    this._dialGeo = buildDialGeometry(); // shared unit dial (hairline circle + ruler ticks), scaled per group
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

    // The global clusters' station dials — the DAG treated as a metagraph-shaped core (unified node
    // model): hypergraph L0 (lights as anchor pulses reach that floor) + the DAG L1 lane's cluster.
    const dagHue = this.sceneColors["dag"] ?? this._core; // the DAG's identity hue — matches its node instances
    this._gL0Ring = this._makeDial(0, LEDGER.rowHypL0, 0, dagHue);
    this._gL0Ring.scale.setScalar(DIAL_R);
    this.group.add(this._gL0Ring);
    this._dagL1Ring = this._makeDial(0, LEDGER.rowDAGL1, LEDGER.dagLaneZ, dagHue);
    this._dagL1Ring.scale.setScalar(DIAL_R);
    this.group.add(this._dagL1Ring);
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
        vertexColors: true, transparent: true, opacity: 0.85, // hot links pop; trailing links kept dim by their low vertex-colour
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

  // Install/refresh the identity colour map and RE-TINT everything built before it arrived:
  // each metagraph's station dials + pulse colour (rec.color), and the global dials (the DAG's
  // own identity hue — the same hue its L0/L1 node instances wear, so dial and dots agree).
  setSceneColors(map: Record<string, number>) {
    this.sceneColors = map;
    this._laneColors.clear(); // lane tiles re-resolve lazily via _laneColor
    for (const [id, rec] of this._curves) {
      const color = map[id] ?? rec.color;
      rec.color = color;
      for (const r of rec.rings) (r.mesh.material as THREE.LineBasicMaterial).color.set(color);
    }
    const dag = map["dag"] ?? this._core;
    (this._gL0Ring.material as THREE.LineBasicMaterial).color.set(dag);
    (this._dagL1Ring.material as THREE.LineBasicMaterial).color.set(dag);
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
      c = new THREE.Color(this.sceneColors[id] ?? this._core); // identity map only
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
    const W = 39.5;      // X extent (camera-depth) — tight to the trail; the FRONT gets a 1.5-unit
                         // strip beyond the original edge: enough that the corner labels clear the
                         // global clusters' dials (ONE DIAL_R everywhere since 2026-07-12; label band clears it)
                         // without the panes reading empty at the front (user-tuned down from +3)
    const D = 44;        // Z extent — tight to the lanes
    const cx = -13.25;   // keeps the −X edge at −33 (still clears the trail ~−29) while the +X
                         // front edge sits at 6.5 for the label strip
    // Every floor is the SAME simple treatment: a sharp-edged transparent FRAME plus a faint,
    // pixelated edge-weighted fill (quickly gone toward the centre). Each plane gets its OWN cloned
    // materials, stored by layer id in `_floorMats`, so the explore panel can highlight ONE plane
    // (setHighlight) — brighten its frame + fill — without touching the rest.
    // The frame colour is pushed into HDR (×2) so the thin edge lines land above the bloom pass's
    // threshold and GLOW like the nodes / the geo coastal rim — the opacity still sets the line's
    // core brightness, the overdriven colour is what feeds the bloom.
    const frameMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(this._core).multiplyScalar(2),
      transparent: true, opacity: FLOOR_FRAME_OP,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const fillMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(this._core) }, uOpacity: { value: FLOOR_FILL_OP }, uInner: { value: FLOOR_INNER_OP } },
      vertexShader: `
        varying vec2 vP;
        void main() { vP = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity; uniform float uInner; varying vec2 vP;
        void main() {
          // Pixelated, not smooth: snap to a grid of cells, then quantize the alpha into steps.
          float GRID = 48.0; // finer pixel cells (user-tuned smaller)
          vec2 cell = (floor(vP * GRID) + 0.5) / GRID;
          float e = max(abs(cell.x), abs(cell.y));
          float band = smoothstep(0.88, 1.0, e); // 12% band — user-tuned to 2/3 of the earlier 18%
          band = floor(band * 3.0 + 0.5) / 3.0;
          // Edge band + the flat INNER sheet (uInner: 0 at rest — transparent centre — raised on
          // highlight so content sits on a visible surface).
          float a = uOpacity * band + uInner;
          if (a <= 0.002) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    // Per-plane clones (independent uniforms) so a single plane can be highlighted. Each fill mesh
    // is also a PICK target carrying its layer descriptor (name/desc from the shared LEDGER_LAYERS):
    // hovering/clicking the plane in 3D mirrors the explore panel's rows. The Engine treats layer
    // picks as FALLBACK hits (blocks/nodes win), so the big stacked planes never steal their picks.
    const frame = (w: number, d: number, y: number, z: number, id: string) => {
      const fm = fillMat.clone();
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fm);
      fill.rotation.x = -Math.PI / 2; fill.position.set(cx, y, z); fill.renderOrder = -2;
      fill.userData.pick = { kind: "layer", layerId: id };
      this.pickables.push(fill);
      this.group.add(fill);
      const lm = frameMat.clone();
      const f = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)), lm);
      f.rotation.x = -Math.PI / 2; // lie flat in the X/Z plane (w→X, d→Z)
      f.position.set(cx, y, z);
      f.renderOrder = -1;
      this.group.add(f);
      this._floorMats.set(id, { frame: lm, fill: fm });
    };
    for (const { y, id } of LAYER_GEOM.filter((l) => l.laneZ === 0)) frame(W, D, y, 0, id);

    // The hypergraph-L0 level is ONE plane CUT along Z: the 2/3 toward +Z/centre is hypergraph L0
    // (the global validators over the global block); the −Z 1/3 is RESERVED for hypergraph L1 — the
    // DAG's native $DAG currency — at the SAME height. Two adjacent frames with a gap between them.
    const hy = LEDGER.rowHypL0;
    // The 2/3 : 1/3 split geometry is the shared config.HYP_SPLIT (the layer-focus camera reads the
    // same pane centres to frame each sub-pane centred).
    const l1D = HYP_SPLIT.l1Edge - -D / 2, l0D = D / 2 - HYP_SPLIT.l0Edge; // shrunk by the gap
    frame(W, l0D, hy, HYP_SPLIT.l0Cz, "hypl0");
    frame(W, l1D, hy, HYP_SPLIT.l1Cz, "hypl1");

    // Floor labels — flat text at each plane's FRONT-LEFT corner (user-placed), reading from the
    // camera: the layer's STACK LEVEL in a small outlined box + its name, both from the SAME
    // display-copy table as the explore panel rows (src/data/ledgerLayers.ts LEDGER_LAYERS.level:
    // up from the base — Global snapshots = 1; the split hypergraph plane is ONE level with
    // sub-levels 2.1/2.2, each labelling its own front-left corner).
    const copyOf = (id: string) => LEDGER_LAYERS.find((l) => l.id === id);
    const lx = cx + W / 2 - 0.4; // front edge, small inset
    for (const { y, id } of LAYER_GEOM.filter((l) => l.laneZ === 0))
      this.group.add(this._makeLabel(copyOf(id)?.level ?? "", copyOf(id)?.name ?? id, lx, y, D / 2 - 1.2));
    this.group.add(this._makeLabel(copyOf("hypl0")?.level ?? "", copyOf("hypl0")?.name ?? "", lx, hy, D / 2 - 1.2));
    this.group.add(this._makeLabel(copyOf("hypl1")?.level ?? "", copyOf("hypl1")?.name ?? "", lx, hy, HYP_SPLIT.l1Edge - 1.2));
  }

  // A flat floor label lying on the plane, its text STARTING at the given front-left corner
  // (frontX = the plane's +X/camera edge, leftZ = its +Z/screen-left edge) and running along the
  // edge toward screen-right: the layer's ORDER digit in a small outlined box (mirroring the
  // explore panel's number badge) + the name. Canvas-texture text (revival of the pre-47cbc72
  // _makeLabel); the one colour derives from the structural token (colors.core).
  private _makeLabel(level: string, text: string, frontX: number, y: number, leftZ: number): THREE.Mesh {
    const c = document.createElement("canvas");
    // 2× supersampled canvas (SS): the old 512×64 texture went blurry under the shallow overview
    // camera's foreshortening; all metrics below are in CSS-ish units and multiplied by SS.
    const SS = 2;
    c.width = 512 * SS;
    c.height = 64 * SS;
    const ctx = c.getContext("2d")!;
    // Structural accent (colors.core — the SAME token the floor frames use), solid-bright for
    // legibility (user: labels read unclear, make them cyan); derived from the token, no literal.
    const cc = new THREE.Color(this._core);
    const tone = `rgba(${Math.round(cc.r * 255)},${Math.round(cc.g * 255)},${Math.round(cc.b * 255)},0.85)`;
    ctx.font = `400 ${22 * SS}px system-ui, -apple-system, sans-serif`;
    const boxW = Math.max(34 * SS, Math.ceil(ctx.measureText(level).width) + 16 * SS); // fits "2.1" sub-levels
    ctx.strokeStyle = tone;
    ctx.lineWidth = 2 * SS;
    ctx.strokeRect(6 * SS, 15 * SS, boxW, 34 * SS); // the level badge box
    ctx.fillStyle = tone;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(level, 6 * SS + boxW / 2, (15 + 17 + 1) * SS); // level centred in the box
    ctx.font = `400 ${26 * SS}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(text, 6 * SS + boxW + 12 * SS, c.height / 2 + 2 * SS);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const h = 1.05, w = h * (c.width / c.height); // aspect is SS-invariant; sized down a touch (user)
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }),
    );
    // Lie flat on the floor, readable from the resting camera: canvas right → −Z local (screen
    // right), canvas up → −X local (glyph tops away from the camera), normal → +Y (up).
    mesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
      ),
    );
    // Corner-anchor: the canvas LEFT edge sits at leftZ (text starts at the corner), the glyph
    // BASELINE side hugs the front edge.
    mesh.position.set(frontX - h / 2, y + 0.06, leftZ - w / 2);
    mesh.renderOrder = 2;
    return mesh;
  }

  // Highlight one floor plane by layer id — brighten its frame + edge fill (the fill stays airy —
  // the selected plane must not read as a solid sheet). `dimOthers` (a COMMITTED layer selection)
  // additionally recedes the OTHER planes to the dimmed OFF state; a mere hover preview must NOT
  // (the overview planes cover most of the screen, so the cursor is nearly always over one — a
  // hover that dimmed the rest read as "filtering dims the layers", user bug). null id restores
  // every plane to rest. Every plane owns its materials (see _buildFloors).
  setHighlight(id: string | null, dimOthers = false): void {
    for (const [k, m] of this._floorMats) {
      const on = id === k;
      const off = id != null && dimOthers;
      m.frame.opacity = on ? FLOOR_FRAME_HI : off ? FLOOR_FRAME_OFF : FLOOR_FRAME_OP;
      m.fill.uniforms.uOpacity.value = on ? FLOOR_FILL_HI : off ? FLOOR_FILL_OFF : FLOOR_FILL_OP;
      m.fill.uniforms.uInner.value = on ? FLOOR_INNER_HI : FLOOR_INNER_OP;
    }
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
    this.pickables.push(this.center); // append — _buildFloors already registered the layer planes
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

  // Build metagraph `id`'s station dials + cache its pulse-curve origin (the lane site). The
  // visible anchor line is NOT built here — it's drawn dynamically per block in the link pass
  // (via curvePoint) so it travels with the block; only the pulses use the cached origin.
  private _addCurve(id: string): CurveRec | null {
    const i = METAGRAPHS.findIndex((m) => m.id === id);
    if (i < 0) return null; // unlisted — no site
    const s = ledgerSite(i, METAGRAPHS.length);
    const color = this.sceneColors[id] ?? this._core; // identity map only — never a config colour
    // Station dials on the L1 + L0 node floors this metagraph produces from — the resting identity
    // mark (ONE fixed radius for every metagraph); an anchor pulse brightens them as it passes.
    const rings: RingRec[] = [
      { mesh: this._makeDial(s.x, LEDGER.rowML1, s.z, color), y: LEDGER.rowML1, glow: 0, lit: false, radius: DIAL_R, floor: "l1" },
      { mesh: this._makeDial(s.x, LEDGER.rowML0, s.z, color), y: LEDGER.rowML0, glow: 0, lit: false, radius: DIAL_R, floor: "l0" },
    ];
    for (const r of rings) {
      r.mesh.scale.setScalar(r.radius);
      this._anchorGroup.add(r.mesh);
    }
    const rec: CurveRec = { id, sx: s.x, sz: s.z, color, rings };
    this._curves.set(id, rec);
    return rec;
  }

  // A station DIAL lying flat on a floor, sharing the unit `_dialGeo` (scaled to its FIXED radius —
  // one size for EVERY cluster incl. the global L0 / DAG L1, DIAL_R). Identity-hued,
  // faint at rest (DIAL_REST_OP); the anchor-pulse glow brightens it on top (see update).
  private _makeDial(x: number, y: number, z: number, color: number): THREE.LineSegments {
    const dial = new THREE.LineSegments(
      this._dialGeo,
      new THREE.LineBasicMaterial({
        color, transparent: true, opacity: DIAL_REST_OP,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    dial.position.set(x, y + 0.02, z); // geometry is already in the floor plane (X/Z)
    dial.userData.baseOpacity = DIAL_REST_OP; // resting identity mark; pulses brighten from here
    return dial;
  }

  private _clearCurves() {
    for (const o of this._anchorGroup.children.slice()) {
      this._anchorGroup.remove(o);
      (o as THREE.Mesh).material && ((o as THREE.Mesh).material as THREE.Material).dispose(); // geometry is the shared _dialGeo
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
    if (isNewTick) {
      this._queue.length = 0;
      // A new global snapshot: the previous tick's did-work latches expire — dials drop back
      // to rest until this tick's own anchor pulses re-light them.
      for (const rec of this._curves.values()) for (const r of rec.rings) r.lit = false;
      this._gL0Lit = false;
    }
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
  // its emphasis (brightness) even after it trails left. Null = nothing selected.
  setSelected(ordinal: number | null) {
    this.model.setSelected(ordinal);
  }

  // The network filter: when a single metagraph is selected, the OTHER metagraphs' lead tiles + links
  // dim strongly too (so the lead row emphasises only the selected metagraph). "all"/"dag" = no dim.
  // The floor-plane FRAME LINES deliberately stay the structural default in every filter state —
  // an identity-hued outline was tried (with luminance equalization) and read too dominant (user).
  setFilter(filter: string) {
    this._filter = filter || "all";
  }

  update(dt: number) {
    this.t += dt;
    if (!this._latest) return;

    const k = Math.min(1, dt * 3); // shared ease factor for the trail + lanes this frame
    const selectedSlot = this.model.selectedSlot;
    // A single-metagraph filter strongly dims every OTHER lane's tiles/links/dials.
    const mf = this._filter !== "all" && this._filter !== "dag" ? this._filter : null;

    // The centre block (LIVE snapshot) pulses subtly + flashes as pulses arrive — dimmed (brightness
    // only, colour stays) while an OLDER snapshot is selected so the selected row reads brightest.
    this._flash = Math.max(0, this._flash - dt * 2.2);
    const leadDimmed = selectedSlot > 0;
    this.centerMat.color.copy(this._coreCol);
    this.centerMat.emissive.copy(this._coreCol);
    this.centerMat.emissiveIntensity = leadDimmed ? 0.26 : 0.44 + this._flash * 0.5;

    // Hypergraph-L0 participation ring: glows as the global L0 produces each snapshot, then fades.
    this._gL0Glow = Math.max(0, this._gL0Glow - dt * 1.4);
    (this._gL0Ring.material as THREE.LineBasicMaterial).opacity =
      this._gL0Ring.userData.baseOpacity + (this._gL0Lit ? DIAL_LIT_OP : 0) + this._gL0Glow * 0.7;
    this.center.scale.setScalar(this._baseR * (1 + Math.sin(this.t * 2.2) * 0.06 + this._flash * 0.12));

    // The global trail eases left into its slots; every block keeps the accent colour — the SELECTED
    // block reads brighter, everything else fades gently by recency (slotFade). (The neutral-tone +
    // depth-fog recency treatment was removed; brightness alone carries recency for now.)
    for (const t of this.model.trail) {
      const mesh = this._trailMeshes.get(t.ordinal);
      if (!mesh) continue;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mesh.position.x += (-t.slot * SLOT_SP - mesh.position.x) * k;
      const sel = t.slot === selectedSlot;
      mat.color.copy(this._coreCol);
      mat.emissive.copy(this._coreCol);
      mat.emissiveIntensity = sel ? 0.9 : 0.34;
      const target = sel ? 0.95 : 0.75 * slotFade(t.slot);
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
      let mi = 0, li = 0;
      for (const lane of this.model.lanes.values()) {
        const laneOff = mf != null && lane.id !== mf; // filtered out → strongly dimmed
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
          // Every tile wears its LANE COLOUR; emphasis is pure brightness. The HOT row (live lead, or
          // a selected older snapshot — isRowHot keeps the exactly-one-hot-row rule) reads bright and
          // blooms; the rest fade by recency (slotFade). A filtered-out lane is strongly dimmed.
          const hot = this.model.isRowHot(laneOff, b.slot);
          const bright =
            (hot ? Math.max(b.fade, 0.9) * (b.filled ? 1.3 : 0.2) : b.fade * (b.filled ? 0.55 : 0.12)) *
            (laneOff ? 0.22 : 1);
          this._metaTrailMesh.setColorAt(mi, _col.copy(laneColor).multiplyScalar(bright));
          mi++;

          // One anchor link per cluster (from its centre tile) — the shared curvePoint shape: straight
          // down through the L1/L0 ring centres, then into the global block, travelling with the blocks.
          const g = _gx.get(b.slot);
          if (b.filled && b.link && g !== undefined && li + LINK_SEG <= LINK_CURVES * LINK_SEG) {
            // Links match their tiles: lane colour, brightness-graded — the hot row's link pops
            // near-full on the additive material, trailing links stay dim, filtered-out lanes dimmer.
            _col.copy(laneColor).multiplyScalar(
              (hot ? Math.max(b.fade, 0.9) * 1.25 : b.fade * 0.3) * (laneOff ? 0.22 : 1),
            );
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
      for (const r of p.rec.rings) if (Math.abs(_p.y - r.y) < 1.3) { r.glow = 1; r.lit = true; }
      // The global-L0 ring lights only when an anchor pulse actually reaches that cluster's floor.
      if (Math.abs(_p.y - LEDGER.rowHypL0) < 1.3) { this._gL0Glow = 1; this._gL0Lit = true; }
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

    // Decay + apply the station-dial highlights (brighter + slightly larger while a pulse is in).
    // A single-metagraph filter dims every OTHER metagraph's dials, consistent with its tiles/links.
    // .values(), not entries — Map entry destructuring allocates a tuple per rec per frame.
    for (const rec of this._curves.values()) {
      const dialOff = mf != null && rec.id !== mf;
      for (const r of rec.rings) {
        r.glow = Math.max(0, r.glow - dt * 2.4);
        (r.mesh.material as THREE.LineBasicMaterial).opacity =
          (r.mesh.userData.baseOpacity + (r.lit ? DIAL_LIT_OP : 0) + r.glow * 0.7) * (dialOff ? 0.22 : 1);
        r.mesh.scale.setScalar(r.radius * (1 + r.glow * 0.12)); // fixed radius, a touch bigger on a pulse
      }
    }
  }

  dispose() {
    this._clearCurves();
    for (const mesh of this._trailMeshes.values()) (mesh.material as THREE.Material).dispose(); // geometry is the shared _trailGeo
    this._trailMeshes.clear();
    this._dialGeo.dispose();
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
