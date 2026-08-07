// The Snapshots view's 3D anchoring chamber (redesign 2026-08-04, spec §4).
//
// TWO glass FLOORS, not seven: the metagraph-snapshot floor (level 2) above the global-snapshot
// floor (level 1, the base ledger). The four NODE layers are no longer storeys of their own — they
// ride as RAILS along the front edge of the floor they serve (objects/NodeRails), so the chamber
// says what it is about: snapshots anchoring into snapshots.
//
// The global snapshot is no longer a block sized by anchor count but a BYTE BAR (objects/ByteBar)
// whose WIDTH is the bytes that tick actually carried, banded per metagraph; RIBBONS
// (objects/Ribbons) tie each lane's tiles above to its own band below. The dials, the cubic anchor
// links and the centred lead block are RETIRED with the seven-floor stack.
//
// This class owns the floors, their labels, the metagraph-snapshot lane tiles, the currency gutter
// line and the anchor pulses; everything else is composed from the three adapters.
//
// ─── STATE vs. MESH split ──────────────────────────────────────────────────────────────────────
// This class is the SCENE ADAPTER over LedgerModel (domain/ledgerModel.ts): the domain owns which
// slot a block sits in, the trail/lane arrays, tickOrdinal and the selected slot; this class owns
// every mesh, material, label and the per-frame draw, and eases each LaneBlock's `x`/`fade` toward
// its resting slot in place.
//
// AXIS CONVENTION (the group is rotated LEDGER.viewRotY about Y): local +X is toward the camera,
// the lead slot is x = 0 and the trail runs to −X; +Y is floor height; +Z is the lane/width field.
// So a bar's WIDTH is its Z extent, the rails run along Z at positive X, and the gutter sits beyond
// the lane field at negative Z.

import * as THREE from "three";
import { METAGRAPHS } from "../../config";
import {
  LEDGER,
  FLOOR_IDS,
  FLOOR_Y,
  GUTTER_CZ,
  GUTTER_W,
  FLOOR_MAIN_Z0,
  FLOOR_Z1,
  LEAD_X,
  LANE_HALF_Z,
  laneSpan,
  type RailGroup,
} from "../../domain/ledgerLayout";
import type { SceneColors } from "../../sceneColors";
import { LedgerModel, SLOT_SP, SLOT_N, LANE_GAP_Z, slotFade } from "../../domain/ledgerModel";
import { makeBarSpec, fillBarSpec, UNLISTED_KEY, type BarSpec } from "../../domain/ledgerBands";
import type { ContainerSpec } from "../../domain/ledgerRails";
import type {
  GlobalSnapshot,
  Anchor,
  PickDescriptor,
  SnapshotExact,
  CurrencyActivity,
} from "@/src/data/types";
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers"; // shared display copy — floor labels = panel rows
import { activityLine } from "@/src/data/currencyActivity";
import { ByteBar } from "../objects/ByteBar";
import { Ribbons } from "../objects/Ribbons";
import { NodeRails } from "../objects/NodeRails";
import { FadeSet } from "../objects/FadeSet";
import type { SceneView } from "./SceneView";

/** The live-tunable FLOOR-PLANE look (dev `?tune` panel binds these; the values are the shipped
 *  look). NB the frame material's colour is HDR-overdriven ×2 (see _buildFloors), so the
 *  opacities read roughly HALF the perceived line brightness. `edge` is where the fill's
 *  edge-band starts (the colour drop-off toward the centre: 1 = only the rim, 0 = solid). */
export interface FloorTune {
  frameOp: number; // the hairline frame
  fillOp: number;  // the edge-band fill
  innerOp: number; // the flat centre level
  edge: number;    // drop-off start (uEdge uniform — smoothstep(edge → 1) over |uv|)
}

export const FLOOR_TUNE_DEFAULTS: FloorTune = {
  frameOp: 0.11,
  fillOp: 0.03,
  innerOp: 0,
  edge: 0.88,
};

const PULSE_MAX = 220;
const PULSE_STAGGER = 0.035;
const META_TRAIL_MAX = 1500;
const GUTTER_OP = 0.75;

/** The glass floors' footprint, and the X the edge-aligned labels read from. Module scope because
 *  the gutter label has to land on the SAME edge as the floor labels (it used to be derived from
 *  LEDGER.depth and floated ~9 units in front of the chamber). */
const FLOOR_W = 39.5;
const FLOOR_D = 44;
const FLOOR_CX = -13.25;
const FLOOR_LABEL_X = FLOOR_CX + FLOOR_W / 2 - 0.4;

/** The lead row's "forming…" note: quieter than a floor label, and it eases rather than blinks. */
const FORMING_OP = 0.6;
const FORMING_EASE = 2.2;
/** Just camera-side of the lead slot, reading in from the +Z edge of the lane field. */
const FORMING_X = LEAD_X + 1.4;
const FORMING_Z = LANE_HALF_Z + 8;

const _dummy = new THREE.Object3D();
const _col = new THREE.Color();
const _p = new THREE.Vector3();

const rgbTriplet = (c: THREE.Color): string =>
  `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;

/** One anchor travelling down a lane's ribbon, from its tile above onto its band below. */
interface Pulse {
  idx: number;
  t: number;
  speed: number;
  color: number;
}
interface QueueItem {
  id: string;
  dueAt: number;
}

/** Resolves a lane tile to the metagraph snapshot it stands for. A tile the polled buffer no longer
 *  knows returns null — it stays DRAWN but is left out of `pickables` (the anonymous tile, §6.1). */
export type TilePickResolver = (metaId: string, tickTs: string, k: number) => PickDescriptor | null;

/** The live-tunable metagraph-snapshot TILE look (dev `?tune` panel binds these; the values are
 *  the shipped look). Brightness multipliers on the tile's identity colour. */
export interface TileTune {
  hot: number;  // the hot row's filled tiles
  rest: number; // a resting filled tile
  dim: number;  // the whole-lane multiplier while the lane is off-filter
}

// hot/rest user-tuned via ?tune, 2026-08-07 — the same levels as the byte bar's hot/rest.
export const TILE_TUNE_DEFAULTS: TileTune = { hot: 0.7, rest: 0.2, dim: 0.22 };

export class LedgerView implements SceneView {
  group: THREE.Group;
  pickables: THREE.Object3D[];
  sceneColors: Record<string, number>;

  private model = new LedgerModel();
  private t: number;
  private _latest: GlobalSnapshot | null;
  /** The COMMITTED network — the only thing that may move geometry (the lane field, the gutter). */
  private _filter: string;
  /** The HOVERED network, a pure preview that overrides the committed one for DIMMING only. */
  private _hover: string | null = null;

  private _core: number;
  private _border: number;
  private _panel: number;
  private _muted: number;

  // ── floors (visual aid only since 2026-08-06 — not pick targets)
  private _floorMats = new Map<
    string,
    { frame: THREE.LineBasicMaterial; fill: THREE.ShaderMaterial }[]
  >();

  // ── the three adapters (spec §4.2–§4.4)
  private _rails: NodeRails;
  private _bar: ByteBar;
  private _ribbons: Ribbons;
  /** Dev-only access for the ?tune panel (Engine.mountDevTune) — not part of the frame path. */
  get ribbons(): Ribbons { return this._ribbons; }
  get bar(): ByteBar { return this._bar; }
  /** The tiles' live-tunable look — read per frame by update()'s tile pass. */
  tiles: TileTune = { ...TILE_TUNE_DEFAULTS };
  /** The floor planes' live-tunable look — read per frame by _applyFloorAlpha. */
  floors: FloorTune = { ...FLOOR_TUNE_DEFAULTS };

  // ── the lane field (construction-time; never reallocated per frame)
  private readonly _laneOrder: string[] = METAGRAPHS.map((m) => m.id);
  private readonly _laneZ = new Map<string, number>();
  private readonly _laneHZ = new Map<string, number>();
  private readonly _laneHidden = new Map<string, boolean>();
  private _committedLane: number | null = null;
  /** Ribbons' lane resolver: null for a HIDDEN lane (another network committed) so it draws no
   *  sheet — a hidden lane laid no tiles, and its old-position ribbon would overlap the committed
   *  lane's field (finetune 2026-08-06). */
  private readonly _laneZOf = (key: string): number | null =>
    this._laneHidden.get(key) ? null : this._laneZ.get(key) ?? null;

  // ── per-slot bar specs + the snapshot each slot stands for
  private readonly _specs: BarSpec[] = [];
  private readonly _slotSnap: (GlobalSnapshot | null)[] = [];
  private readonly _byOrd = new Map<number, GlobalSnapshot>();
  private readonly _bytes = new Map<string, number>();
  private _exact: Record<number, SnapshotExact> = {};

  // ── lane tiles
  private _metaTrailMesh!: THREE.InstancedMesh;
  private _metaLastDrawn = 0;
  private _laneColors: Map<string, THREE.Color> = new Map();
  private _tileResolver: TilePickResolver | null = null;
  private readonly _tilePicks: (PickDescriptor | null)[] = new Array(META_TRAIL_MAX).fill(null);

  // ── anchor pulses
  private _pulseMat!: THREE.MeshBasicMaterial;
  private _pulseMesh!: THREE.InstancedMesh;
  private _pulses: Pulse[] = [];
  private _queue: QueueItem[] = [];
  private _lastDue = 0;
  private _lastDrawn = 0;

  // ── the currency gutter (spec §4.5/§6.7)
  private _gutterLabel: THREE.Mesh | null = null;
  private _activity: Record<string, CurrencyActivity | null> = {};

  // ── the lead row's honesty label: the newest tick's anchor count is still growing
  private _formingLabel: THREE.Mesh | null = null;
  private _formingW = 0;

  // ── fades (the ledger's stage light went with the layer navigation, 2026-08-06 — nothing
  // committable is left for a spot to dramatise)
  private _fades = new FadeSet();

  constructor(
    scene: THREE.Scene,
    colors: SceneColors,
    sceneColors: Record<string, number>,
  ) {
    this._core = colors.core;
    this._border = colors.border;
    this._panel = colors.panel;
    this._muted = colors.muted;
    this.sceneColors = sceneColors;

    this.group = new THREE.Group();
    this.group.quaternion.setFromRotationMatrix(
      new THREE.Matrix4()
        .makeRotationX(LEDGER.viewTiltX)
        .multiply(new THREE.Matrix4().makeRotationY(LEDGER.viewRotY)),
    );
    this.group.scale.setScalar(LEDGER.viewScale);
    scene.add(this.group);

    this.pickables = [];
    this.t = 0;
    this._latest = null;
    this._filter = "all";

    for (let s = 0; s < SLOT_N; s++) {
      this._specs.push(makeBarSpec());
      this._slotSnap.push(null);
    }
    // "all" runs the same code path as a committed lane — seed the field once.
    this._relayoutLaneField();

    this._buildFloors();

    this._rails = new NodeRails(colors);
    this._bar = new ByteBar(colors, sceneColors);
    this._ribbons = new Ribbons(colors, sceneColors);
    this.group.add(this._rails.group, this._bar.group, this._ribbons.group);

    this._buildMetaTrail();
    this._buildPulses();
    this._syncPickables();
  }

  // ── build ────────────────────────────────────────────────────────────────

  private _buildMetaTrail() {
    this._metaTrailMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 0.35),
      new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      META_TRAIL_MAX,
    );
    this._metaTrailMesh.frustumCulled = false;
    this._metaTrailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < META_TRAIL_MAX; i++) this._metaTrailMesh.setColorAt(i, _col.set(0xffffff));
    _dummy.scale.setScalar(0);
    _dummy.updateMatrix();
    for (let i = 0; i < META_TRAIL_MAX; i++) this._metaTrailMesh.setMatrixAt(i, _dummy.matrix);
    this._metaTrailMesh.instanceMatrix.needsUpdate = true;
    // A raycast hit's `instanceId` resolves through this array — tiles are instances, so they can't
    // each carry a userData.pick of their own. `picks` is the name the Engine's raycast reader
    // already implements for every instanced pool (Globe uses the same key).
    this._metaTrailMesh.userData.picks = this._tilePicks;
    this.group.add(this._metaTrailMesh);
  }

  private _buildPulses() {
    this._pulseMat = new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._pulseMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.17, 8, 8),
      this._pulseMat,
      PULSE_MAX,
    );
    this._pulseMesh.frustumCulled = false;
    this._pulseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < PULSE_MAX; i++) this._pulseMesh.setColorAt(i, _col.set(0xffffff));
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

  private _laneColor(id: string): THREE.Color {
    let c = this._laneColors.get(id);
    if (!c) {
      c = new THREE.Color(this.sceneColors[id] ?? this._core);
      this._laneColors.set(id, c);
    }
    return c;
  }

  private _buildFloors() {
    const W = FLOOR_W;
    const D = FLOOR_D;
    const cx = FLOOR_CX;
    const frameMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(this._core).multiplyScalar(2),
      transparent: true,
      opacity: FLOOR_TUNE_DEFAULTS.frameOp,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const fillMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(this._core) },
        uOpacity: { value: FLOOR_TUNE_DEFAULTS.fillOp },
        uInner: { value: FLOOR_TUNE_DEFAULTS.innerOp },
        uEdge: { value: FLOOR_TUNE_DEFAULTS.edge },
      },
      vertexShader: `
        varying vec2 vP;
        void main() { vP = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity; uniform float uInner; uniform float uEdge; varying vec2 vP;
        void main() {
          float GRID = 48.0;
          vec2 cell = (floor(vP * GRID) + 0.5) / GRID;
          float e = max(abs(cell.x), abs(cell.y));
          float band = smoothstep(uEdge, 1.0, e);
          band = floor(band * 3.0 + 0.5) / 3.0;
          float a = uOpacity * band + uInner;
          if (a <= 0.002) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    const frame = (w: number, d: number, y: number, x: number, z: number, id: string) => {
      const fm = fillMat.clone();
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fm);
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(x, y, z);
      fill.renderOrder = -2;
      this.group.add(fill);
      const lm = frameMat.clone();
      const f = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)), lm);
      f.rotation.x = -Math.PI / 2;
      f.position.set(x, y, z);
      f.renderOrder = -1;
      this.group.add(f);
      const list = this._floorMats.get(id) ?? [];
      list.push({ frame: lm, fill: fm });
      this._floorMats.set(id, list);
    };
    // TWO floors now — the node layers hang in containers under their edges, not storeys of their
    // own. Each floor is a MAIN plane (the lane field + label margin) plus its GUTTER as a small
    // separate plane beyond a visible seam (finetune 2026-08-06): the currency strip above, the
    // reserved $DAG-blocks strip below — a distinct instrument, not a corner of the floor.
    const mainZ1 = FLOOR_Z1; // == FLOOR_D/2 — promoted to the domain so the containers share it
    const mainD = mainZ1 - FLOOR_MAIN_Z0;
    for (const id of FLOOR_IDS) {
      frame(W, mainD, FLOOR_Y[id], cx, (mainZ1 + FLOOR_MAIN_Z0) / 2, id);
      frame(W, GUTTER_W + 1.0, FLOOR_Y[id], cx, GUTTER_CZ, id);
    }

    const copyOf = (id: string) => LEDGER_LAYERS.find((l) => l.id === id);
    const lx = FLOOR_LABEL_X;
    for (const id of FLOOR_IDS) {
      const m = this._makeLabel(
        copyOf(id)?.level ?? "",
        copyOf(id)?.name ?? id,
        lx,
        FLOOR_Y[id],
        D / 2 - 1.2,
      );
      this.group.add(m);
      this._fades.register(m.material as THREE.MeshBasicMaterial, 1);
    }

    // The lead row is annotated, not decorated: while the live tick's anchor count is still
    // GROWING, say so. It reads out from the +Z edge of the lane field toward the lead slot's own
    // tiles (x ≈ 0), so it can only ever be about that row. Opacity is driven per frame in
    // _applyFloorAlpha (it rides the view alpha like every other piece of furniture), so it is
    // deliberately NOT registered with the fade set.
    this._formingLabel = this._makeLabel("", "forming…", FORMING_X, FLOOR_Y.msnap, FORMING_Z);
    (this._formingLabel.material as THREE.MeshBasicMaterial).opacity = 0;
    this.group.add(this._formingLabel);
  }

  /** A flat, edge-aligned label plane — the chamber's only text. A blank `level` = no digit box. */
  private _makeLabel(
    level: string,
    text: string,
    frontX: number,
    y: number,
    leftZ: number,
  ): THREE.Mesh {
    const c = document.createElement("canvas");
    const SS = 2;
    c.width = 512 * SS;
    c.height = 64 * SS;
    const ctx = c.getContext("2d")!;
    const cc = new THREE.Color(this._core);
    const tone = `rgba(${rgbTriplet(cc)},0.85)`;
    const mc = new THREE.Color(this._muted);
    const mtone = `rgba(${rgbTriplet(mc)},0.95)`;
    const bc = new THREE.Color(this._border);
    const brgb = rgbTriplet(bc);
    const pc = new THREE.Color(this._panel);
    const prgb = rgbTriplet(pc);
    let textX = 6 * SS;
    if (level) {
      ctx.font = `400 ${22 * SS}px system-ui, -apple-system, sans-serif`;
      const boxW = Math.max(34 * SS, Math.ceil(ctx.measureText(level).width) + 16 * SS);
      const bx = 6 * SS,
        by = 15 * SS,
        bh = 34 * SS,
        br = 6 * SS;
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, bh, br);
      ctx.fillStyle = `rgba(${prgb},0.9)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${brgb},0.6)`;
      ctx.lineWidth = 2 * SS;
      ctx.stroke();
      ctx.fillStyle = mtone;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(level, 6 * SS + boxW / 2, (15 + 17 + 1) * SS);
      textX = 6 * SS + boxW + 12 * SS;
    }
    ctx.font = `400 ${26 * SS}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = tone;
    ctx.fillText(text, textX, c.height / 2 + 2 * SS);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const h = 1.05,
      w = h * (c.width / c.height);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    );
    mesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
      ),
    );
    mesh.position.set(frontX - h / 2, y + 0.06, leftZ - w / 2);
    mesh.renderOrder = 2;
    return mesh;
  }

  // ── view alpha / highlight ───────────────────────────────────────────────

  setViewAlpha(a: number): void {
    this._fades.apply(a);
    this._rails.setAlpha(a);
    this._bar.setAlpha(a);
    this._ribbons.setAlpha(a);
    // group.visible is owned SOLELY by the Engine — a view fades, it never hides itself.
  }

  private _applyFloorAlpha(): void {
    for (const [, list] of this._floorMats) {
      for (const m of list) {
        m.frame.opacity = this.floors.frameOp * this._fades.alpha;
        m.fill.uniforms.uOpacity.value = this.floors.fillOp * this._fades.alpha;
        m.fill.uniforms.uInner.value = this.floors.innerOp * this._fades.alpha;
        m.fill.uniforms.uEdge.value = this.floors.edge;
      }
    }
    if (this._gutterLabel)
      (this._gutterLabel.material as THREE.MeshBasicMaterial).opacity =
        GUTTER_OP * this._fades.alpha;
    if (this._formingLabel)
      (this._formingLabel.material as THREE.MeshBasicMaterial).opacity =
        FORMING_OP * this._formingW * this._fades.alpha;
  }

  setSceneColors(map: Record<string, number>): void {
    this.sceneColors = map;
    this._laneColors.clear();
    this._bar.setSceneColors(map);
    this._ribbons.setSceneColors(map);
  }

  // ── the lane field ───────────────────────────────────────────────────────

  /** Event-time only (a filter COMMIT). The committed lane takes the floor; the rest step out. */
  private _relayoutLaneField(): void {
    const n = this._laneOrder.length;
    for (let i = 0; i < n; i++) {
      const s = laneSpan(i, n, this._committedLane);
      const key = this._laneOrder[i];
      this._laneZ.set(key, s.cz);
      this._laneHZ.set(key, s.hz);
      this._laneHidden.set(key, s.hidden);
    }
  }

  // ── data ─────────────────────────────────────────────────────────────────

  setData(snaps: GlobalSnapshot[], getAnchor: (ts: string) => Anchor | null) {
    // `globalSnapshots` is oldest→NEWEST, so the live tick is the LAST entry (LedgerModel.setData
    // reads the same end). Reading snaps[0] pins _latest to the oldest tick, and `isNewTick` then
    // never fires while the buffer is below cap — the pulse stagger would drift unbounded.
    const latest = snaps[snaps.length - 1];
    if (!latest) return;
    const isNewTick = this._latest?.ordinal !== latest.ordinal;
    this._latest = latest;

    const changes = this.model.setData(snaps, getAnchor);

    // event-time: one ordinal index per tick (the trail carries ordinals, not snapshots)
    this._byOrd.clear();
    for (const s of snaps) this._byOrd.set(s.ordinal, s);
    for (let s = 0; s < SLOT_N; s++) this._slotSnap[s] = null;
    if (this.model.tickOrdinal != null)
      this._slotSnap[0] = this._byOrd.get(this.model.tickOrdinal) ?? null;
    for (const tr of this.model.trail)
      if (tr.slot >= 0 && tr.slot < SLOT_N)
        this._slotSnap[tr.slot] = this._byOrd.get(tr.ordinal) ?? null;

    this._rebuildAllSlots();

    if (isNewTick) {
      this._queue.length = 0;
      this._lastDue = this.t;
    }
    const mf = this._filter !== "all" && this._filter !== "dag" ? this._filter : null;
    for (const ch of changes) {
      if (mf && ch.id !== mf) continue;
      for (let k = 0; k < ch.delta && this._queue.length < PULSE_MAX * 2; k++) {
        this._lastDue = Math.max(this.t, this._lastDue + PULSE_STAGGER);
        this._queue.push({ id: ch.id, dueAt: this._lastDue }); // event-time
      }
    }
  }

  /** The exact per-ordinal byte reads — the ONLY source a bar's width may come from (spec §6.2). */
  setExact(byOrdinal: Record<number, SnapshotExact>): void {
    this._exact = byOrdinal;
    this._rebuildAllSlots();
  }

  setTileResolver(fn: TilePickResolver | null): void {
    this._tileResolver = fn;
    this._rebuildTilePicks();
    this._syncPickables();
  }

  setCurrencyActivity(byId: Record<string, CurrencyActivity | null>): void {
    this._activity = byId;
    this._rebuildGutter();
  }

  setContainers(group: RailGroup, specs: ContainerSpec[]): void {
    this._rails.setContainers(group, specs); // event-time: a data rebuild, not a frame
    this._syncPickables();
  }

  setSelected(ordinal: number | null) {
    this.model.setSelected(ordinal);
    this._bar.setSelected(this.model.selectedSlot);
    this._syncRibbonRows();
  }

  /** The COMMITTED network. This is the ONE entry point that may rearrange the lane field — a hover
   *  previews the highlight (setHoverFilter), never the rearrangement. */
  setFilter(filter: string) {
    this._filter = filter || "all"; // event-time
    const idx =
      this._filter === "all" || this._filter === "dag" ? -1 : this._laneOrder.indexOf(this._filter);
    this._committedLane = idx >= 0 ? idx : null;
    this._relayoutLaneField();
    this._applyDim();
    this._rebuildAllSlots();
    this._rebuildGutter();
  }

  /** Filter-chip / hub HOVER: preview that network's highlight only. No relayout, no gutter change,
   *  no pulse re-gating — null falls back to the committed filter. */
  setHoverFilter(filter: string | null) {
    this._hover = filter || null; // event-time
    this._applyDim();
  }

  /** The key the DIM lanes are resolved against: the live hover wins, else the committed filter. */
  private _dimKey(): string {
    return this._hover ?? this._filter;
  }

  private _applyDim(): void {
    const d = this._dimKey();
    this._bar.setFilter(d); // bands dim, never disappear (spec §5.2)
    this._ribbons.setFilter(d);
  }


  // ── slot composition ─────────────────────────────────────────────────────

  private _bytesByKey(ex: SnapshotExact): Map<string, number> {
    this._bytes.clear();
    // event-time: the exact read's own summed per-metagraph bytes (never a per-frame sum of rows).
    // `perMeta` is keyed by EVERY state-channel address — listed AND unlisted — but the bar only
    // has lanes for the listed ones, so every non-lane address folds into UNLISTED_KEY (the
    // aggregation `fillBarSpec` documents). Copying keys verbatim inflated the total while the
    // unlisted band read 0, stretching the last listed band over bytes it never produced.
    for (const [id, v] of Object.entries(ex.perMeta)) {
      const key = this._laneOrder.includes(id) ? id : UNLISTED_KEY; // _laneOrder IS the band order
      this._bytes.set(key, (this._bytes.get(key) ?? 0) + v.bytes);
    }
    return this._bytes;
  }

  private _pickFor(snap: GlobalSnapshot): PickDescriptor {
    const total = typeof snap.metagraphSnapshotCount === "number" ? snap.metagraphSnapshotCount : 0;
    const blk = Array.isArray(snap.blocks) ? snap.blocks.length : 0;
    const blkTxt = blk > 0 ? ` · ${blk} DAG-L1 block${blk === 1 ? "" : "s"}` : "";
    // event-time: one descriptor per slot per tick
    return {
      kind: "snapshot",
      data: snap,
      title: `Global snapshot #${snap.ordinal}`,
      sub: `${total} metagraph snapshot${total === 1 ? "" : "s"} anchored${blkTxt}`,
    } satisfies PickDescriptor;
  }

  private _rebuildAllSlots(): void {
    for (let s = 0; s < SLOT_N; s++) {
      const snap = this._slotSnap[s];
      // A slot with no tick at all renders NOTHING — the seam is reserved for a tick that HAPPENED
      // (ByteBar leaves a never-populated slot's meshes and outline hidden from construction).
      if (!snap) continue;
      const ex = this._exact[snap.ordinal] ?? null;
      const anchored =
        ex?.anchored ??
        (typeof snap.metagraphSnapshotCount === "number" ? snap.metagraphSnapshotCount : 0);
      fillBarSpec(this._specs[s], ex ? this._bytesByKey(ex) : null, this._laneOrder, anchored);
      this._bar.setBar(s, snap.ordinal, this._specs[s], this._pickFor(snap));
    }
    this._syncRibbonRows();
    this._rebuildTilePicks();
    this._syncPickables();
  }

  private _syncRibbonRows(): void {
    this._ribbons.setRow(0, 0, this._slotSnap[0] ? this._specs[0] : null, this._laneZOf);
    const hot = this.model.selectedSlot;
    if (hot > 0 && hot < SLOT_N && this._slotSnap[hot])
      this._ribbons.setRow(1, hot, this._specs[hot], this._laneZOf);
    else this._ribbons.clearRow(1);
  }

  /** The ribbon index a metagraph's band occupies in a row — mirrors the order Ribbons.setRow walks
   *  (one ribbon per band with bytes > 0 whose lane isn't hidden, in band order). −1 when absent. */
  private _ribbonIndexOf(slot: number, key: string): number {
    const spec = this._specs[slot];
    if (!spec || !spec.measured) return -1;
    let n = 0;
    for (let i = 0; i < spec.bandCount; i++) {
      const band = spec.bands[i];
      if (band.bytes <= 0) continue;
      if (band.key !== UNLISTED_KEY && this._laneHidden.get(band.key)) continue; // no sheet → no index
      if (band.key === key) return n;
      n++;
    }
    return -1;
  }

  /** Walks the lane tiles in the SAME order update() draws them, so instance id === pick index. */
  private _rebuildTilePicks(): void {
    const fn = this._tileResolver;
    if (!fn) {
      this._tilePicks.fill(null);
      return;
    }
    let mi = 0;
    for (const lane of this.model.lanes.values()) {
      if (this._laneHidden.get(lane.id)) continue;
      // `k` is the tile's index WITHIN ITS TICK — the resolver looks a snapshot up by
      // (metagraph, tick) and indexes that tick's own list. A lane's blocks are contiguous per
      // tick (anchorTiles pushes a tick's tiles together), so the counter resets on each new ts.
      let k = 0;
      let kTs = "";
      for (const b of lane.blocks) {
        if (mi >= META_TRAIL_MAX) break;
        if (b.ts !== kTs) { kTs = b.ts; k = 0; }
        this._tilePicks[mi] = b.filled ? fn(lane.id, b.ts, k) : null; // event-time
        if (b.filled) k++;
        mi++;
      }
    }
    for (let j = mi; j < META_TRAIL_MAX; j++) this._tilePicks[j] = null;
  }

  private _syncPickables(): void {
    this.pickables.length = 0;
    for (const o of this._bar.pickables) this.pickables.push(o);
    // Tiles only become raycast targets once a resolver can turn an instance id into a snapshot.
    if (this._tileResolver) this.pickables.push(this._metaTrailMesh);
  }

  // ── the currency gutter ──────────────────────────────────────────────────

  private _rebuildGutter(): void {
    if (this._gutterLabel) {
      this.group.remove(this._gutterLabel);
      this._gutterLabel.geometry.dispose();
      const old = this._gutterLabel.material as THREE.MeshBasicMaterial;
      old.map?.dispose();
      old.dispose();
      this._gutterLabel = null;
    }
    const id = this._committedLane != null ? this._laneOrder[this._committedLane] : null;
    if (!id) return;
    const meta = METAGRAPHS.find((m) => m.id === id);
    // Measured against an ABSOLUTE clock, not the visible window — a dormant token must not read
    // as "quiet right now" (spec §6.7). activityLine() owns the NO SIGNAL / NO CURRENCY wording.
    const text = activityLine(this._activity[id] ?? null, meta?.ticker ?? id, Date.now());
    // event-time: one canvas per filter/activity change
    const mesh = this._makeLabel(
      "",
      text,
      FLOOR_LABEL_X,
      FLOOR_Y.msnap,
      GUTTER_CZ + GUTTER_W / 2,
    );
    (mesh.material as THREE.MeshBasicMaterial).opacity = GUTTER_OP * this._fades.alpha;
    this.group.add(mesh);
    this._gutterLabel = mesh;
  }

  // ── frame ────────────────────────────────────────────────────────────────

  update(dt: number) {
    this.t += dt;

    // The lead row's honesty note eases in while the live tick's anchor count is still growing.
    this._formingW +=
      ((this.model.leadForming ? 1 : 0) - this._formingW) * Math.min(1, dt * FORMING_EASE);

    this._applyFloorAlpha();

    this._rails.update(dt);
    this._bar.update(dt);
    this._ribbons.update(dt);

    if (!this._latest) return;
    const k = Math.min(1, dt * 3);
    // The live hover previews the dim; the committed filter is the resting state.
    const dim = this._dimKey();
    const mf = dim !== "all" ? dim : null;

    // ── lane tiles on the metagraph-snapshot floor
    let mi = 0;
    for (const lane of this.model.lanes.values()) {
      if (this._laneHidden.get(lane.id)) continue;
      const laneOff = mf != null && lane.id !== mf;
      const laneColor = this._laneColor(lane.id);
      const cz = this._laneZ.get(lane.id) ?? lane.z;
      const hz = this._laneHZ.get(lane.id) ?? LANE_GAP_Z / 2;
      // anchorTiles() grids a tick's tiles against the fixed LANE_GAP_Z budget; rescale onto the
      // lane's LIVE Z span so a committed lane spreads over the floor it just took.
      const zScale = (2 * hz) / LANE_GAP_Z;
      for (const b of lane.blocks) {
        if (mi >= META_TRAIL_MAX) break;
        b.x += (LEAD_X - b.slot * SLOT_SP - b.x) * k;
        b.fade += (slotFade(b.slot) - b.fade) * k;
        _dummy.position.set(b.x + b.ox, FLOOR_Y.msnap, cz + b.oz * zScale);
        _dummy.rotation.set(-Math.PI / 2, 0, 0);
        _dummy.scale.set(b.size, b.size, b.size * (b.filled ? 1 : 0.18));
        _dummy.updateMatrix();
        this._metaTrailMesh.setMatrixAt(mi, _dummy.matrix);
        const hot = this.model.isRowHot(laneOff, b.slot);
        // Unfilled (anonymous/ghost) tiles keep their fixed fraction of the tuned filled level.
        const bright =
          (hot
            ? Math.max(b.fade, 0.9) * (b.filled ? this.tiles.hot : this.tiles.hot * 0.15)
            : b.fade * (b.filled ? this.tiles.rest : this.tiles.rest * 0.17)) *
          (laneOff ? this.tiles.dim : 1) *
          this._fades.alpha;
        this._metaTrailMesh.setColorAt(mi, _col.copy(laneColor).multiplyScalar(bright));
        mi++;
      }
    }
    const prevMeta = this._metaLastDrawn || 0;
    if (mi < prevMeta) {
      _dummy.scale.setScalar(0);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      for (let j = mi; j < prevMeta; j++) this._metaTrailMesh.setMatrixAt(j, _dummy.matrix);
    }
    this._metaLastDrawn = mi;
    this._metaTrailMesh.instanceMatrix.needsUpdate = true;
    if (this._metaTrailMesh.instanceColor) this._metaTrailMesh.instanceColor.needsUpdate = true;

    // ── anchor pulses ride the LEAD row's ribbons (row 0), tile → band.
    // Ribbons.centreLine indexes quads[min(i, count-1)] — quads[-1] on an empty row — so every
    // spawn AND every advance is guarded on ribbonCount() > 0.
    const nRib = this._ribbons.ribbonCount(0);
    while (this._queue.length && this._queue[0].dueAt <= this.t && this._pulses.length < PULSE_MAX) {
      const { id } = this._queue.shift()!;
      if (nRib <= 0) continue;
      const idx = this._ribbonIndexOf(0, id);
      if (idx < 0 || idx >= nRib) continue;
      this._pulses.push({
        idx,
        t: 0,
        speed: 0.85 + Math.random() * 0.25,
        color: this.sceneColors[id] ?? this._core,
      }); // event-time
    }
    let i = 0;
    if (nRib > 0) {
      for (const p of this._pulses) {
        p.t += dt * p.speed;
        if (p.t >= 1 || p.idx >= nRib) continue;
        this._ribbons.centreLine(0, p.idx, p.t, _p);
        _dummy.position.copy(_p);
        _dummy.scale.setScalar(1);
        _dummy.quaternion.identity();
        _dummy.updateMatrix();
        this._pulseMesh.setMatrixAt(i, _dummy.matrix);
        this._pulseMesh.setColorAt(i, _col.set(p.color).multiplyScalar(this._fades.alpha));
        i++;
      }
    }
    if (i < this._pulses.length) {
      // In-place compaction — the old `.filter(…)` allocated a fresh array on any frame where a
      // pulse was skipped-but-alive (a stale ribbon index), not only when one expired. Drops
      // exactly what the filter dropped: the pulses that finished; a skipped live one is retried.
      let w = 0;
      for (let r = 0; r < this._pulses.length; r++) {
        const p = this._pulses[r];
        if (p.t >= 1) continue;
        this._pulses[w++] = p;
      }
      this._pulses.length = w;
    }
    const prevDrawn = this._lastDrawn || 0;
    if (i < prevDrawn) {
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      for (let j = i; j < prevDrawn; j++) this._pulseMesh.setMatrixAt(j, _dummy.matrix);
    }
    this._lastDrawn = i;
    this._pulseMesh.instanceMatrix.needsUpdate = true;
    if (this._pulseMesh.instanceColor) this._pulseMesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this._rails.dispose();
    this._bar.dispose();
    this._ribbons.dispose();
    for (const o of this.group.children.slice()) {
      this.group.remove(o);
      const obj = o as THREE.Mesh & { dispose?: () => void };
      obj.geometry?.dispose();
      const mat = obj.material as (THREE.Material & { map?: { dispose?: () => void } }) | undefined;
      mat?.map?.dispose?.();
      mat?.dispose?.();
      obj.dispose?.();
    }
    this.pickables = [];
  }
}
