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
// + tray — objects/SnapshotPlane.ts) and the metagraph-snapshot lane tiles; everything else is
// composed from the adapters.
//
// RETIRED 2026-08-12 — the ANCHOR PULSES: one additive dot per newly anchored snapshot, riding its
// ribbon's centre line from the lane tile above down onto its band below (user: "sometimes i see an
// animation where a snapshot moves from top layer to bottom layer, kinda like in hyper view, but not
// always — we can remove that animation here completely"). Two reasons it had to go rather than be
// tuned. It fired only when a lane's anchor count GREW, so the chamber twitched on an interval the
// user can't predict and can't attribute — the one motion here that answers neither a gesture nor a
// steady clock. And it duplicated a statement the geometry already makes: the RIBBON is the anchor,
// permanently drawn from tile to band, so a dot re-tracing that same curve says nothing the sheet
// under it isn't saying. Don't rebuild it; the travelling-packet idiom belongs to geo's arcs, where
// the path is otherwise invisible. `Ribbons.centreLine`/`ribbonCount` and `LedgerModel`'s
// `TickChange` seam went with it — they existed for nothing else.
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
import { LedgerModel, LANE_IDS, SLOT_SP, SLOT_N, HORIZON_X, HORIZON_SPAN, horizonAt } from "../../domain/ledgerModel";
import { makeBarSpec, fillBarSpec, UNLISTED_KEY, type BarSpec } from "../../domain/ledgerBands";
import type { ContainerSpec } from "../../domain/ledgerRails";
import type {
  GlobalSnapshot,
  Anchor,
  PickDescriptor,
  SnapshotExact,
} from "@/src/data/types";
import { metaSnapHoverKey } from "@/src/data/types";
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers"; // shared display copy — floor labels = panel rows
import { ByteBar } from "../objects/ByteBar";
import { snapBright, snapFocusOf, focusWeightOf, emphasisK } from "../../domain/dimModel";
import { Ribbons } from "../objects/Ribbons";
import { SnapshotPlane, makeEdgeLabel, GLOBAL_PLANE_TUNE_DEFAULTS, META_PLANE_TUNE_DEFAULTS, type PlaneTune } from "../objects/SnapshotPlane";
import { TrailRewind } from "../objects/TrailRewind";
import { FadeSet } from "../objects/FadeSet";
import type { SceneView } from "./SceneView";
import type { TuneSchema } from "../../tune";

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
/** The committed lane's plane edge-fill multiplier (its plane leads with its snapshots). */
const LANE_FILL_BOOST = 3;
const ORD_H = 0.78;
/** The label's text anchor — just outside the widest bar's screen-left end, reading inward. */
const ORD_Z = LANE_HALF_Z + 0.35;
/** Where the text visually ends (≈ the digits' extent) — the dotted anchor line starts here. */
const ORD_LINE_Z0 = ORD_Z - 2.1;

const _dummy = new THREE.Object3D();
const _ordSeen = new Set<number>(); // scratch for _syncOrdLabels (event-time)
const _col = new THREE.Color();

/** Resolves a lane tile to the metagraph snapshot it stands for. A tile the polled buffer no longer
 *  knows returns null — it stays DRAWN but is left out of `pickables` (the anonymous tile, §6.1). */
export type TilePickResolver = (metaId: string, tickTs: string, k: number) => PickDescriptor | null;

/** The live-tunable metagraph-snapshot TILE look. `rest` is the resting brightness MULTIPLIER on
 *  the tile's identity colour — the one number the tiles keep of their own, because the byte bar's
 *  matching `rest` is an opacity and the two are different quantities. Everything above rest is the
 *  shared snapshot vocabulary (domain/dimModel.ts · snapBright): a snapshot is DATA, so its
 *  off-filter dim, focus boost and dim-back are the ledger row's knobs — the same ones the node
 *  chips in the trays answer to. */
export interface TileTune {
  rest: number; // a resting filled tile
}

// rest user-tuned via ?tune, 2026-08-07. (`hot` retired 2026-08-11 — it was exactly the ledger
// row's `boost`, and a snapshot is data, so it takes the node's focus knob instead.)
export const TILE_TUNE_DEFAULTS: TileTune = { rest: 0.1 };

/** The `?tune` knob ranges (contract: src/engine/tune.ts), colocated with the numbers they bound. */
export const TILE_TUNE_SCHEMA: TuneSchema<TileTune> = {
  rest: { min: 0, max: 2, step: 0.05 },
};

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

  // ── the currency gutter (spec §4.5/§6.7)

  // ── the lead row's honesty label: the newest tick's anchor count is still growing
  /** ordinal → its row label + the dotted anchor line tying it to the row's actual bar
   *  (recycled by ordinal as slots shift; `slot` feeds the rewind's front fade). */
  private _ordLabels = new Map<number, { mesh: THREE.Mesh; line: THREE.Line; slot: number }>();
  /** The labels+lines ride the trail rewind as one group. */
  private _ordGroup = new THREE.Group();
  /** The TRAIL REWIND (objects/TrailRewind.ts — the shown snapshot owns the front). Keyed to
   *  the COMMITTED/FOLLOWED snapshot (`setPinned`), never the hover — hover previews the hot
   *  row in place, only a click moves the trail. */
  private _rewind = new TrailRewind();
  /** Mirror of the rewind offset for the frame's read sites (updated once per update()). */
  private _trailOff = 0;
  private _slotOfOrd = (ordinal: number): number => this.model.slotOf(ordinal);
  /** The transient HOVER row (split from the committed selection, user 2026-08-07): previews at the
   *  GROUP focus tier without demoting the active row. */
  private _hoverOrd: number | null = null;
  private _hoverSlot = -1;
  /** ONE hovered metagraph snapshot, as `metaSnapHoverKey(metaId, ordinal)` — the tile-level hover
   *  (user, 2026-08-09). Separate from `_hoverOrd`, which is a whole TICK ROW: hovering one
   *  snapshot must light its own tile, not every sibling that anchored into the same tick.
   *  `_hoverTile` is the instance index it resolves to, so the frame body compares integers. */
  private _hoverMetaKey: string | null = null;
  private _hoverTile = -1;
  /** Filter-chip / metagraph-row HOVER — previews the colored network dim at commit strength. */
  private _hoverNet: string | null = null;

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
    this.group.add(this._bar.group, this._ribbons.group, this._ordGroup);

    this._buildMetaTrail();
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
        label: { text: gl?.name ?? "gl0", x: lx, z: 0, align: "center" },
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
        label: { text: meta?.ticker ?? UNLISTED_KEY, x: lx, z: cz, height: 0.62, align: "center" },
      }));
    }
    for (const p of [...this._globalPlanes, ...this._metaPlanes.values()]) {
      this._floorBlockers.push(p.fill);
      if (p.label) this._fades.register(p.label.material as THREE.MeshBasicMaterial, 1);
      // Every storey dissolves into the SAME horizon, so the chamber reads as continuing into
      // history rather than stopping at a lit back edge (user, 2026-08-09). The trays don't —
      // they sit at the front, where an end is honest.
      p.setHorizon(HORIZON_X, HORIZON_SPAN);
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
    // The committed (or hover-previewed) network's OWN plane glows a step brighter — the
    // plane-level twin of the colored dim (user, 2026-08-07).
    const netKey = this._netDimKey();
    for (const [key, p] of this._metaPlanes)
      p.applyAlpha(this.metaTune, a, FLOOR_D / 2, key === netKey ? LANE_FILL_BOOST : 1);
    for (const o of this._ordLabels.values()) {
      const ox = LEAD_X - o.slot * SLOT_SP + this._trailOff;
      // Both boundaries at once: the rewind's front dissolve and the horizon's — no instrument
      // may float on glass that has already faded out (user, 2026-08-09).
      const front = this._rewind.fadeAtX(ox) * horizonAt(ox);
      (o.mesh.material as THREE.MeshBasicMaterial).opacity = ORD_OP * front * a;
      // The anchor line whispers under its label (user, 2026-08-07 — "a bit more subtle").
      (o.line.material as THREE.LineDashedMaterial).opacity = ORD_OP * 0.45 * front * a;
    }
  }

  setSceneColors(map: Record<string, number>): void {
    this.sceneColors = map;
    this._laneColors.clear();
    this._bar.setSceneColors(map);
    this._ribbons.setSceneColors(map);
  }

  /** The SUBJECT CALLOUT's anchor in chamber-LOCAL coordinates: the LEAD slot of the named
   *  lane's plane, or the global floor's lead bar (`laneId: null`). The rewind brings a
   *  committed row to the lead position, so the lead IS where the pinned subject settles —
   *  pure layout data, no per-row tracking. False when the lane isn't in the field. */
  calloutAnchor(laneId: string | null, out: THREE.Vector3): boolean {
    if (laneId === null) {
      out.set(LEAD_X, FLOOR_Y.gl0 + 0.3, 0);
      return true;
    }
    const z = this._laneZOf(laneId);
    if (z == null) return false;
    out.set(LEAD_X, FLOOR_Y.msnap + 0.3, z);
    return true;
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
    }
  }

  // ── data ─────────────────────────────────────────────────────────────────

  setData(snaps: GlobalSnapshot[], getAnchor: (ts: string) => Anchor | null) {
    // `globalSnapshots` is oldest→NEWEST, so the live tick is the LAST entry (LedgerModel.setData
    // reads the same end). Reading snaps[0] would pin _latest to the OLDEST tick, which never
    // changes while the buffer is below cap.
    const latest = snaps[snaps.length - 1];
    if (!latest) return;
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

    this.model.setData(snaps, wrapped);
    for (let s = 0; s < SLOT_N; s++) this._slotSnap[s] = null;
    if (this.model.tickOrdinal != null)
      this._slotSnap[0] = this._byOrd.get(this.model.tickOrdinal) ?? null;
    for (const tr of this.model.trail)
      if (tr.slot >= 0 && tr.slot < SLOT_N)
        this._slotSnap[tr.slot] = this._byOrd.get(tr.ordinal) ?? null;

    this._recomputeHoverSlot();
    this._rebuildAllSlots();
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
    this._syncRibbonRows();
  }

  /** The transient hover — the colored-dim PREVIEW tier (the committed row stays fully hot). */
  setHovered(ordinal: number | null) {
    this._hoverOrd = ordinal;
    this._recomputeHoverSlot();
    this._syncRibbonRows();
  }

  private _recomputeHoverSlot(): void {
    this._hoverSlot = this._hoverOrd != null ? this.model.slotOf(this._hoverOrd) : -1;
    this._bar.setHovered(this._hoverSlot);
  }

  /** The hovered METAGRAPH SNAPSHOT (`metaSnapHoverKey`) — lights exactly the one tile that stands
   *  for it, wherever it sits in the trail. The tile↔row pairing's scene end. */
  setHoveredMetaSnap(key: string | null) {
    this._hoverMetaKey = key; // event-time
    this._syncHoverTile();
  }

  /** Resolve the hovered snapshot to its INSTANCE INDEX over the pick table update() draws in
   *  lockstep with. Event-time only — on a hover change and on every pick-table rebuild, since a
   *  data refresh reshuffles the indices under a held hover. */
  private _syncHoverTile(): void {
    const key = this._hoverMetaKey;
    if (key == null) { this._hoverTile = -1; return; }
    for (let i = 0; i < META_TRAIL_MAX; i++) {
      const p = this._tilePicks[i];
      if (p != null && p.kind === "metaSnap" && metaSnapHoverKey(p.sel.metaId, p.sel.ordinal) === key) {
        this._hoverTile = i;
        return;
      }
    }
    this._hoverTile = -1;
  }

  /** The COMMITTED (clicked) or followed snapshot — the only thing the trail rewind tracks. */
  setPinned(ordinal: number | null) {
    this._rewind.setPinned(ordinal);
  }

  /** The COMMITTED network. It drives the COLOURED DIM (the other networks drop to their own hue at
   *  the ledger's `elem` strength, this network's own rows hold identity down the trail). What it
   *  deliberately does NOT do: move or hide any geometry. The camera's only answer is the shared
   *  `ledgerCommitTilt` (the per-lane fly-to was retired 2026-08-09). */
  setFilter(filter: string) {
    this._filter = filter || "all"; // event-time
    this._applyNetDim();
  }

  /** Filter-chip / metagraph-row hover: previews the colored dim at the SAME strength as a
   *  commit (the house hover rule); null falls back to the committed filter. */
  setHoverFilter(filter: string | null) {
    this._hoverNet = filter || null; // event-time
    this._applyNetDim();
  }

  /** The network the dim resolves against — the live hover wins, else the committed filter. */
  private _netDimKey(): string {
    return this._hoverNet ?? this._filter;
  }

  private _applyNetDim(): void {
    const d = this._netDimKey();
    // The other metagraphs' elements take the COLORED dim (identity hue at the ledger's `elem`):
    // ribbons + bands here, tiles in the per-frame pass, chips via the dim model's emissive.
    this._ribbons.setFilter(d);
    this._bar.setFilter(d);
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
      if (o) o.slot = s;
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
        o = { mesh, line, slot: s };
        this._ordLabels.set(snap.ordinal, o);
        this._ordGroup.add(mesh, line);
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
      this._ordGroup.remove(o.mesh, o.line);
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
    // Row 1 = the COMMITTED row (full strength); row 2 = the HOVER preview (colored dim).
    // Separate rows (2026-08-07): with a snapshot pinned, a hover needs its own sheet — the
    // active row keeps its ribbons regardless of hover, and the preview never goes missing.
    const hot = this.model.selectedSlot;
    if (hot > 0 && hot < SLOT_N && this._slotSnap[hot]) {
      this._ribbons.setRow(1, hot, this._specs[hot], this._laneZOf);
      this._ribbons.setRowFade(1, 1);
    } else this._ribbons.clearRow(1);
    const hov = this._hoverSlot;
    if (hov > 0 && hov < SLOT_N && hov !== hot && this._slotSnap[hov]) {
      this._ribbons.setRow(2, hov, this._specs[hov], this._laneZOf);
      // The hover ribbon IS the group tier — a hovered row is a preview of what a click would pin,
      // so it rides the same shared focus ranking every node loop uses.
      this._ribbons.setRowFade(2, focusWeightOf(false, true));
    } else this._ribbons.clearRow(2);
  }

  /** Walks the lane tiles in the SAME order update() draws them, so instance id === pick index. */
  private _rebuildTilePicks(): void {
    const fn = this._tileResolver;
    if (!fn) {
      this._tilePicks.fill(null);
      this._hoverTile = -1;
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
    // A held hover's tile index is only valid against THIS table.
    this._syncHoverTile();
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

    // ── the TRAIL REWIND (objects/TrailRewind.ts): the shown snapshot owns the front; rows
    // newer than it slide past the edge and dissolve. All scalar logic lives in the adapter.
    this._rewind.update(dt, this._slotOfOrd);
    this._trailOff = this._rewind.offset;
    const pinnedHold = this._rewind.holding;
    // Hoisted per frame (the tune hoist rule): the SELECTED row — the one that owns the focus — or -1.
    const pinSlot = this.model.selectedSlot;
    this._bar.setOffset(this._trailOff);
    // Pushed HERE, from the same read the lane tiles use, not once at select time: every new tick
    // re-slots the whole trail, so a slot handed over on the pin goes stale one row later — the
    // boost and the identity hue would sit on the row NEWER than the pin while the rewind parks
    // the pinned row at the lead, drawing the one row you asked for neutral and unboosted.
    this._bar.setSelected(pinSlot);
    this._ribbons.group.position.x = this._trailOff;
    this._ordGroup.position.x = this._trailOff;
    // The live lead's ribbon sheet fades out as it crosses the front (row 1 — the selected
    // row's sheet — lands exactly AT the front, so it never fades).
    this._ribbons.setRowFade(0, this._rewind.fadeAtX(LEAD_X + this._trailOff));

    this._applyFloorAlpha();

    this._bar.update(dt);
    // (no _ribbons.update: the sheet's only per-frame value is its opacity, and setViewAlpha —
    // called every frame — writes that directly now.)

    if (!this._latest) return;
    const k = Math.min(1, dt * 3);
    const ek = emphasisK(dt); // emphasis easing — hoisted once per frame (the tune hoist rule)

    // ── lane tiles on the metagraph-snapshot floor
    let mi = 0;
    // Hoisted per frame (the tune hoist rule): one read for every lane's every tile.
    const dimNet = this._netDimKey();
    const tileRest = this.tiles.rest;
    // A focus is a SELECTED row (pinned or live-followed — how it was reached is not what it is),
    // a hovered row or a hovered tile. The bare lead is none of them: with nothing selected the
    // chamber is simply running, and stepping the whole trail back against a row it advanced onto
    // by itself would make `back` a second `rest`.
    const anyFocus = this._hoverSlot >= 0 || this._hoverTile >= 0 || pinSlot >= 0;
    for (const lane of this.model.lanes.values()) {
      const laneColor = this._laneColor(lane.id);
      const cz = this._laneZ.get(lane.id) ?? lane.z;
      for (const b of lane.blocks) {
        if (mi >= META_TRAIL_MAX) break;
        if (pinnedHold) b.x = LEAD_X - b.slot * SLOT_SP;
        else b.x += (LEAD_X - b.slot * SLOT_SP - b.x) * k;
        // No depth fade (user, 2026-08-07): every trail row eases to FULL brightness — recency
        // reads from position + the ordinal labels, not a gradient into the dark.
        b.fade += (1 - b.fade) * k;
        // The two POSITION dissolves — the rewind's front edge and the horizon at the far end.
        // A row that has finished either one is no longer IN the chamber, so it must stop
        // existing rather than linger (user, 2026-08-11): these tiles are opaque and depth-writing,
        // so a zero-brightness one is a BLACK BLOCK sitting in front of the active row, occluding
        // the ribbons and glass behind it — and the raycaster ignores `visible`, so it would still
        // eat a click. Zero-scaling is the same answer an unfilled tick already gets.
        const wx = b.x + this._trailOff;
        const edge = this._rewind.fadeAtX(wx) * horizonAt(wx);
        // A tick this lane anchored NOTHING into draws NOTHING (user, 2026-08-07 — the small
        // dimmed placeholder block is gone; the model keeps the slot, the mesh zero-scales).
        if (!b.filled || edge <= 0) {
          _dummy.position.set(0, 0, 0);
          _dummy.rotation.set(0, 0, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          this._metaTrailMesh.setMatrixAt(mi, _dummy.matrix);
          b.bright = 0; // a slot that comes back eases up from dark, not from a stale row
          mi++;
          continue;
        }
        // Bottom just above the plane (user, 2026-08-07): the box is centred, so lift by half its
        // world height (geometry depth 0.35 × scale.z becomes the height under the -90° X spin).
        const tileH = 0.35 * b.size;
        _dummy.position.set(wx + b.ox, FLOOR_Y.msnap + TILE_LIFT + tileH / 2, cz + b.oz);
        _dummy.rotation.set(-Math.PI / 2, 0, 0);
        _dummy.scale.set(b.size, b.size, b.size);
        _dummy.updateMatrix();
        this._metaTrailMesh.setMatrixAt(mi, _dummy.matrix);
        const hot = this.model.isRowHot(b.slot);
        const hov = this._hoverSlot >= 0 && b.slot === this._hoverSlot;
        // The SELECTED row (see `anyFocus`) — pinned or live-followed, they read alike.
        const pinned = pinSlot >= 0 && b.slot === pinSlot;
        // THIS tile's own hover (user, 2026-08-09): the explorer/raw row for ONE snapshot lights
        // just its tile, not the whole tick row. Resolved to an instance index at event time
        // (_syncHoverTile), so the frame body is an integer compare.
        const hovTile = mi === this._hoverTile;
        const offNet = dimNet !== "all" && lane.id !== dimNet;
        const onNet = !hot && !hov && dimNet !== "all" && lane.id === dimNet;
        // COLOUR is the chamber's own independent reading: the ACTIVE row (lead/pinned), a hover
        // preview and the COMMITTED NETWORK's own tiles carry identity hue down the whole trail
        // (user, 2026-08-09), every other snapshot the neutral trail. BRIGHTNESS is the shared node
        // vocabulary — a snapshot is data, so it dims, boosts and steps back on exactly the knobs
        // the chips in the trays answer to.
        const ident = hot || hov || hovTile || onNet || b.slot <= 0;
        // The BOOST answers a deliberate focus only (user, 2026-08-11) — a hover, or an explicit
        // pin; the live lead is simply the shown row, which its front position and identity hue
        // already say. A hovered TILE is the subject itself, so it takes the primary weight
        // whatever the filter says. Every other focus here is the ROW's, and a row spans every
        // lane — under a filter it reaches the committed network's tile alone (`snapFocusOf`).
        const focus = hovTile ? 1 : snapFocusOf(pinned, hov, offNet);
        // `back` is the ROW's answer, so the focused row never steps back — its OFF-FILTER members
        // included (user, 2026-08-11). They take the dim and nothing else, which is exactly what
        // the RIBBON leaving this tile takes, so a ribbon and the two ends it connects now read at
        // one level; compounding dim × back left the endpoints near-black under their own ribbon.
        const rowFocus = pinned || hov;
        const brightT =
          snapBright(tileRest * b.fade, offNet, focus, anyFocus && !rowFocus)
          * edge * this._fades.alpha;
        // Emphasis EASES rather than snapping (dimModel.emphasisK). The state rides the BLOCK, next
        // to its two other eased fields — an instance-index buffer would hand a block's brightness
        // to its neighbour every tick, since a new tick shifts every block one slot along.
        const bright = (b.bright += (brightT - b.bright) * ek);
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
  }

  dispose() {
    for (const o of this._ordLabels.values()) {
      this._ordGroup.remove(o.mesh, o.line);
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
