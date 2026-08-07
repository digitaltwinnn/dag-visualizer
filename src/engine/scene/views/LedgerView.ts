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
// This class owns the SnapshotPlane instances (the reusable plane blueprint: glass + edge label
// + tray — objects/SnapshotPlane.ts), the metagraph-snapshot lane tiles and the anchor pulses;
// everything else is composed from the adapters.
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
  FLOOR_Y,
  PLANE_FIELD_HALF,
  LANE_HALF_Z,
  lanePlaneHalf,
  LEAD_X,
  TILE_LIFT,
  laneSpan,
  type RailGroup,
} from "../../domain/ledgerLayout";
import type { SceneColors } from "../../sceneColors";
import { LedgerModel, LANE_IDS, SLOT_SP, SLOT_N, LANE_GAP_Z, slotFade } from "../../domain/ledgerModel";
import { makeBarSpec, fillBarSpec, UNLISTED_KEY, type BarSpec } from "../../domain/ledgerBands";
import type { ContainerSpec } from "../../domain/ledgerRails";
import type {
  GlobalSnapshot,
  Anchor,
  PickDescriptor,
  SnapshotExact,
} from "@/src/data/types";
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers"; // shared display copy — floor labels = panel rows
import { ByteBar } from "../objects/ByteBar";
import { Ribbons } from "../objects/Ribbons";
import { SnapshotPlane, makeEdgeLabel, GLOBAL_PLANE_TUNE_DEFAULTS, META_PLANE_TUNE_DEFAULTS, type PlaneTune } from "../objects/SnapshotPlane";
import { FadeSet } from "../objects/FadeSet";
import type { SceneView } from "./SceneView";

const PULSE_MAX = 220;
const PULSE_STAGGER = 0.035;
const META_TRAIL_MAX = 1500;

/** The glass floors' footprint, and the X the edge-aligned labels read from. Module scope because
 *  the gutter label has to land on the SAME edge as the floor labels (it used to be derived from
 *  LEDGER.depth and floated ~9 units in front of the chamber). */
const FLOOR_W = 39.5;
const FLOOR_D = 44;
const FLOOR_CX = -13.25;
const FLOOR_LABEL_X = FLOOR_CX + FLOOR_W / 2 - 0.4;

/** The per-row GLOBAL SNAPSHOT ID labels at the global plane's screen-left edge (user,
 *  2026-08-07 — replaced the lead row's `forming…` note): every visible tick row is named by
 *  the ordinal it anchors, quieter than the plane label. */
const ORD_OP = 0.55;
const ORD_H = 0.78;
/** The label's text anchor — just outside the widest bar's screen-left end, reading inward. */
const ORD_Z = LANE_HALF_Z + 0.35;
/** Where the text visually ends (≈ the digits' extent) — the dotted anchor line starts here. */
const ORD_LINE_Z0 = ORD_Z - 2.1;

const _dummy = new THREE.Object3D();
const _ordSeen = new Set<number>(); // scratch for _syncOrdLabels (event-time)
const _col = new THREE.Color();
const _p = new THREE.Vector3();

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
}

// hot/rest user-tuned via ?tune, 2026-08-07 — the same levels as the byte bar's hot/rest.
export const TILE_TUNE_DEFAULTS: TileTune = { hot: 0.7, rest: 0.1 };

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

  private _colors: SceneColors;
  private _core: number;
  private readonly _coreCol = new THREE.Color();

  // ── floors (visual aid since 2026-08-06 — never pick SUBJECTS, but since 2026-08-07 they are
  // pick BLOCKERS: a normal surface swallows the ray, so a bar under the metagraph floor can't
  // be hovered/clicked through the glass — see Engine._pickAt's `userData.blocker` rule).
  // `minHalf` clamps the rim width on the narrow gutter piece so the band can't swallow the
  // whole plane.
  private _floorBlockers: THREE.Object3D[] = [];
  /** The plane blueprint instances: the global floor (main + gutter) and one per metagraph lane. */
  private _globalPlanes: SnapshotPlane[] = [];
  private _metaPlanes = new Map<string, SnapshotPlane>();

  // ── the adapters (spec §4.2–§4.4)
  private _bar: ByteBar;
  private _ribbons: Ribbons;
  /** Dev-only access for the ?tune panel (Engine.mountDevTune) — not part of the frame path. */
  get ribbons(): Ribbons { return this._ribbons; }
  get bar(): ByteBar { return this._bar; }
  /** The tiles' live-tunable look — read per frame by update()'s tile pass. */
  tiles: TileTune = { ...TILE_TUNE_DEFAULTS };
  /** The two plane-tune channels (user, 2026-08-07): the global plane and the metagraph planes
   *  are the SAME blueprint tuned separately — read per frame by _applyFloorAlpha. */
  globalTune: PlaneTune = { ...GLOBAL_PLANE_TUNE_DEFAULTS };
  metaTune: PlaneTune = { ...META_PLANE_TUNE_DEFAULTS };

  // ── the lane field (construction-time; never reallocated per frame) — the SHARED roster
  // (ledgerModel.LANE_IDS): every listed metagraph plus the "unknown" lane at the screen-left end.
  private readonly _laneOrder: string[] = [...LANE_IDS];
  private readonly _laneZ = new Map<string, number>();
  private readonly _laneHZ = new Map<string, number>();
  /** Ribbons' lane resolver. The lane field is FIXED now (user reversal 2026-08-07 — a filter
   *  dims, it never hides/moves lanes), so every roster key resolves. */
  private readonly _laneZOf = (key: string): number | null => this._laneZ.get(key) ?? null;

  // ── per-slot bar specs + the snapshot each slot stands for
  private readonly _specs: BarSpec[] = [];
  private readonly _slotSnap: (GlobalSnapshot | null)[] = [];
  private readonly _byOrd = new Map<number, GlobalSnapshot>();
  private readonly _byTs = new Map<string, GlobalSnapshot>();
  // The last setData inputs — setExact re-runs the model with them so a landing exact read
  // fills the unknown lane's tiles without waiting for the next tick/anchor event.
  private _lastSnaps: GlobalSnapshot[] | null = null;
  private _lastGetAnchor: ((ts: string) => Anchor | null) | null = null;
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

  // ── the lead row's honesty label: the newest tick's anchor count is still growing
  /** ordinal → its row label + the dotted anchor line tying it to the row's actual bar
   *  (recycled by ordinal as slots shift). */
  private _ordLabels = new Map<number, { mesh: THREE.Mesh; line: THREE.Line }>();

  // ── fades (the ledger's stage light went with the layer navigation, 2026-08-06 — nothing
  // committable is left for a spot to dramatise)
  private _fades = new FadeSet();

  constructor(
    scene: THREE.Scene,
    colors: SceneColors,
    sceneColors: Record<string, number>,
  ) {
    this._colors = colors;
    this._core = colors.core;
    this._coreCol.setHex(colors.core);
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
    this._floorBlockers.length = 0;
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

    this._bar = new ByteBar(colors, sceneColors);
    this._ribbons = new Ribbons(colors, sceneColors);
    this.group.add(this._bar.group, this._ribbons.group);

    this._buildMetaTrail();
    this._buildPulses();
    this._syncPickables();
  }

  // ── build ────────────────────────────────────────────────────────────────

  private _buildMetaTrail() {
    // SOLID chips, not additive glow (user, 2026-08-07: the opacity-faded additive trail read
    // as fuzzy): normal blending + depth writes make each tile a crisp little block whose
    // BRIGHTNESS (instance colour) carries the recency fade — the bloom pass still lights the
    // hot row, so the lead keeps its glow while the trail reads matte.
    this._metaTrailMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 0.35),
      new THREE.MeshBasicMaterial({}),
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
    const cx = FLOOR_CX;
    const lx = FLOOR_LABEL_X;
    // Every storey surface is the SAME blueprint (objects/SnapshotPlane.ts — glass + edge label
    // + tray), positioned per instance. The GLOBAL floor is ONE whole plane (+ its reserved
    // $DAG-blocks gutter beyond the seam, label-less) — the only place the metagraphs come
    // together. The UPPER storey is one narrow plane PER METAGRAPH over its lane (user,
    // 2026-08-07), gapped, each named by its ticker. Independence made literal.
    // The global plane sits RIGHT beneath the metagraph planes: the SAME symmetric field extent
    // (±PLANE_FIELD_HALF, centred on the lane field — user 2026-08-07; the old label-margin
    // plane read skewed, and the reserved gutter strip went with it).
    const gl = LEDGER_LAYERS.find((l) => l.id === "gl0");
    this._globalPlanes.push(
      new SnapshotPlane(this.group, this._colors, {
        w: W, d: 2 * PLANE_FIELD_HALF, y: FLOOR_Y.gl0, cx, cz: 0,
        label: { text: gl?.name ?? "gl0", x: lx, z: PLANE_FIELD_HALF - 0.12 },
      }),
    );
    const n = this._laneOrder.length;
    const hz = lanePlaneHalf(n);
    for (let i = 0; i < n; i++) {
      const key = this._laneOrder[i];
      const meta = METAGRAPHS.find((m) => m.id === key);
      const cz = laneSpan(i, n).cz;
      // (The collective "Metagraph snapshots" label went with the shared floor — each plane
      // names itself, CENTRED on its own width; the explorer names the group.)
      this._metaPlanes.set(key, new SnapshotPlane(this.group, this._colors, {
        w: W, d: hz * 2, y: FLOOR_Y.msnap, cx, cz,
        label: { text: meta?.ticker ?? "unlisted", x: lx, z: cz, height: 0.62, align: "center" },
      }));
    }
    for (const p of [...this._globalPlanes, ...this._metaPlanes.values()]) {
      this._floorBlockers.push(p.fill);
      if (p.label) this._fades.register(p.label.material as THREE.MeshBasicMaterial, 1);
    }

  }

  // ── view alpha / highlight ───────────────────────────────────────────────

  setViewAlpha(a: number): void {
    this._fades.apply(a);
    this._bar.setAlpha(a);
    this._ribbons.setAlpha(a);
    // group.visible is owned SOLELY by the Engine — a view fades, it never hides itself.
  }

  private _applyFloorAlpha(): void {
    // Each plane applies ITS tune channel (the global floor vs the metagraph planes — same
    // blueprint, two knobs; user 2026-08-07). FLOOR_D/2 is the shared drop-off reference so the
    // rim reads as one width everywhere; narrow pieces clamp it inside SnapshotPlane.
    const a = this._fades.alpha;
    for (const p of this._globalPlanes) p.applyAlpha(this.globalTune, a, FLOOR_D / 2);
    for (const p of this._metaPlanes.values()) p.applyAlpha(this.metaTune, a, FLOOR_D / 2);
    for (const o of this._ordLabels.values()) {
      (o.mesh.material as THREE.MeshBasicMaterial).opacity = ORD_OP * a;
      // The anchor line whispers under its label (user, 2026-08-07 — "a bit more subtle").
      (o.line.material as THREE.LineDashedMaterial).opacity = ORD_OP * 0.45 * a;
    }
  }

  setSceneColors(map: Record<string, number>): void {
    this.sceneColors = map;
    this._laneColors.clear();
    this._bar.setSceneColors(map);
    this._ribbons.setSceneColors(map);
  }

  // ── the lane field ───────────────────────────────────────────────────────

  /** Construction-time only — the lane field is FIXED (user reversal 2026-08-07): a committed
   *  filter dims and flies the camera to the lane (Engine), it never moves geometry. */
  private _relayoutLaneField(): void {
    const n = this._laneOrder.length;
    for (let i = 0; i < n; i++) {
      const s = laneSpan(i, n);
      const key = this._laneOrder[i];
      this._laneZ.set(key, s.cz);
      // Tiles fit each lane's OWN PLANE (2026-08-07) — the slice minus the separating gap.
      this._laneHZ.set(key, lanePlaneHalf(n));
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

    // event-time: one ordinal index per tick (the trail carries ordinals, not snapshots).
    // Built BEFORE the model runs — the wrapped anchor resolver below needs the ts join.
    this._byOrd.clear();
    this._byTs.clear();
    for (const s of snaps) { this._byOrd.set(s.ordinal, s); this._byTs.set(s.timestamp, s); }

    // The UNKNOWN lane's counts (user, 2026-08-07): fold the EXACT read's unlistedCount into the
    // anchor aggregate as a pseudo-metagraph. Exact-only on purpose — the polled floor
    // (total − identified) is transiently high while a tick settles, and lane tiles never
    // shrink, so a floor-fed lane would show phantom snapshots. No exact read → no unknown
    // tiles for that tick (the same honesty rule as the byte bar's bands).
    this._lastSnaps = snaps;
    this._lastGetAnchor = getAnchor;
    const wrapped = (ts: string): Anchor | null => {
      const a = getAnchor(ts);
      const snap = this._byTs.get(ts);
      const u = snap ? this._exact[snap.ordinal]?.unlistedCount ?? 0 : 0;
      if (u <= 0) return a;
      const metaCounts = new Map(a?.metaCounts ?? []); // event-time
      metaCounts.set(UNLISTED_KEY, u);
      return a
        ? { fee: a.fee, count: a.count, metaIds: a.metaIds, metaCounts, touched: a.touched }
        : { fee: 0, count: u, metaIds: new Set([UNLISTED_KEY]), metaCounts, touched: 0 };
    };

    const changes = this.model.setData(snaps, wrapped);
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

  /** The exact per-ordinal byte reads — the ONLY source a bar's width may come from (spec §6.2),
   *  and since 2026-08-07 the only source of the unknown lane's tile counts too. */
  setExact(byOrdinal: Record<number, SnapshotExact>): void {
    this._exact = byOrdinal;
    // Re-run the model with the stored inputs so a landing read fills the unknown lane now
    // (setData rebuilds the slots itself); before any data, just rebuild the bars.
    if (this._lastSnaps && this._lastGetAnchor) this.setData(this._lastSnaps, this._lastGetAnchor);
    else this._rebuildAllSlots();
  }

  setTileResolver(fn: TilePickResolver | null): void {
    this._tileResolver = fn;
    this._rebuildTilePicks();
    this._syncPickables();
  }

  setContainers(group: RailGroup, specs: ContainerSpec[]): void {
    // event-time: a data rebuild. Each tray routes to ITS OWN plane by key ("dag" / metagraph
    // id) — the blueprint owns the tray glass, the chips stay Globe's shared InstancedMeshes.
    if (group === "dag") this._globalPlanes[0]?.setTray(specs[0] ?? null);
    else for (const [key, p] of this._metaPlanes) p.setTray(specs.find((s) => s.key === key) ?? null);
  }

  setSelected(ordinal: number | null) {
    this.model.setSelected(ordinal);
    this._bar.setSelected(this.model.selectedSlot);
    this._syncRibbonRows();
  }

  /** The COMMITTED network. Since the off-filter dim was removed entirely (user, 2026-08-07)
   *  this only GATES THE ANCHOR PULSES (the committed lane's pulses spawn, the rest stay
   *  quiet) — the lane field never moves, nothing dims, and the camera fly-to-lane is the
   *  Engine's ledgerNetwork resolver. */
  setFilter(filter: string) {
    this._filter = filter || "all"; // event-time
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
    this._syncOrdLabels();
    this._rebuildTilePicks();
    this._syncPickables();
  }

  /** One GLOBAL SNAPSHOT ID label per visible tick row, screen-left of the bars, each tied to
   *  its row's actual bar by a DOTTED anchor line (user, 2026-08-07). Keyed by ordinal so a
   *  label rides its row down the trail; one new canvas per tick (event-time — recycled labels
   *  only move, and the line end tracks the bar's live width as the exact read lands). */
  private _syncOrdLabels(): void {
    const seen = _ordSeen;
    seen.clear();
    const y = FLOOR_Y.gl0 + 0.06;
    for (let s = 0; s < SLOT_N; s++) {
      const snap = this._slotSnap[s];
      if (!snap) continue;
      seen.add(snap.ordinal);
      let o = this._ordLabels.get(snap.ordinal);
      if (!o) {
        // event-time: one canvas + one 2-point dashed line per new tick
        const mesh = makeEdgeLabel(this._colors, snap.ordinal.toLocaleString(), 0, FLOOR_Y.gl0, ORD_Z, ORD_H);
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        const lg = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, y, ORD_LINE_Z0),
          new THREE.Vector3(0, y, 0),
        ]);
        const lm = new THREE.LineDashedMaterial({
          color: this._core, transparent: true, opacity: 0,
          depthWrite: false, dashSize: 0.14, gapSize: 0.18,
        });
        const line = new THREE.Line(lg, lm);
        line.renderOrder = 2;
        o = { mesh, line };
        this._ordLabels.set(snap.ordinal, o);
        this.group.add(mesh, line);
      }
      const x = LEAD_X - s * SLOT_SP;
      o.mesh.position.x = x;
      // The dotted anchor runs from the text's end to the row's bar edge (its live width/2 —
      // grows when the exact read lands); with no bar drawn it points at the row's centreline.
      const spec = this._specs[s];
      const barEdge = spec.measured && spec.bandCount > 0 ? spec.width / 2 + 0.18 : 0.3;
      const pos = o.line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, x, y, ORD_LINE_Z0);
      pos.setXYZ(1, x, y, Math.min(barEdge, ORD_LINE_Z0 - 0.2));
      pos.needsUpdate = true;
      o.line.computeLineDistances(); // event-time: dashed lines need distances after a move
    }
    for (const [ord, o] of this._ordLabels) {
      if (seen.has(ord)) continue;
      this.group.remove(o.mesh, o.line);
      o.mesh.geometry.dispose();
      const mat = o.mesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      o.line.geometry.dispose();
      (o.line.material as THREE.Material).dispose();
      this._ordLabels.delete(ord);
    }
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
    // The floor glass FIRST-CLASSES in the raycast as an occluder (userData.blocker): the Engine
    // returns null when the nearest hit is glass, so content under a floor never picks through it.
    for (const o of this._floorBlockers) this.pickables.push(o);
    for (const o of this._bar.pickables) this.pickables.push(o);
    // Tiles only become raycast targets once a resolver can turn an instance id into a snapshot.
    if (this._tileResolver) this.pickables.push(this._metaTrailMesh);
  }

  // ── frame ────────────────────────────────────────────────────────────────

  update(dt: number) {
    this.t += dt;

    this._applyFloorAlpha();

    this._bar.update(dt);
    this._ribbons.update(dt);

    if (!this._latest) return;
    const k = Math.min(1, dt * 3);

    // ── lane tiles on the metagraph-snapshot floor
    let mi = 0;
    for (const lane of this.model.lanes.values()) {
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
        // A tick this lane anchored NOTHING into draws NOTHING (user, 2026-08-07 — the small
        // dimmed placeholder block is gone; the model keeps the slot, the mesh zero-scales).
        if (!b.filled) {
          _dummy.position.set(0, 0, 0);
          _dummy.rotation.set(0, 0, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          this._metaTrailMesh.setMatrixAt(mi, _dummy.matrix);
          mi++;
          continue;
        }
        // Bottom just above the plane (user, 2026-08-07): the box is centred, so lift by half its
        // world height (geometry depth 0.35 × scale.z becomes the height under the -90° X spin).
        const tileH = 0.35 * b.size;
        _dummy.position.set(b.x + b.ox, FLOOR_Y.msnap + TILE_LIFT + tileH / 2, cz + b.oz * zScale);
        _dummy.rotation.set(-Math.PI / 2, 0, 0);
        _dummy.scale.set(b.size, b.size, b.size);
        _dummy.updateMatrix();
        this._metaTrailMesh.setMatrixAt(mi, _dummy.matrix);
        const hot = this.model.isRowHot(b.slot);
        // IDENTITY colour belongs to the front (lead) row and the hovered/selected one alone
        // (user, 2026-08-07) — every other snapshot rests in the neutral cyan tone.
        const ident =
          b.slot <= 0 || (this.model.selectedSlot > 0 && b.slot === this.model.selectedSlot);
        const bright =
          (hot ? Math.max(b.fade, 0.9) * this.tiles.hot : b.fade * this.tiles.rest) *
          this._fades.alpha;
        this._metaTrailMesh.setColorAt(mi, _col.copy(ident ? laneColor : this._coreCol).multiplyScalar(bright));
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
    for (const o of this._ordLabels.values()) {
      this.group.remove(o.mesh, o.line);
      o.mesh.geometry.dispose();
      const mat = o.mesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      o.line.geometry.dispose();
      (o.line.material as THREE.Material).dispose();
    }
    this._ordLabels.clear();
    for (const p of [...this._globalPlanes, ...this._metaPlanes.values()]) p.dispose();
    this._globalPlanes.length = 0;
    this._metaPlanes.clear();
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
