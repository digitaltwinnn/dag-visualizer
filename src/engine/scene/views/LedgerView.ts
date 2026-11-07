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
import { METAGRAPHS } from "@/src/net/current";
import {
  LEDGER,
  FLOOR_CX,
  FLOOR_W,
  FLOOR_Y,
  PLANE_FIELD_HALF,
  LANE_HALF_Z,
  lanePlaneHalf,
  LEAD_X,
  TILE_LIFT,
  BAR_H,
  BAR_LIFT,
  laneSpan,
  type RailGroup,
} from "../../domain/ledgerLayout";
import { isLightGround, inkMix, inkPresence, labelInk, type SceneColors } from "../../sceneColors";
import {
  LedgerModel,
  LANE_IDS,
  SLOT_SP,
  SLOT_N,
  HORIZON_X,
  HORIZON_SPAN,
  horizonAt,
  liveEdgePhase,
  ROW_HALF_D,
  FRONT_INK_X,
  FRONT_RUN_X0,
  type LaneBlock,
} from "../../domain/ledgerModel";
import { forkSpread, referenceSegments, silentRun, type BlockRead } from "../../domain/blockBraid";
import { DATA_MARK, dataMarkCount, dataMarkHeight } from "../../domain/dataMark";
import { ENTRY_STAG, entryStep, entryTotal } from "../../domain/entryBeat";
import { makeBarSpec, fillBarSpec, UNLISTED_KEY, RIBBON_LANE_HALF, type BarSpec } from "../../domain/ledgerBands";
import type { ContainerSpec } from "../../domain/ledgerRails";
import type {
  GlobalSnapshot,
  Anchor,
  PickDescriptor,
  SnapshotExact,
} from "@/src/data/types";
import { metaSnapHoverKey } from "@/src/data/types";
import type { BlockWindow } from "@/src/data/blockWindow";
import type { ViewPolicy } from "../../domain/viewPolicy";
/** A register of the Snapshots view — named through the policy row that lists them, since scene/
 *  reaches nothing in the store, types included (`layerBoundaries.test.ts`). */
type LedgerRegister = ViewPolicy["registers"][number];
import { relativeAge } from "@/src/util/relativeAge"; // the app's one short span — "1,364 snapshots · 4h"
import { fmtKB } from "@/src/util/format"; // the HUD's own size vocabulary — one formatter, so scene and cards can't disagree
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers"; // shared display copy — floor labels = panel rows
import { ByteBar, SEED_W } from "../objects/ByteBar";
import { LiveEdge } from "../objects/LiveEdge";
import { snapBright, snapFocusOf, focusWeightOf, emphasisK } from "../../domain/dimModel";
import { Ribbons, type AnchorLine } from "../objects/Ribbons";
import { SnapshotPlane, makeEdgeLabel, retintEdgeLabel, GLOBAL_PLANE_LOOK, META_PLANE_LOOK } from "../objects/SnapshotPlane";
import { TrailRewind } from "../objects/TrailRewind";
import type { StageLight } from "../objects/StageLight";
import { STAGE_LIGHTS } from "../../domain/stageLight";
import { globalPick } from "../../domain/pickActions";
import { FadeSet } from "../objects/FadeSet";
import { BlockTier, type BlockItem } from "../objects/BlockTier";
import { SilentStretch, type StretchItem } from "../objects/SilentStretch";
import type { SceneView } from "./SceneView";
import { joinBloom, inMarkPass } from "../SceneContext";

/** The lane-tile instance budget.
 *
 *  ⚠️ IT IS SIZED PER SLOT, SO IT SCALES WITH THE TRAIL'S CAPACITY (review find, 2026-09-15). 1500
 *  was sized when the trail held exactly SLOT_N slots; since the reach landed it holds `trailCap`,
 *  which grows with how far back the reader has gone and tops out at the retained buffer — about
 *  61 slots. The budget did not follow, and the overflow `break` below is LANE-MAJOR: it truncates
 *  whole lanes rather than far rows, so a busy first lane could starve the later ones (the unlisted
 *  lane last of all) while the starved tiles were still on screen.
 *
 *  The arithmetic: a slot costs one placeholder per lane (13 today) plus one tile per anchor in
 *  that tick — `anchorTiles` is uncapped, so a 150-anchor burst is 150 tiles for that lane-slot.
 *  Measured load is ~16 anchors/tick (g.anchors ÷ g.ticks), i.e. ~29 per slot, so 61 slots ≈ 1,770;
 *  a sustained busy stretch at ~50 per slot ≈ 3,050. 6000 keeps roughly the same headroom over a
 *  busy load that 1500 gave the 9-slot trail, which is the property that actually mattered.
 *
 *  Cost is memory and two EVENT-TIME sweeps (`_resolveSelTile`, `_syncHoverTile`), not per-frame
 *  work — the draw loop walks `lane.blocks`, which the model bounds. The truncation MODE is
 *  unchanged from before the reach; only its reachability is restored to what the design assumed. */
const META_TRAIL_MAX = 6000;

/** The floors' X footprint lives in `domain/ledgerLayout` (the trail's front boundary is derived
 *  from that rim, so the domain has to own it). What stays here is the label X — the gutter label
 *  has to land on the SAME edge as the floor labels (it used to be derived from LEDGER.depth and
 *  floated ~9 units in front of the chamber) — and the glass shader's drop-off reference, which is
 *  a look, not an extent. */
const FLOOR_D = 44;
const FLOOR_LABEL_X = FLOOR_CX + FLOOR_W / 2 - 0.4;

/** The per-row GLOBAL SNAPSHOT ID labels at the global plane's screen-left edge (user,
 *  2026-08-07 — replaced the lead row's `forming…` note): every visible tick row is named by
 *  the ordinal it anchors, quieter than the plane label. */
const ORD_OP = 0.55;
/** The dotted anchor line's share of its label's opacity. It is a TIE, not a reading — the number
 *  at one end and the bar at the other are the two things being read, and the line only has to say
 *  which belongs to which. Dropped 0.45 -> 0.26 (user, 2026-08-18: "dim also the dotted lines
 *  attached to snapshot id/size"): at the resting pose eight rows of dashes ran the full width of
 *  the chamber on both sides, which is a lot of ink for a joining mark. ONE constant, because both
 *  columns tie their rows with the same recipe and must not drift. */
const ORD_LINE_MUL = 0.26;
/** The committed lane's plane edge-fill multiplier (its plane leads with its snapshots). */
const LANE_FILL_BOOST = 3;
/** The floor's edge-readout text height (user, 2026-09-01: "make the texts with the snapshot #
 *  and size on the plane of the global metagraph bigger"). ⚠️ IT DOES NOT MOVE ALONE. `makeEdgeLabel`
 *  draws a fixed-size glyph on a fixed canvas and scales the whole plane, so the digits' EXTENT is
 *  linear in this number — and `ORD_LINE_Z0` below is defined as where those digits end, because
 *  that is where the dotted tie starts. Raise one without the other and the tie is drawn straight
 *  through the text it is supposed to lead away from. */
const ORD_H = 1.02;
/** The label's text anchor — just outside the widest bar's screen-left end, reading inward. */
const ORD_Z = LANE_HALF_Z + 0.35;
/** Where the text visually ends (≈ the digits' extent) — the dotted anchor line starts here. */
const ORD_LINE_Z0 = ORD_Z - 2.75;
/** The SIZE column at the bars' other end (user, 2026-08-18: "the other visualization of a row
 *  represents size: can we use dotted lines on the right side of the plane to show the size in
 *  kB?"). It is the exact reading of what WIDTH encodes, exactly as the ordinal column is the
 *  exact reading of what POSITION encodes, so the row is legible from both ends.
 *
 *  It mirrors the left column's geometry but reads OUTWARD: the ink is pinned at the inner
 *  boundary and grows away from the chamber, because a bar clipped at the floor edge already
 *  reaches ±(LANE_HALF_Z − BAR_EDGE_MARGIN) and a value growing inward would land on top of it.
 *  Outward there is no bound, so a 1.2 MB tick states its size as calmly as a 4 KB one.
 *
 *  Only a MEASURED row gets a number (rule 10): reading down the column a GAP means "not read",
 *  never zero. A measured-empty seam honestly reads its own tiny size, because that is a real
 *  measurement. This is also the honest answer the clipped bar never had — a bar at the floor
 *  edge states its true size in words instead of a multiplier. */
const KB_Z0 = -ORD_LINE_Z0;

const _dummy = new THREE.Object3D();
const _ordSeen = new Set<number>(); // scratch for _syncOrdLabels (event-time)
const _col = new THREE.Color();
const _tileV = new THREE.Vector3(); // per-frame scratch: a tile's top as the frame draws it

/** Resolves a lane tile to the metagraph snapshot it stands for. A tile the polled buffer no longer
 *  knows returns null — it stays DRAWN but is left out of `pickables` (the anonymous tile, §6.1). */
export type TilePickResolver = (metaId: string, tickTs: string, k: number) => PickDescriptor | null;

/** The metagraph-snapshot TILE look. `rest` is the resting brightness MULTIPLIER on
 *  the tile's identity colour — the one number the tiles keep of their own, because the byte bar's
 *  matching `rest` is an opacity and the two are different quantities. Everything above rest is the
 *  shared snapshot vocabulary (domain/dimModel.ts · snapBright): a snapshot is DATA, so its
 *  off-filter dim, focus boost and dim-back are the ledger row's knobs — the same ones the node
 *  chips in the trays answer to. */
export interface TileLook {
  rest: number; // a resting filled tile
  // ── THE HUE FLOOR, on paper only. A tile cannot be transparent (opaque + depthWrite is what makes
  // it a pick blocker), so its presence is a lerp toward the glass it lies on — and a lerp that runs
  // all the way to the backdrop arrives with no hue left. That is the neutral trail reading as blank
  // lozenges (user, 2026-08-28: "the snapshots in the trail are white"). The floor is how far a
  // de-emphasized tile is allowed to thin before it stops being a MARK: the emphasis term is mapped
  // into [ink, 1], so a resting tile still states its tint on the glass while the span above it keeps
  // its order. Applied to the EMPHASIS alone — the horizon, front and entry ramps are geometry and a
  // fully dissolved row still zero-scales.
  ink: number;
  // Sub-pass input × for the selective paper halo (SceneContext.inMarkPass) — the bar's twin
  // (ByteBar's BarLook.halo carries the same note): raised only while the mark pass renders, so
  // the visible tile never changes.
  halo: number;
}

// rest user-tuned live, 2026-08-07. (`hot` retired 2026-08-11 — it was exactly the ledger
// row's `boost`, and a snapshot is data, so it takes the node's focus knob instead.)
export const TILE_LOOK: Readonly<TileLook> = { rest: 0.1, ink: 0.3, halo: 2.5 };

/** THE REGISTER'S CARGO — the one keyed map for what the chamber draws per register (spec "Rules":
 *  the places that differ by register answer through one keyed map, never a fall-through). A new
 *  register is a compile error here. Everything not named stays the chamber's in both: the floor,
 *  the planes, the bars, the tiles, the ribbons, the labels and the trail itself.
 *  - `blocks`: the block tier and the silent stretches draw, and the blocks pick.
 *  - `liveEdge`: whether the front can hold a FORMING tick. The Blocks trail is block-bearing
 *    ticks only, each already sealed, so its newest row is never in flight; its front says the live
 *    edge's silence instead (the FRONT RUN, `_rebuildBlockTier`).
 *  - `anchors`: how a metagraph snapshot is tied to its tick — the tapering SHEETS, whose width is
 *    the bytes it carried, or the hairline LINES, one per snapshot that carries a block (user,
 *    design round D1: size is irrelevant to the blocks, and the sheets were noise there).
 *  - `bareTiles`: whether a metagraph snapshot carrying no block is drawn (and picked) at all.
 *  - `dataMarks`: whether each tile whose exact read says it carried DATA BLOCKS wears a mark on its
 *    top, its height the count of data updates (`domain/dataMark.ts`; the Data blocks register, D6).
 *    Data blocks have no parents, so there is no braid and no link: the register is the Snapshots
 *    furniture as it stands — the same source, ribbons, tiles, bands and live edge — plus the marks. */
const REGISTER_CARGO: Record<LedgerRegister, { blocks: boolean; liveEdge: boolean; anchors: "sheets" | "lines"; bareTiles: boolean; dataMarks: boolean }> = {
  snapshots: { blocks: false, liveEdge: true, anchors: "sheets", bareTiles: true, dataMarks: false },
  blocks: { blocks: true, liveEdge: false, anchors: "lines", bareTiles: false, dataMarks: false },
  data: { blocks: false, liveEdge: true, anchors: "sheets", bareTiles: true, dataMarks: true },
};
/** A data mark's brightness over its tile's: a footnote on the tile, but one that must read on it. */
const DATA_MARK_GAIN = 2.2;

/** A block's edge above the floor (a DAG block) and on a tile (a token block — a tile is 0.48 at most). */
const DAG_BLOCK = 0.62;
const TOKEN_BLOCK = 0.36;
/** THE DAG BRAID OPENS VERTICALLY over the floor's centre line (user, design round D8: "no horizontal
 *  space … use the height instead"): its main chain runs along the trail at z = the floor's centre and
 *  y = the middle of the band between the bars' top face and the metagraph planes; the window's
 *  widest fork fills that band, above and below. Both bounds are layout data (`FLOOR_Y`, the bar's
 *  `BAR_LIFT + BAR_H`), each pulled in by a block's edge so a block at the fork's reach never touches
 *  a bar or a plane's tile. */
const BRAID_LO = FLOOR_Y.gl0 + BAR_LIFT + BAR_H + DAG_BLOCK;
const BRAID_HI = FLOOR_Y.msnap - DAG_BLOCK;
const BRAID_Y = (BRAID_LO + BRAID_HI) / 2;
const BRAID_HALF = (BRAID_HI - BRAID_LO) / 2;
/** Blocks that share a tick and a place step aside along the trail by this much, alternately. */
const BLOCK_STEP = 0.7;
/** A token block's footprint on its tile, as fractions of the tile: its edge (`TOKEN_ON_TILE` of the
 *  tile's), and how far a block may step off the tile's centre (`TOKEN_NUDGE` of the tile's half) —
 *  across by its sibling fan, along by its turn on the tile. 0.6/2 + 0.3/2 < 1/2, so a block never
 *  leaves its tile. */
const TOKEN_ON_TILE = 0.6;
const TOKEN_NUDGE = 0.3;
/** A silent run states its length in words only past this many snapshots (a short gap is just a gap). */
const STRETCH_WORDS_MIN = 200;
/** The tile mesh's own depth (the BoxGeometry's z, which becomes height under the -90° X spin). */
const TILE_D = 0.35;

// The view-entry drop's shape (see the VIEW-ENTRY DROP note in the class): fall height and
// per-slot timing. The TOTAL is derived so _entryT in [0,1] maps onto real seconds.
const ENTRY_H = 6.5;
// The fall and the stagger live in `domain/entryBeat.ts` (2026-10-24) — the Geography base rings
// drop on the same beat, so the numbers have one home.
const ENTRY_TOTAL = entryTotal(SLOT_N);

export class LedgerView implements SceneView {
  group: THREE.Group;
  pickables: THREE.Object3D[];
  sceneColors: Record<string, number>;

  private model = new LedgerModel();
  private t: number;
  private _latest: GlobalSnapshot | null;
  /** Scratch for `_syncThreads` — event-time only, so one array is reused rather than rebuilt. */
  private _threadSpecs: { slot: number; spec: BarSpec | null }[] = [];
  /** Bound once (rule 5: no per-frame closure allocation) — every ramp a thread must answer.
   *
   *  ⚠️ THE ENTRY TERMS ARE NOT OPTIONAL (user, 2026-09-01: the hairlines "should appear like the
   *  other objects, currently it's already there the moment the scene is still building up"). The
   *  first cut carried only the rewind boundary and the view alpha, so a thread drew at full weight
   *  over a chamber that had not arrived yet — the one element in the view not riding the entry.
   *  Both terms are needed and they are different: `_entryFade[slot]` is the PER-ROW stagger each
   *  band and tile answers, so a thread lands with the row it belongs to rather than with the view;
   *  `_entryRib` is the ribbons' own later, steeper curve, which is what keeps the relation layer
   *  from arriving before the things it relates. */
  private _threadFadeOf = (slot: number): number => {
    const entryRow = this._entryT < 1 && slot >= 0 && slot < SLOT_N ? this._entryFade[slot] : 1;
    return this._rewind.fadeAtX(LEAD_X - slot * SLOT_SP + this._trailOff)
      * horizonAt(LEAD_X - slot * SLOT_SP + this._trailOff)
      * entryRow * this._entryRib * this._fades.alpha;
  };
  /** The ribbons' entry curve, hoisted per frame so the bound thread fade can read it. */
  private _entryRib = 1;
  /** The COMMITTED network — the only thing that may move geometry (the lane field, the gutter). */
  private _filter: string;
  /** The HOVERED network, a pure preview that overrides the committed one for DIMMING only. */

  private _colors: SceneColors;
  /** GROUND, hoisted at event time — the tile loop and the label pass read a boolean. */
  private _paper: boolean;
  private _core: number;
  private readonly _coreCol = new THREE.Color();

  // ── floors (visual aid since 2026-08-06 — never pick SUBJECTS, but since 2026-08-07 they are
  // pick BLOCKERS: a normal surface swallows the ray, so a bar under the metagraph floor can't
  // be hovered/clicked through the glass — see Picking's `userData.blocker` rule).
  // `minHalf` clamps the rim width on the narrow gutter piece so the band can't swallow the
  // whole plane.
  private _floorBlockers: THREE.Object3D[] = [];
  /** The plane blueprint instances: the global floor (main + gutter) and one per metagraph lane. */
  private _globalPlanes: SnapshotPlane[] = [];
  private _metaPlanes = new Map<string, SnapshotPlane>();

  // ── the adapters (spec §4.2–§4.4)
  private _bar: ByteBar;
  private _live: LiveEdge;
  private _ribbons: Ribbons;

  // ── the lane field (construction-time; never reallocated per frame) — the SHARED roster
  // (ledgerModel.LANE_IDS): every listed metagraph plus the "unknown" lane at the screen-left end.
  private readonly _laneOrder: string[] = [...LANE_IDS];
  private readonly _laneZ = new Map<string, number>();
  /** Ribbons' lane resolver. The lane field is FIXED now (user reversal 2026-08-07 — a filter
   *  dims, it never hides/moves lanes), so every roster key resolves. */
  private readonly _laneZOf = (key: string): number | null => this._laneZ.get(key) ?? null;
  /** Ribbons' TOP-EDGE half-width resolver, the `_laneZOf` pattern (a stable arrow + a slot field
   *  written before each setRow, so the event-time sync allocates no closures). The sheet's top
   *  leaves the TILES, not the plane (user, 2026-08-30: full lane width "while the metagraph
   *  snapshots are smaller") — the tile grid's own measured z-extent from the model's blocks,
   *  layout data exactly as the bottom edge reads the band's z0/z1. A lane whose tiles aren't
   *  knowable for the slot (no exact read yet) answers the lane-cell fallback, the old look. */
  private _ribbonTopSlot = 0;
  private readonly _topHalfOf = (key: string): number => {
    const lane = this.model.lanes.get(key);
    let h = 0;
    if (lane) {
      for (const b of lane.blocks) {
        if (b.slot === this._ribbonTopSlot && b.filled) h = Math.max(h, Math.abs(b.oz) + b.size / 2);
      }
    }
    return h > 0 ? h : RIBBON_LANE_HALF;
  };

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
  private _ordLabels = new Map<
    number,
    { mesh: THREE.Mesh; line: THREE.Line; slot: number; kb: THREE.Mesh | null; kbLine: THREE.Line; kbText: string }
  >();
  /** The labels+lines ride the trail rewind as one group. */
  private _ordGroup = new THREE.Group();
  /** The TRAIL REWIND (objects/TrailRewind.ts — the shown snapshot owns the front). Keyed to
   *  the COMMITTED/FOLLOWED snapshot (`setPinned`), never the hover — hover previews the hot
   *  row in place, only a click moves the trail. */
  private _rewind = new TrailRewind();
  /** Mirror of the rewind offset for the frame's read sites (updated once per update()). */
  private _trailOff = 0;
  /** Set when a tick shifted every row a slot back; consumed by the next `_rewind.update`. */
  private _advanced = false;
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

  // ── fades
  private _fades = new FadeSet();

  // ── THE DAY GLASS'S LAMP. The chamber stages a light on a LIGHT ground only (see the claim in
  // update()). Both vectors are WORLD space and the group's transform is fixed at construction —
  // quaternion and scale are set once and never written again — so they are resolved once here
  // rather than per frame, and no render state is read.
  private readonly _stageSubject = new THREE.Vector3();
  private readonly _stageNormal = new THREE.Vector3();
  private readonly _spot: StageLight;

  // ── THE BLOCKS REGISTER (spec 2026-11-05): the register the chamber reads, its cargo row, and the
  // inputs the block tier is placed from. All event-time; the tier draws per frame from its own state.
  private _register: LedgerRegister = "snapshots";
  private _cargo = REGISTER_CARGO.snapshots;
  private _blockWindow: BlockWindow | null = null;
  private _blockReads: Readonly<Record<string, { blocks: BlockRead[] }>> = {};
  private _hoverBlock: string | null = null;
  private _selBlock: string | null = null;
  /** The DAG's blocks in the snapshot glass, and the token blocks opaque on their tiles — two
   *  materials, so two tiers; `_tiers` is both, for the calls they answer alike. */
  private _dagTier: BlockTier;
  private _tokenTier: BlockTier;
  private _tiers: readonly BlockTier[] = [];
  private _stretch: SilentStretch;
  /** The tiles that carry a block (the Blocks register draws no other), and the anchor lines from
   *  them — both rebuilt with the tier, at event time. */
  private readonly _blockTiles = new Set<LaneBlock>();
  /** The DAG drawing's last layout per chain (`forkSpread`'s `prior`), so a placed block holds still.
   *  Pruned to the window by every rebuild; a window sharing no block with it starts it afresh. */
  private _blockZ = new Map<string, Map<string, number>>();
  /** World units per `forkSpread` unit for the DAG braid: the window's widest fork fitted to
   *  `BRAID_HALF`. Fixed for the window — it only ever tightens, when a fork wider than it fits
   *  arrives — so a newer block that widens nothing re-scales nothing. Null until a fork exists. */
  private _braidScale: number | null = null;
  private _anchorLines: AnchorLine[] = [];
  private readonly _tileScratch = new THREE.Vector3();
  /** THE DATA BLOCKS REGISTER'S MARKS (`REGISTER_CARGO.dataMarks`): one instance per tile, in the
   *  tile draw's own order, and per tile the count its mark states — -1 for none (no data blocks, or
   *  the read not landed). Filled at event time with the pick table (`_rebuildTilePicks`). */
  private _dataMarkMesh!: THREE.InstancedMesh;
  private readonly _dataMarkN = new Float32Array(META_TRAIL_MAX).fill(-1);
  private _dataMarkLastDrawn = 0;

  constructor(
    scene: THREE.Scene,
    colors: SceneColors,
    sceneColors: Record<string, number>,
    spot: StageLight,
  ) {
    this._spot = spot;
    this._colors = colors;
    this._paper = isLightGround(colors);
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
    // The chamber's own centre ON THE GLOBAL FLOOR, and the group's up, taken into world through
    // that fixed transform. The floor is the subject because the floor is the pane the highlight has
    // to land on: a lamp staged over the chamber's mid-height would put its mirror image past the
    // front rim from the resting pose, and there is no floor out there to catch it.
    this._stageSubject
      .set(FLOOR_CX, LEDGER.rowGL0, 0)
      .multiplyScalar(LEDGER.viewScale)
      .applyQuaternion(this.group.quaternion);
    this._stageNormal.set(0, 1, 0).applyQuaternion(this.group.quaternion);

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
    // The live edge mounts SEPARATELY and straight into the root: the three groups above all take
    // `position.x = this._trailOff` from the rewind, and the edge marks NOW — which does not slide
    // with the trail.
    this._live = new LiveEdge();
    this.group.add(this._live.group);
    // The Blocks register's tier and the silent stretches ride the rewind like the ribbons.
    this._dagTier = new BlockTier(colors, { glass: true });
    this._tokenTier = new BlockTier(colors);
    this._tiers = [this._dagTier, this._tokenTier];
    this._stretch = new SilentStretch(colors);
    this.group.add(this._dagTier.group, this._tokenTier.group, this._stretch.group);

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
      new THREE.BoxGeometry(1, 1, TILE_D),
      new THREE.MeshBasicMaterial({}),
      META_TRAIL_MAX,
    );
    joinBloom(this._metaTrailMesh); // the lane tiles are the trail's identity marks — see BLOOM_LAYER
    // The paper halo's input lift (TileLook.halo, the bar's twin): multiplied up only while the
    // selective mark pass renders, un-multiplied inside the same pass — the main frame always
    // draws the tiles at their true colour (multiply, never set — the bar's rule).
    const tileMat = this._metaTrailMesh.material as THREE.MeshBasicMaterial;
    this._metaTrailMesh.onBeforeRender = () => { if (inMarkPass()) tileMat.color.multiplyScalar(TILE_LOOK.halo); };
    this._metaTrailMesh.onAfterRender = () => { if (inMarkPass()) tileMat.color.multiplyScalar(1 / TILE_LOOK.halo); };
    this._metaTrailMesh.frustumCulled = false;
    // ⚠️ Bounds three cannot reject with — the lane tiles are pickable AND they move (the trail
    // slides every tick, the rewind slides it further), so three's lazily-computed-once
    // `boundingSphere` would go stale and skip the whole mesh before any per-instance test.
    // Same failure the node fabric hit; see NodeFabric.openBounds for the full note.
    this._metaTrailMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
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

    // The Data blocks register's marks: the tiles' own species (solid, normal-blended, depth-writing,
    // in the bloom set), one unit box scaled per instance onto its tile's top. Not pickable — a mark
    // is part of its tile, and the tile under it answers the click.
    this._dataMarkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({}), META_TRAIL_MAX);
    joinBloom(this._dataMarkMesh);
    this._dataMarkMesh.frustumCulled = false;
    this._dataMarkMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this._dataMarkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < META_TRAIL_MAX; i++) {
      this._dataMarkMesh.setColorAt(i, _col.set(0xffffff));
      this._dataMarkMesh.setMatrixAt(i, _dummy.matrix); // still the zero-scale matrix from above
    }
    this._dataMarkMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this._dataMarkMesh);
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
    this._live.setAlpha(a);
    // group.visible is owned SOLELY by the Engine — a view fades, it never hides itself.
  }

  private _applyFloorAlpha(): void {
    // Each plane applies ITS look channel (the global floor vs the metagraph planes — same
    // blueprint, two knobs; user 2026-08-07). FLOOR_D/2 is the shared drop-off reference so the
    // rim reads as one width everywhere; narrow pieces clamp it inside SnapshotPlane.
    const a = this._fades.alpha;
    // ── THE STAGE LIGHT, CLAIMED ON PAPER ONLY (user, 2026-08-26). The dark chamber stages NOTHING
    // and always has: an additive whisper over black is already a glow, so a lamp there would be a
    // second light source with nothing to do. On paper the lamp is what lights the CHIPS in the
    // trays (MeshStandardMaterial, lit by the real SpotLight) — the four colour dim tiers need its
    // help on the sheet, see the lamp rule in CLAUDE.md. (Until 2026-10-09 the day GLASS also took
    // the lamp as a Blinn-Phong lobe through a uniform push; the sheets are matte and that path is
    // deleted.) Not claiming IS off, so on dark this branch simply never runs.
    if (this._paper) {
      this._spot.claim("ledger", this._stageSubject, this._stageNormal, STAGE_LIGHTS.ledger.height, a);
    }
    for (const p of this._globalPlanes) p.applyAlpha(GLOBAL_PLANE_LOOK, a, FLOOR_D / 2);
    // The committed (or hover-previewed) network's OWN plane glows a step brighter — the
    // plane-level twin of the colored dim (user, 2026-08-07).
    const netKey = this._netDimKey();
    for (const [key, p] of this._metaPlanes) {
      const lane = key === netKey;
      p.applyAlpha(META_PLANE_LOOK, a, FLOOR_D / 2, lane ? LANE_FILL_BOOST : 1, lane ? this._laneColor(key).getHex() : null);
    }
    // Both columns' resting level is a dark-ground opacity; on paper it is ink over the page, so
    // it asks the ground once, hoisted here — loop-invariant (the hoist rule).
    const ordOp = inkPresence(ORD_OP, this._paper);
    for (const o of this._ordLabels.values()) {
      const ox = LEAD_X - o.slot * SLOT_SP + this._trailOff;
      // Both boundaries at once: the rewind's front dissolve and the horizon's — no instrument
      // may float on glass that has already faded out (user, 2026-08-09) — and the ENTRY fade:
      // a label must not name a row whose bar hasn't dropped in yet.
      const entryF = this._entryT < 1 && o.slot >= 0 && o.slot < SLOT_N ? this._entryFade[o.slot] : 1;
      const front = this._rewind.fadeAtX(ox) * horizonAt(ox) * entryF;
      // The dotted line keeps its RATIO to the text (ORD_LINE_MUL) —
      // it is a tie to its row, and a tie that outweighs the number it carries reads as the subject.
      (o.mesh.material as THREE.MeshBasicMaterial).opacity = ordOp * front * a;
      // The anchor line whispers under its label (user, 2026-08-07 — "a bit more subtle").
      (o.line.material as THREE.LineDashedMaterial).opacity = ordOp * ORD_LINE_MUL * front * a;
      // The size column rides the same two boundaries. Its line goes with its number: with no
      // measurement to state there is nothing for the line to tie to.
      if (o.kb) (o.kb.material as THREE.MeshBasicMaterial).opacity = ordOp * front * a;
      (o.kbLine.material as THREE.LineDashedMaterial).opacity = o.kb ? ordOp * ORD_LINE_MUL * front * a : 0;
    }
  }

  setSceneColors(map: Record<string, number>): void {
    this.sceneColors = map;
    this._laneColors.clear();
    this._bar.setSceneColors(map);
    this._ribbons.setSceneColors(map);
    this._rebuildBlockTier(); // the blocks carry their chain's hue, baked at placement
  }

  /** THEME FLIP — the chamber's construction-time captures of the STRUCTURAL palette. `_colors` is
   *  the Engine's own object and already reads new, so this re-applies what was copied out of it:
   *  the neutral-trail scalar the per-frame writers compare against, every storey's glass + edge
   *  label (whose blend mode themes — see applyGlassTheme), the two pooled label columns and their
   *  dotted anchor lines, and the two instruments that BAKE (the bar's neutral, the ribbons' vertex
   *  colours). Identity hue is the other channel and arrives separately via setSceneColors.
   *  Event-time — one flip, not a frame. */
  setColors(c: SceneColors): void {
    this._colors = c;
    this._paper = isLightGround(c);
    this._core = c.core;
    this._coreCol.setHex(c.core);
    for (const p of [...this._globalPlanes, ...this._metaPlanes.values()]) p.setColors(c);
    this._bar.setColors(c);
    this._ribbons.setColors(c);
    for (const t of this._tiers) t.setColors(c);
    this._stretch.setColors(c);
    this._rebuildBlockTier(); // the DAG's blocks and links bake the structural cyan (`_core`)
    // The ordinal + kB columns are POOLED per visible row (recycled by ordinal), so the live set
    // is retinted in place; rows built after the flip read the new `_colors`/`_core` above.
    for (const o of this._ordLabels.values()) {
      retintEdgeLabel(o.mesh, c, "readout");
      if (o.kb) retintEdgeLabel(o.kb, c, "readout");
      for (const l of [o.line, o.kbLine]) (l.material as THREE.LineDashedMaterial).color.setHex(labelInk(c, "readout"));
    }
  }

  // ── VIEW-ENTRY DROP (user, 2026-08-16, retimed same day — "should occur as the last effect
  // on the scene to signal we're done"): snapshots are SUBJECTS, so they arrive like ones —
  // but AFTER the choreography settles, not inside it (the first cut ran during the IN build,
  // where the camera is mid-flight and the chamber still translucent, and read as nothing).
  // The subjects HOLD elevated and dark through the transition; on release they drop ~2.6
  // units onto their planes over ~1.05s, slot-staggered front-to-back, brightness riding the
  // same ease, ribbons on the tail — the chamber's closing beat. `_entryT` parks at 1 and the
  // per-frame work is skipped entirely once settled.
  private _entryT = 1;
  private _entryHold = false;
  private readonly _entryDrop = new Float32Array(SLOT_N);
  private readonly _entryFade = new Float32Array(SLOT_N);
  // ── THE TICK HANDOFF's GRACE SHEET (user, 2026-08-16 — "the ribbon and snapshot selection
  // effect disappear immediate ... give a nice fade to the getting-old snapshot and a smooth
  // pivot to the new one"). On a new tick the outgoing lead's ribbon FOLLOWS its row back one
  // slot and fades (~0.8s); the moment the new lead's sheet is drawable (its exact read landed
  // — "no exact read → no bands"), the fade accelerates into a crossfade (~0.35s). Ribbons row
  // 3 is the carrier; the ordinal (not the slot) is tracked so further ticks keep the sheet on
  // its own row as everything shifts.
  private _graceOrd: number | null = null;
  private _graceT = 0;
  private _graceSlot = -1; // the grace row's live slot — hue continuity for tiles + bar
  // The NEW lead's ribbon fades IN over ~0.9s (user, 2026-08-16 — it popped to full the frame
  // it became drawable; only the OLD sheet was crossfading). Keyed by ordinal, smoothstepped.
  private _leadRibOrd: number | null = null;
  private _leadRibT = 1;

  /** Arm the drop (subjects held high and dark) — called on every arrival in this view. */
  beginEntry(): void {
    this._entryT = 0;
    this._entryHold = true;
    this._entryDrop.fill(2.6);
    this._entryFade.fill(0);
  }

  /** Release it — the transition settled (or there was none); the drop is the closing beat. */
  releaseEntry(): void {
    this._entryHold = false;
  }

  // The committed metagraph snapshot's TILE — resolved to an instance index event-time (every
  // new tick shifts the instance order, so _rebuildTilePicks re-resolves), its live position
  // recorded as the trail draws (rewind and trail offsets included).
  private _selTile: { metaId: string; ordinal: number } | null = null;
  private _selTileIndex = -1;
  private _selTilePos = new THREE.Vector3();
  private _selTilePosOk = false;

  /** Tell the chamber which metagraph snapshot is committed, so the callout can anchor ITS
   *  tile rather than the lane lead (user, 2026-08-15). */
  setSelectedTile(sel: { metaId: string; ordinal: number } | null): void {
    this._selTile = sel;
    this._resolveSelTile();
  }

  private _resolveSelTile(): void {
    this._selTileIndex = -1;
    const sel = this._selTile;
    if (!sel) return;
    for (let i = 0; i < META_TRAIL_MAX; i++) {
      const p = this._tilePicks[i];
      if (p?.kind === "metaSnap" && p.sel.metaId === sel.metaId && p.sel.ordinal === sel.ordinal) {
        this._selTileIndex = i;
        return;
      }
    }
  }

  /** The committed FILTER's band on the shown global row (the selected row owns the front, so
   *  this is the lead-or-pinned slot) — the byte bar's own segment for the network, so the
   *  global callout can point at it under a filter (user, 2026-08-16). Chamber-local. */
  /** THE LABEL'S QUIET GATE (user, 2026-09-04 — "before the global snapshot is fixed on the
   *  plane already its callout is shown"): the chamber's own motion runs on its own clocks —
   *  the rewind's ~2s glide, a just-measured bar's ~0.4s grow-in — invisible to the
   *  view-transition and camera-flight gates the callout already holds. True when the trail is
   *  at rest AND the selected/lead row is at its final geometry. Consulted by CalloutSync's
   *  SNAPSHOT anchors only — tray chips don't ride the trail. */
  calloutSettled(following: boolean): boolean {
    // FOLLOW MODE SKIPS THE WHOLE GATE (2026-09-05 skipped the rewind term; the user caught
    // the half left behind, 2026-09-11 — "when the new byte row is drawn it still replays"):
    // the slot-0 rowStill term went false for the fresh bar's ~0.4s grow-in on EVERY anchored
    // tick, so data-on flickered and the label faded out and back in per heartbeat. A follow's
    // every-tick motion IS the steady state — the anchor is recorded live each frame (rewind
    // offsets and the growing bar included), so the label rides all of it; the ARRIVAL cases
    // this gate exists for — a fresh pin's multi-slot glide, the view-entry drop — keep it,
    // because a pin is never `following` and the view entry is already hidden by the
    // transition gate.
    if (following) return true;
    // The pin's gate reads `nearlySettled`, not `settled` (user, 2026-09-11 — the glide's
    // asymptotic tail held the label back for over a second after the row already read as
    // home).
    if (!this._rewind.nearlySettled) return false;
    // A pinned subject aged out of the window has no row of its own — gating it on the lead's
    // regrow was an unrelated hide (review find #2); with no slot there is nothing to wait on.
    const slot = this.model.selectedSlot;
    if (slot < 0) return true;
    return this._bar.rowStill(slot);
  }

  bandAnchor(key: string, out: THREE.Vector3): boolean {
    const slot = this.model.selectedSlot >= 0 ? this.model.selectedSlot : 0;
    return this._bar.bandAnchor(slot, key, out);
  }

  /** The committed snapshot's own tile position (chamber-local), when it drew this frame. */
  selectedTileAnchor(out: THREE.Vector3): boolean {
    if (!this._selTilePosOk) return false;
    out.copy(this._selTilePos);
    return true;
  }

  /** THE BLOCK CALLOUT'S ANCHOR (D3), chamber-LOCAL: the committed block (`setSelectedBlock` — the
   *  live newest block or the pinned one) where its tier stands it this frame. False outside the
   *  Blocks register, with no block, or while its row is off the trail. */
  selectedBlockAnchor(out: THREE.Vector3): boolean {
    if (!this._cargo.blocks || this._selBlock == null) return false;
    for (const t of this._tiers) if (t.anchorOf(this._selBlock, out)) return true;
    return false;
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
    if (!latest) {
      // AN EMPTY SOURCE IS AN EMPTY TRAIL (the Blocks register before its window lands, or a window
      // holding no ticks): the rows of the stretch drawn before must not stand in for it.
      if (this._latest) this._emptyTrail();
      return;
    }
    this._latest = latest;

    // event-time: one ordinal index per tick (the trail carries ordinals, not snapshots).
    // Built BEFORE the model runs — the wrapped anchor resolver below needs the ts join.
    this._byOrd.clear();
    this._byTs.clear();
    for (const s of snaps) { this._byOrd.set(s.ordinal, s); this._byTs.set(s.timestamp, s); }

    // The UNKNOWN lane's counts: the unlisted chains are POLLED like the catalog's (2026-10-08),
    // so the anchor index already counts them under UNLISTED_KEY, each from its own chain's
    // records. Where the tick's EXACT read has landed, its unlistedCount wins — it is the global
    // snapshot's own manifest, and it also counts a chain the hourly list has not caught yet.
    this._lastSnaps = snaps;
    this._lastGetAnchor = getAnchor;
    const wrapped = (ts: string): Anchor | null => {
      const a = getAnchor(ts);
      const snap = this._byTs.get(ts);
      const ex = snap ? this._exact[snap.ordinal] : undefined;
      if (!ex) return a;
      const u = ex.unlistedCount ?? 0;
      const polled = a?.metaCounts.get(UNLISTED_KEY) ?? 0;
      if (u === polled) return a;
      const metaCounts = new Map(a?.metaCounts ?? []); // event-time
      if (u > 0) metaCounts.set(UNLISTED_KEY, u);
      else metaCounts.delete(UNLISTED_KEY);
      return a
        ? { fee: a.fee, count: a.count - polled + u, metaIds: a.metaIds, metaCounts, touched: a.touched }
        : { fee: 0, count: u, metaIds: new Set([UNLISTED_KEY]), metaCounts, touched: 0 };
    };

    // Capture the outgoing lead BEFORE the model shifts: if it had a drawable sheet, the
    // grace row inherits it (see the field note above).
    const prevLead = this.model.tickOrdinal;
    const hadSheet = !!(this._slotSnap[0] && this._specs[0]?.measured && this._specs[0].bandCount > 0);
    this.model.setData(snaps, wrapped);
    if (prevLead != null && this.model.tickOrdinal !== prevLead && hadSheet) {
      this._graceOrd = prevLead;
      this._graceT = 1;
    }
    // The trail gained a slot — armed here (data time) and consumed by the rewind on the next
    // frame, which is the one place trail motion is allowed to live.
    if (prevLead != null && this.model.tickOrdinal !== prevLead) this._advanced = true;

    // ⚠️ THE POOLS FOLLOW THE TRAIL'S CAPACITY, NOT THE VISIBLE DEPTH (user, 2026-09-14). SLOT_N is
    // how many rows the chamber SHOWS; `model.trailCap` is how many it HOLDS, which grows once the
    // reader selects an older row — the rewind then slides those extra rows into view, so they must
    // exist as bars, specs and picks or the chamber empties behind the selection. Grown here, at
    // tick rate, never per frame.
    this._ensureSlotCapacity(this.model.trailCap);
    const was = this._slotSnap.slice(); // event-time
    for (let s = 0; s < this._slotSnap.length; s++) this._slotSnap[s] = null;
    if (this.model.tickOrdinal != null)
      this._slotSnap[0] = this._byOrd.get(this.model.tickOrdinal) ?? null;
    for (const tr of this.model.trail)
      if (tr.slot >= 0 && tr.slot < this._slotSnap.length)
        this._slotSnap[tr.slot] = this._byOrd.get(tr.ordinal) ?? null;
    // A slot the new stretch leaves empty draws nothing — after a source switch to a shorter trail
    // (a Blocks window of a few ticks) its old bar must not linger.
    for (let s = 0; s < was.length; s++) {
      const old = was[s];
      if (old && !this._slotSnap[s]) this._bar.setBar(s, old.ordinal, null, this._pickFor(old));
    }

    this._recomputeHoverSlot();
    this._rebuildAllSlots();
  }

  /** Every row gone: the bars, the tiles (a fresh model holds no lanes, so the frame zero-scales
   *  them), the labels, the ribbons, the block tier. Event-time. */
  private _emptyTrail(): void {
    for (let s = 0; s < this._slotSnap.length; s++) {
      const old = this._slotSnap[s];
      if (old) this._bar.setBar(s, old.ordinal, null, this._pickFor(old));
      this._slotSnap[s] = null;
    }
    this._latest = null;
    this.model = new LedgerModel();
    this._graceOrd = null;
    this._graceT = 0;
    this._lastSnaps = null;
    this._lastGetAnchor = null;
    this._rebuildAllSlots();
  }

  /** A SOURCE SWITCH — the live buffer ↔ a past window around an old pin (user, 2026-11-03: "go
   *  back in time"; `src/data/pastWindow.ts`). The model only ever advances, so another stretch of
   *  the chain starts a fresh one, which seeds itself from the next `setData` like a first entry.
   *  The caller re-applies the selection, so the rewind lands the pin. */
  resetHistory(): void {
    this.model = new LedgerModel();
    // (The DAG drawing's layout survives: a re-seated window that overlaps the last keeps its blocks
    // where they stood, and the next rebuild prunes the rest — see `_rebuildBlockTier`.)
    this._graceOrd = null;
    this._graceT = 0;
    this._advanced = false;
    this._lastSnaps = null;
    this._lastGetAnchor = null;
  }

  /** While a past window stands, "now" is not on screen: the live edge stands down and the newest
   *  row is an ordinary row of the past (its exact read is a measurement, not a tick in flight). */
  private _frozen = false;
  private _liveGlobal: GlobalSnapshot | null = null;
  setFrozen(on: boolean): void {
    if (on === this._frozen) return;
    this._frozen = on;
    this._rebuildAllSlots();
  }

  // ── THE BLOCKS REGISTER ──────────────────────────────────────────────────

  /** Which register the chamber reads (`store.ledgerRegister`). The Engine re-hands the source
   *  around this call (the trail's ticks are the register's), so this only switches the cargo. */
  setRegister(r: LedgerRegister): void {
    if (r === this._register) return;
    this._register = r;
    this._cargo = REGISTER_CARGO[r];
    this._rebuildAllSlots(); // the live edge's claim on the front, the tier, the pick list
  }

  /** Is the block window this register's trail (the cargo row, `REGISTER_CARGO`)? */
  get readsBlockWindow(): boolean {
    return this._cargo.blocks;
  }

  /** The block window the Blocks register's trail is (`src/data/blockWindow.ts`), or none yet.
   *  Held only: the window is the trail's SOURCE, so the Engine's refresh that follows every window
   *  change re-runs `setData`, whose slot rebuild draws the tier — one rebuild per window. */
  setBlockWindow(w: BlockWindow | null): void {
    this._blockWindow = w;
  }

  /** THE LIVE GLOBAL the Blocks register's front run reaches to (`SilentStretch`'s front run), or
   *  null when the window held is not the live one (a pinned past window makes no claim about now).
   *  Held only: the Engine hands it before each refresh, whose slot rebuild draws the run — so it
   *  grows on each live tick, at event time. */
  setLiveGlobal(g: GlobalSnapshot | null): void {
    this._liveGlobal = g;
  }

  /** The full reads (`store.blockReads`): a block's parents. */
  setBlockReads(r: Readonly<Record<string, { blocks: BlockRead[] }>>): void {
    this._blockReads = r;
    this._rebuildBlockTier();
  }

  /** The hovered block (`store.hoverBlock`) — previews, never commits (convention 9). */
  setHoveredBlock(hash: string | null): void {
    this._hoverBlock = hash;
    for (const t of this._tiers) t.setEmphasis(this._hoverBlock, this._selBlock);
  }

  /** The committed block (`store.block`), by hash. */
  setSelectedBlock(hash: string | null): void {
    this._selBlock = hash;
    for (const t of this._tiers) t.setEmphasis(this._hoverBlock, this._selBlock);
  }

  /** A tile's top centre AT REST — chamber-local, before the rewind offset and the entry drop. The
   *  ONE copy of the tile arithmetic: the per-frame draw (and the selected tile's callout anchor)
   *  adds the frame's offsets to it, and a token block stands on it. Layout data, never a rendered
   *  transform (rule 6). */
  private _tileTop(b: LaneBlock, cz: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(LEAD_X - b.slot * SLOT_SP + b.ox, FLOOR_Y.msnap + TILE_LIFT + TILE_D * b.size, cz + b.oz);
  }

  /** The top of tile `k` of `metaId`'s lane block in the tick `tickTs` (the tile resolver's own
   *  index: the k-th filled tile of that tick), at rest. False when the lane holds no such tile. */
  tileAnchorOf(metaId: string, tickTs: string, k: number, out: THREE.Vector3): boolean {
    const b = this._tileOf(metaId, tickTs, k);
    if (!b) return false;
    this._tileTop(b, this._laneCz(metaId), out);
    return true;
  }

  /** The k-th filled tile of `metaId`'s lane block in the tick `tickTs`, or null. */
  private _tileOf(metaId: string, tickTs: string, k: number): LaneBlock | null {
    const lane = this.model.lanes.get(metaId);
    if (!lane) return null;
    let j = 0;
    for (const b of lane.blocks) {
      if (b.ts !== tickTs || !b.filled) continue;
      if (j === k) return b;
      j++;
    }
    return null;
  }

  /** A lane's centre across the field — the ONE lookup the tile draw and the tile anchor share. */
  private _laneCz(metaId: string): number {
    return this._laneZ.get(metaId) ?? this.model.lanes.get(metaId)?.z ?? 0;
  }

  /** EVENT-TIME: place every block the window's trail ticks hold, link the ones whose reads landed,
   *  and mark the silent runs between adjacent ticks. Runs on every slot rebuild (a new tick, a
   *  landing exact read), on a window, on reads. Outside the Blocks register it clears.
   *
   *  Honesty (rule 10): a block is drawn from the FEED's hashes (the window), so a tick whose full
   *  read has not landed — or failed — still shows its blocks, with no links; every reference a
   *  landed read states is drawn (`referenceSegments`: to a placed parent, else a stub toward the
   *  older side). A block the landed read shows with no parents is a DATA block, not a DAG block,
   *  and is not drawn. Its place across is the layered DAG drawing's (`forkSpread`); a block whose read
   *  has not landed stands on the centre line. */
  private _rebuildBlockTier(): void {
    const w = this._blockWindow;
    // The constructor builds the tier after the first slot rebuild can run.
    if (!this._tiers.length || !this._stretch) return;
    if (!this._cargo.blocks || !w) {
      // Already empty (the Snapshots register rebuilds slots every tick): nothing to clear.
      if (this._dagTier.count === 0 && this._tokenTier.count === 0 && this._stretch.count === 0 && !this._anchorLines.length) return;
      for (const t of this._tiers) t.clear();
      this._stretch.clear();
      this._blockTiles.clear();
      this._anchorLines = []; // event-time
      this._rebuildTilePicks();
      this._syncRibbonRows();
      return;
    }
    const reads = this._blockReads;
    // Pass 1 — every read the WINDOW holds, by `${chain}:${hash}`, and each chain's layered DAG
    // drawing (`forkSpread`: a block at the barycenter of its parents, siblings split around it,
    // parents first). Window-wide on purpose, so a block keeps its place as the trail holds more or
    // fewer rows; a block whose parent's read is still pending waits on the centre line.
    const readOf = new Map<string, BlockRead>(); // event-time
    const layer = new Map<string, { hash: string; height: number; ord: number; parents: string[] }[]>(); // event-time
    const pending = new Map<string, Set<string>>(); // event-time: drawn blocks whose read has not landed
    const note = (chain: string, key: string, ord: number, hashes: readonly string[]) => {
      const read = reads[key];
      if (!read) {
        const u = pending.get(chain) ?? pending.set(chain, new Set()).get(chain)!;
        for (const h of hashes) u.add(h);
        return;
      }
      for (const b of read.blocks) {
        if (!b.hash) continue;
        readOf.set(`${chain}:${b.hash}`, b);
        if (b.parents.length) (layer.get(chain) ?? layer.set(chain, []).get(chain)!).push({ hash: b.hash, height: b.height, ord, parents: b.parents.map((p) => p.hash) });
      }
    };
    for (const t of w.ticks) {
      if (t.blocks.length) note("dag", `dag:${t.ord}`, t.ord, t.blocks);
      for (const [chain, rows] of Object.entries(t.metaSnaps)) for (const r of rows) if (r.blocks?.length) note(chain, `${chain}:${r.ordinal}`, r.ordinal, r.blocks);
    }
    // The last layout is handed back (`prior`), so a block placed once keeps its place: the window
    // sliding by a block tick moves nothing already standing. A source switch starts it afresh.
    // It survives a re-seat too, since a re-seated window that overlaps the last (the live window's
    // own refresh) must not re-deal what both hold; a window sharing nothing with it (a pin far away)
    // starts afresh, the braid's scale with it.
    const zOf = new Map<string, Map<string, number>>(); // event-time
    let kept = 0;
    for (const [chain, list] of layer) {
      const prior = this._blockZ.get(chain);
      if (prior) for (const b of list) if (prior.has(b.hash)) kept++;
      zOf.set(chain, forkSpread(list, 1, prior, pending.get(chain)));
    }
    if (kept === 0) this._braidScale = null;
    this._blockZ = zOf;
    let widest = 0;
    for (const u of zOf.get("dag")?.values() ?? []) widest = Math.max(widest, Math.abs(u));
    if (widest > 0) this._braidScale = Math.min(this._braidScale ?? Infinity, BRAID_HALF / widest);
    const braid = this._braidScale ?? 0;
    const tiers = { dag: { items: [] as BlockItem[] }, token: { items: [] as BlockItem[] } }; // event-time
    const at = new Map<string, readonly [number, number, number]>(); // event-time
    const slotAt = new Map<string, number>(); // event-time: the ROW each placed block stands in
    const taken = new Map<string, number>(); // event-time: blocks already standing per place
    this._blockTiles.clear();
    const anchors: AnchorLine[] = []; // event-time
    // A block comes from the FEED's hash, so a failed or unlanded read still draws it, with no links;
    // its height is unknown, so it stands on the centre line. A landed read with no parents is a data
    // block, not a DAG block, and is not drawn (null).
    const placeOf = (chain: string, hash: string): number | null => {
      const read = readOf.get(`${chain}:${hash}`);
      if (read && read.parents.length === 0) return null;
      return zOf.get(chain)?.get(hash) ?? 0;
    };
    const turn = (key: string): number => {
      const j = taken.get(key) ?? 0;
      taken.set(key, j + 1);
      return j === 0 ? 0 : (j % 2 ? 1 : -1) * Math.ceil(j / 2);
    };
    const push = (tier: "dag" | "token", chain: string, hash: string, slot: number, x: number, y: number, z: number, size: number, hue: number, pick: PickDescriptor) => {
      const key = `${chain}:${hash}`;
      at.set(key, [x, y, z]);
      slotAt.set(key, slot);
      tiers[tier].items.push({ hash, chain, x, y, z, slot, size, pick, hue });
    };
    let deepest = -1;
    for (let s = 0; s < this._slotSnap.length; s++) {
      const snap = this._slotSnap[s];
      const t = snap ? w.blockTick(snap.ordinal) : null;
      if (!snap || !t) continue;
      deepest = s;
      const global = this._pickFor(snap) as Extract<PickDescriptor, { kind: "snapshot" }>;
      // A DAG block stands ABOVE its tick's bar over the floor's centre line, in the snapshots' own
      // glass and cyan, at its fork's height in the band (`forkSpread`); blocks sharing a tick and a
      // place step aside along the trail. A hairline ties it down to its bar.
      const spec = this._specs[s];
      const barMid = spec?.measured && spec.bandCount > 0 ? (spec.bands[0].z0 + spec.bands[spec.bandCount - 1].z1) / 2 : 0;
      for (const hash of t.blocks) {
        const f = placeOf("dag", hash);
        if (f == null) continue;
        const y = BRAID_Y + Math.max(-BRAID_HALF, Math.min(BRAID_HALF, f * braid));
        const z = 0;
        const x = LEAD_X - s * SLOT_SP + turn(`${s}|dag|${y.toFixed(3)}`) * BLOCK_STEP;
        push("dag", "dag", hash, s, x, y, z, DAG_BLOCK, this._core, {
          kind: "block", sel: { chain: "dag", hash, ordinal: t.ord, anchorOrd: t.ord }, global, title: "Block",
        });
        // The hairline lands on the CENTRE of its tick's data bar (user, D2), on the same eased sweep
        // the metagraph snapshots' lines take — layout data, the bar spec's own band extent.
        anchors.push({ slot: s, key: "dag", x, z, yTop: y - DAG_BLOCK / 2, band: { z0: barMid, z1: barMid }, hue: null });
      }
      // A token block stands ON the tile of the metagraph snapshot that accepted it (user ruling):
      // its layered place only nudges it across the tile and its turn along it, both bounded inside
      // the tile's own footprint (`TOKEN_ON_TILE`, `TOKEN_NUDGE`). That tile is the one the
      // register draws, tied to its tick by an anchor line.
      for (const [chain, rows] of Object.entries(t.metaSnaps)) {
        const recs = w.metaSnaps.get(chain)?.filter((r) => r.ts === t.ts) ?? []; // the tile resolver's list
        for (const r of rows) {
          if (!r.blocks?.length) continue;
          const k = recs.findIndex((x) => x.ordinal === r.ordinal);
          // A snapshot whose tile is not drawn (no lane for the chain, the tick's tiles not laid)
          // has nowhere to stand, so its blocks are not drawn either.
          const tileB = k < 0 ? null : this._tileOf(chain, t.ts, k);
          if (!tileB) continue;
          const tile = this._tileTop(tileB, this._laneCz(chain), this._tileScratch);
          const size = Math.min(TOKEN_BLOCK, tileB.size * TOKEN_ON_TILE);
          const reach = (tileB.size / 2) * TOKEN_NUDGE;
          let placed = false;
          for (const hash of r.blocks) {
            const f = placeOf(chain, hash);
            if (f == null) continue;
            placed = true;
            const along = Math.max(-1, Math.min(1, turn(`${chain}|${r.ordinal}`)));
            push("token", chain, hash, s, tile.x + along * reach, tile.y + size / 2 + 0.03, tile.z + Math.max(-1, Math.min(1, f)) * reach, size, this._laneColor(chain).getHex(), {
              kind: "block", sel: { chain, hash, ordinal: r.ordinal, anchorOrd: t.ord }, global, title: "Block",
            });
          }
          if (!placed) continue;
          this._blockTiles.add(tileB);
          const spec = this._specs[s];
          let band: { z0: number; z1: number } | null = null;
          if (spec?.measured) for (let i = 0; i < spec.bandCount; i++) if (spec.bands[i].key === chain) { band = spec.bands[i]; break; }
          anchors.push({ slot: s, key: chain, x: tile.x, z: tile.z, yTop: FLOOR_Y.msnap + TILE_LIFT, band, hue: this._laneColor(chain).getHex() });
        }
      }
    }
    // EVERY reference a read states (`referenceSegments`), per chain so each segment knows its colour
    // and lens: to the parent where it is placed, else a STUB toward the older side, ending one slot
    // past the trail's deepest row with its far end faded out (row −1). A block whose read has not
    // landed states no references, so it draws none.
    const stubX = LEAD_X - (deepest + 1) * SLOT_SP;
    const links = { dag: { pos: [] as number[], slots: [] as number[], chains: [] as string[], hues: [] as number[] }, token: { pos: [] as number[], slots: [] as number[], chains: [] as string[], hues: [] as number[] } }; // event-time
    const byChain = new Map<string, BlockRead[]>(); // event-time
    for (const [key, b] of readOf) {
      if (!at.has(key)) continue;
      const chain = key.slice(0, key.indexOf(":"));
      (byChain.get(chain) ?? byChain.set(chain, []).get(chain)!).push(b);
    }
    for (const [chain, blocks] of byChain) {
      const seg = referenceSegments(blocks, (hash) => at.get(`${chain}:${hash}`) ?? null, stubX);
      const out = chain === "dag" ? links.dag : links.token;
      const hue = chain === "dag" ? this._core : this._laneColor(chain).getHex();
      for (let i = 0; i < seg.ends.length; i += 2) {
        for (let k = 0; k < 6; k++) out.pos.push(seg.pos[i * 3 + k]);
        const far = seg.ends[i + 1];
        out.slots.push(slotAt.get(`${chain}:${seg.ends[i]}`) ?? -1, far == null ? -1 : slotAt.get(`${chain}:${far}`) ?? -1);
        out.chains.push(chain);
        out.hues.push(hue);
      }
    }
    // Each tier re-resolves the held emphasis on its rebuild.
    this._dagTier.rebuild(tiers.dag.items, Float32Array.from(links.dag.pos), links.dag.slots, links.dag.chains, links.dag.hues);
    this._tokenTier.rebuild(tiers.token.items, Float32Array.from(links.token.pos), links.token.slots, links.token.chains, links.token.hues);
    this._anchorLines = anchors;
    // The bare tiles leave the pick table with their marks, and the anchor lines replace the sheets.
    this._rebuildTilePicks();
    this._syncRibbonRows();

    // The silent runs between adjacent trail ticks — between the two rows' bars, flush in the glass.
    const stretches: StretchItem[] = []; // event-time
    const y = FLOOR_Y.gl0 + BAR_LIFT + 0.02;
    for (let s = 0; s + 1 < this._slotSnap.length; s++) {
      const newer = this._slotSnap[s];
      const older = this._slotSnap[s + 1];
      if (!newer || !older) continue;
      const run = silentRun(older.ordinal, newer.ordinal, Date.parse(older.timestamp), Date.parse(newer.timestamp));
      if (!run) continue;
      const x1 = LEAD_X - s * SLOT_SP - ROW_HALF_D - 0.2;
      const x0 = LEAD_X - (s + 1) * SLOT_SP + ROW_HALF_D + 0.2;
      const label = run.snapshots > STRETCH_WORDS_MIN ? `${run.snapshots.toLocaleString()} snapshots · ${relativeAge(run.ms, true)}` : null;
      stretches.push({ key: `${older.ordinal}-${newer.ordinal}`, x0, x1, y, label });
    }
    // THE FRONT RUN — the live edge's silence (spec 2: "the silent stretch growing at the front"):
    // the globals after the newest block tick up to the live one, ahead of the lead row's bar.
    // Only in the live window (`_liveGlobal` is null for a pinned past one); none while the live
    // global is itself the newest block tick.
    const lead = this._slotSnap[0];
    const live = this._liveGlobal;
    if (lead && live && live.ordinal > lead.ordinal) {
      const n = live.ordinal - lead.ordinal;
      const ms = Math.max(0, Date.parse(live.timestamp) - Date.parse(lead.timestamp));
      const label = n > STRETCH_WORDS_MIN ? `${n.toLocaleString()} snapshots · ${relativeAge(ms, true)}` : null;
      stretches.push({ key: `${lead.ordinal}-live`, x0: FRONT_RUN_X0, x1: FRONT_INK_X, y, label, front: true });
    }
    this._stretch.rebuild(stretches);
  }

  // Ordinals whose exact read FAILED (store.exactMiss, bridged by the Engine): the give-up
  // signal. A missed tick is no longer IN FLIGHT, so the live edge lets go of it and falls to
  // standby, and the tick becomes an ordinary unmeasured ROW — a still, dim seed in its own
  // place in time, the same honest absence a historical unread row shows (the acquiring give-up
  // rule; a retry that later lands clears the miss and the read arrives through setExact).
  private _missOrds: ReadonlySet<number> = new Set();
  setExactMisses(byOrdinal: Record<number, unknown>): void {
    this._missOrds = new Set(Object.keys(byOrdinal).map(Number)); // event-time
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
    // ⚠️ THE BACKFILL CANNOT WAIT FOR THE NEXT TICK (found live, 2026-09-15 — the trail reached
    // correctly in the model's own tests and the chamber still emptied). Selecting a historic row
    // raises what the trail must hold, but only `setData` carries the buffer those rows come FROM,
    // and the next one arrives with the next global snapshot — ~28s away, and further still if the
    // reader steps again first. So the rewind slid the trail forward immediately while the rows
    // behind it were half a minute late or never came: measured, `setData` had not run once across
    // six steps back, the bar pool was still nine slots deep, and exactly three rows survived.
    //
    // Re-entering with the stored inputs is this file's established idiom for "the model needs to
    // re-run against data it already has" (see the colour rebuild above); `_advanced` stays false
    // because the tick ordinal has not moved, so the rewind's calm-jump contract is untouched.
    // Gated on a HISTORIC selection: following the live lead needs nothing, and this does a tick's
    // worth of slot rebuilding, which is fine at click rate and wasteful on every hover-commit.
    if (ordinal != null && ordinal !== this.model.tickOrdinal && this._lastSnaps && this._lastGetAnchor) {
      this.setData(this._lastSnaps, this._lastGetAnchor);
    }
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
   *  deliberately does NOT do: move or hide any geometry, or the camera, whose one pose it stands
   *  on (the per-lane fly-to was retired 2026-08-09). */
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
    // The threads are keyed to the committed (or hovered-preview) network, so a change of key is a
    // change of geometry — rule 9's pairing: a hover previews the thread a commit would draw.
    this._syncThreads();
    this._bar.setFilter(d);
    for (const t of this._tiers) t.setDim(d);
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
    return { ...globalPick(snap), sub: `${total} metagraph snapshot${total === 1 ? "" : "s"} anchored${blkTxt}` } satisfies PickDescriptor;
  }

  /** The tick the LIVE EDGE is naming: the newest one, while its exact read is genuinely in
   *  flight. ONE predicate with one home — it decides the slot's mute, the ordinal column's
   *  slot-0 suppression and the edge's own phase, so the line and the row can never both claim
   *  the tick, and the column can never name it twice. A read that FAILED is not in flight, so
   *  that tick falls back to being an ordinary unmeasured ROW and states its absence as a still
   *  seed in its own place in time. */
  private _liveOrd(): number | null {
    const snap = this._slotSnap[0];
    if (this._frozen || !this._cargo.liveEdge || !snap || this._exact[snap.ordinal] || this._missOrds.has(snap.ordinal)) return null;
    return snap.ordinal;
  }

  /** Grow the per-slot arrays and the bar's mesh pool to `n`. Never shrinks: the rows are already
   *  paid for, and a reader who has gone back once usually goes back again. The entry-stagger
   *  arrays deliberately stay SLOT_N long — that animation belongs to the VISIBLE depth, and every
   *  read of them is already guarded `slot < SLOT_N ? … : default`. */
  private _ensureSlotCapacity(n: number): void {
    while (this._specs.length < n) {
      this._specs.push(makeBarSpec());
      this._slotSnap.push(null);
    }
    this._bar.ensureSlots(n);
  }

  private _rebuildAllSlots(): void {
    const liveOrd = this._liveOrd();
    for (let s = 0; s < this._slotSnap.length; s++) {
      const snap = this._slotSnap[s];
      // A slot with no tick at all renders NOTHING — the seam is reserved for a tick that HAPPENED
      // (ByteBar leaves a never-populated slot's meshes and outline hidden from construction).
      if (!snap) continue;
      const ex = this._exact[snap.ordinal] ?? null;
      const anchored =
        ex?.anchored ??
        (typeof snap.metagraphSnapshotCount === "number" ? snap.metagraphSnapshotCount : 0);
      fillBarSpec(this._specs[s], ex ? this._bytesByKey(ex) : null, this._laneOrder, anchored);
      this._bar.setBar(s, snap.ordinal, this._specs[s], this._pickFor(snap), snap.ordinal === liveOrd);
    }
    this._syncRibbonRows();
    this._syncOrdLabels();
    this._rebuildTilePicks();
    this._rebuildBlockTier();
    this._syncPickables();
  }


  /** Release one row's whole label set — both columns' text and both anchor lines. */
  private _disposeOrd(o: { mesh: THREE.Mesh; line: THREE.Line; kb: THREE.Mesh | null; kbLine: THREE.Line }): void {
    this._ordGroup.remove(o.mesh, o.line, o.kbLine);
    for (const m of [o.mesh, o.kb]) {
      if (!m) continue;
      this._ordGroup.remove(m);
      m.geometry.dispose();
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    for (const l of [o.line, o.kbLine]) {
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    }
  }

  /** One dotted anchor line — the shared recipe both label columns tie their rows with. */
  private _makeDashLine(y: number, z0: number): THREE.Line {
    const lg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, y, z0),
      new THREE.Vector3(0, y, 0),
    ]);
    const lm = new THREE.LineDashedMaterial({
      color: labelInk(this._colors, "readout"), transparent: true, opacity: 0,
      depthWrite: false, dashSize: 0.14, gapSize: 0.18,
    });
    const line = new THREE.Line(lg, lm);
    line.renderOrder = 2;
    return line;
  }

  /** Point an existing anchor line at its row's bar edge. Event-time (a slot move or a read
   *  landing): a dashed line needs its distances recomputed after every move. */
  private _aimDash(line: THREE.Line, x: number, y: number, z0: number, z1: number): void {
    const pos = line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, x, y, z0);
    pos.setXYZ(1, x, y, z1);
    pos.needsUpdate = true;
    line.computeLineDistances();
  }

  /** One GLOBAL SNAPSHOT ID label per visible tick row, screen-left of the bars, each tied to
   *  its row's actual bar by a DOTTED anchor line (user, 2026-08-07). Keyed by ordinal so a
   *  label rides its row down the trail; one new canvas per tick (event-time — recycled labels
   *  only move, and the line end tracks the bar's live width as the exact read lands). */
  private _syncOrdLabels(): void {
    const seen = _ordSeen;
    seen.clear();
    const y = FLOOR_Y.gl0 + 0.06;
    // The forming tick's own row draws nothing — the live edge stands for it — so it gets no name
    // here either. A label needs its dotted anchor line, and that line would run out to a bar that
    // does not exist: exactly the dangling-line defect the SEED was drawn to answer. It is named
    // the moment its read lands and it becomes an ordinary measured row.
    const liveOrd = this._liveOrd();
    for (let s = 0; s < this._slotSnap.length; s++) {
      const snap = this._slotSnap[s];
      if (!snap || snap.ordinal === liveOrd) continue;
      seen.add(snap.ordinal);
      let o = this._ordLabels.get(snap.ordinal);
      if (o) o.slot = s;
      if (!o) {
        // event-time: one canvas + two 2-point dashed lines per new tick
        const mesh = makeEdgeLabel(this._colors, snap.ordinal.toLocaleString(), 0, FLOOR_Y.gl0, ORD_Z, ORD_H, "left", "readout");
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        const line = this._makeDashLine(y, ORD_LINE_Z0);
        const kbLine = this._makeDashLine(y, KB_Z0);
        o = { mesh, line, slot: s, kb: null, kbLine, kbText: "" };
        this._ordLabels.set(snap.ordinal, o);
        this._ordGroup.add(mesh, line, kbLine);
      }
      const x = LEAD_X - s * SLOT_SP;
      o.mesh.position.x = x;
      // The dotted anchor runs from the text's end to the row's bar edge (its live width/2 —
      // grows when the exact read lands). Every row now draws SOMETHING (a measured bar, a
      // measured-empty seam, or the flush seed), so the line always has a real edge to reach.
      const spec = this._specs[s];
      const barEdge = (spec.measured ? spec.width / 2 : SEED_W / 2) + 0.18;
      this._aimDash(o.line, x, y, ORD_LINE_Z0, Math.min(barEdge, ORD_LINE_Z0 - 0.2));
      // The SIZE column, mirrored: a number only once the row has a measurement to state, and its
      // text is rebuilt when the exact read lands (unmeasured → a real size).
      const kbText = spec.measured ? fmtKB(spec.kb) : "";
      if (kbText !== o.kbText) {
        o.kbText = kbText;
        if (o.kb) {
          this._ordGroup.remove(o.kb);
          o.kb.geometry.dispose();
          const km = o.kb.material as THREE.MeshBasicMaterial;
          km.map?.dispose();
          km.dispose();
          o.kb = null;
        }
        if (kbText) {
          // event-time: one canvas when a row's measurement arrives or changes
          o.kb = makeEdgeLabel(this._colors, kbText, 0, FLOOR_Y.gl0, KB_Z0, ORD_H, "left", "readout");
          (o.kb.material as THREE.MeshBasicMaterial).opacity = 0;
          this._ordGroup.add(o.kb);
        }
      }
      if (o.kb) o.kb.position.x = x;
      this._aimDash(o.kbLine, x, y, KB_Z0, Math.max(-barEdge, KB_Z0 + 0.2));
    }
    for (const [ord, o] of this._ordLabels) {
      if (seen.has(ord)) continue;
      this._disposeOrd(o);
      this._ordLabels.delete(ord);
    }
  }

  private _syncRibbonRows(): void {
    // THE REGISTER'S ANCHORS (`REGISTER_CARGO.anchors`): in Blocks a metagraph snapshot is tied to
    // its tick by one hairline from its tile, never a sheet — the four sheet rows stand empty.
    if (this._cargo.anchors === "lines") {
      for (const r of [0, 1, 2, 3] as const) this._ribbons.clearRow(r);
      this._syncThreads();
      return;
    }
    this._ribbonTopSlot = 0;
    this._ribbons.setRow(0, 0, this._slotSnap[0] ? this._specs[0] : null, this._laneZOf, this._topHalfOf);
    // Row 1 = the COMMITTED row (full strength); row 2 = the HOVER preview (colored dim).
    // Separate rows (2026-08-07): with a snapshot pinned, a hover needs its own sheet — the
    // active row keeps its ribbons regardless of hover, and the preview never goes missing.
    const hot = this.model.selectedSlot;
    if (hot > 0 && hot < this._slotSnap.length && this._slotSnap[hot]) {
      this._ribbonTopSlot = hot;
      this._ribbons.setRow(1, hot, this._specs[hot], this._laneZOf, this._topHalfOf);
      this._ribbons.setRowFade(1, 1);
    } else this._ribbons.clearRow(1);
    const hov = this._hoverSlot;
    if (hov > 0 && hov < this._slotSnap.length && hov !== hot && this._slotSnap[hov]) {
      this._ribbonTopSlot = hov;
      this._ribbons.setRow(2, hov, this._specs[hov], this._laneZOf, this._topHalfOf);
      // The hover ribbon IS the group tier — a hovered row is a preview of what a click would pin,
      // so it rides the same shared focus ranking every node loop uses.
      this._ribbons.setRowFade(2, focusWeightOf(false, true));
    } else this._ribbons.clearRow(2);
    // Row 3 = the GRACE sheet (see the field note): the outgoing lead's ribbon at its CURRENT
    // slot, fading per frame below. Keyed by ordinal so further ticks keep it on its own row.
    let g = -1;
    if (this._graceOrd != null && this._graceT > 0) {
      for (const tr of this.model.trail) if (tr.ordinal === this._graceOrd) { g = tr.slot; break; }
    }
    if (g > 0 && g < this._slotSnap.length && g !== hot && this._slotSnap[g] && this._specs[g].measured) {
      this._ribbonTopSlot = g;
      this._ribbons.setRow(3, g, this._specs[g], this._laneZOf, this._topHalfOf);
    } else {
      // Clear the SHEET but never the grace itself here: on the very first sync after a tick
      // the trail may not carry the outgoing lead yet, and killing the grace at arm time was
      // one of the ways the handoff silently died. Only the per-frame decay ends it.
      this._ribbons.clearRow(3);
    }
    this._syncThreads();
  }

  /** The committed network's hairline threads (Ribbons.setThreads) — the sheets cover four rows,
   *  these cover the REST of the trail so a commit can be traced back through time. Rebuilt on the
   *  same event-time seam as the sheets, since they read the same specs. */
  private _syncThreads(): void {
    // In Blocks the hairlines ARE the anchors, one per block-carrying tile, whatever the lens.
    if (this._cargo.anchors === "lines") {
      this._ribbons.setAnchorLines(this._anchorLines);
      return;
    }
    this._threadSpecs.length = 0;
    for (const tr of this.model.trail) {
      const slot = tr.slot;
      if (slot < 0 || slot >= this._slotSnap.length) continue;
      // A row that already carries a SHEET says the relation in full — no thread under it.
      if (slot === 0 || slot === this.model.selectedSlot || slot === this._hoverSlot || slot === this._graceSlot) continue;
      if (!this._slotSnap[slot] || !this._specs[slot].measured) continue;
      this._threadSpecs.push({ slot, spec: this._specs[slot] });
    }
    this._ribbons.setThreads(this._threadSpecs, this._laneZOf, this._topHalfOf);
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
        // A tile the register does not draw (a bare one, in Blocks) is not pickable either.
        const shown = b.filled && (this._cargo.bareTiles || this._blockTiles.has(b));
        const pick = shown ? fn(lane.id, b.ts, k) : null; // event-time
        this._tilePicks[mi] = pick;
        // The Data blocks register's mark: the count from THIS snapshot's own exact row — the tile
        // the resolver named — or none while that read has not landed (rule 10).
        this._dataMarkN[mi] = this._cargo.dataMarks && pick?.kind === "metaSnap" ? this._dataMarkOf(pick.sel.globalOrdinal, pick.sel.metaId, pick.sel.ordinal) : -1;
        if (b.filled) k++;
        mi++;
      }
    }
    for (let j = mi; j < META_TRAIL_MAX; j++) { this._tilePicks[j] = null; this._dataMarkN[j] = -1; }
    // A held hover's tile index is only valid against THIS table — and so is the selected
    // tile's (the callout anchor).
    this._syncHoverTile();
    this._resolveSelTile();
  }

  /** A metagraph snapshot's data-mark count from its tick's exact read (`dataMark.dataMarkCount`),
   *  or -1 for no mark. Event-time, beside the pick it belongs to. */
  private _dataMarkOf(globalOrdinal: number, metaId: string, ordinal: number): number {
    const rows = this._exact[globalOrdinal]?.rows;
    if (!rows) return -1;
    for (const r of rows) if (r.metaId === metaId && r.ordinal === ordinal) return dataMarkCount(r) ?? -1;
    return -1;
  }

  private _syncPickables(): void {
    this.pickables.length = 0;
    // The floor glass FIRST-CLASSES in the raycast as an occluder (userData.blocker): the Engine
    // returns null when the nearest hit is glass, so content under a floor never picks through it.
    for (const o of this._floorBlockers) this.pickables.push(o);
    for (const o of this._bar.pickables) this.pickables.push(o);
    // Tiles only become raycast targets once a resolver can turn an instance id into a snapshot.
    if (this._tileResolver) this.pickables.push(this._metaTrailMesh);
    // The blocks pick in their own register only — the raycaster ignores `visible`, and a cleared
    // tier holds no instances, but the list is the honest statement of what can answer.
    if (this._cargo.blocks) for (const t of this._tiers) this.pickables.push(t.mesh);
  }

  // ── frame ────────────────────────────────────────────────────────────────

  update(dt: number) {
    this.t += dt;

    // The entry ramp (see beginEntry): held at full lift while the transition runs, then the
    // DROP once released — retuned 2026-08-16 after the first cut read as a mere fade: the
    // fall is HIGH (6.5 units — clearly airborne above the planes at the chamber's low camera
    // angle), gravity-eased (p², accelerating — a drop, not a float), and the stagger is
    // REVERSED: the far history lands first and the bright LEAD row last, at the front, so the
    // finale punctuates exactly where the eye rests. ~1.3s in total.
    if (this._entryT < 1) {
      if (!this._entryHold) this._entryT = Math.min(1, this._entryT + dt / ENTRY_TOTAL);
      const tSec = this._entryT * ENTRY_TOTAL;
      for (let si = 0; si < SLOT_N; si++) {
        const start = (SLOT_N - 1 - si) * ENTRY_STAG; // reversed: the lead (slot 0) falls last
        const step = entryStep(tSec, start); // gravity into the plane, visible early in its own fall
        this._entryDrop[si] = ENTRY_H * step.drop;
        this._entryFade[si] = step.fade;
      }
      this._bar.setEntryDrop(this._entryDrop, this._entryFade);
      for (const t of this._tiers) t.setEntryDrop(this._entryDrop, this._entryFade);
      if (this._entryT >= 1) {
        this._bar.setEntryDrop(null, null); // park — steady frames write nothing
        for (const t of this._tiers) t.setEntryDrop(null, null);
      }
    }

    // ── the TRAIL REWIND (objects/TrailRewind.ts): the shown snapshot owns the front; rows
    // newer than it slide past the edge and dissolve. All scalar logic lives in the adapter.
    this._rewind.update(dt, this._slotOfOrd, this._advanced);
    this._advanced = false;
    this._trailOff = this._rewind.offset;
    // Hoisted per frame (the hoist rule): the SELECTED row — the one that owns the focus — or -1.
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
    // Entry ramp tail: ribbons arrive after the tiles have mostly landed (squared ease), so a
    // sheet never hangs from a tile still in the air.
    const entryRib = this._entryT >= 1 ? 1 : Math.max(0, this._entryT * 1.6 - 0.6) ** 2;
    this._entryRib = entryRib; // the threads read it through _threadFadeOf
    // The incoming lead sheet's own ease-in (see the field note) — armed the frame its spec
    // first becomes drawable, so the crossfade has two soft sides.
    const lead0 = this._slotSnap[0];
    const leadDrawn = !!(lead0 && this._specs[0].measured && this._specs[0].bandCount > 0);
    if (leadDrawn && this._leadRibOrd !== lead0.ordinal) {
      this._leadRibOrd = lead0.ordinal;
      this._leadRibT = 0;
    }
    if (this._leadRibT < 1) this._leadRibT = Math.min(1, this._leadRibT + dt / 0.65);
    const leadIn = this._leadRibT * this._leadRibT * (3 - 2 * this._leadRibT);
    this._ribbons.setRowFade(0, this._rewind.fadeAtX(LEAD_X + this._trailOff) * entryRib * leadIn);
    // The grace sheet's fade (see the field note). The unmeasured decay is sized to the gap it
    // exists to bridge — the new lead's EXACT-READ latency (~1.5-2s; the first cut's 0.8s died
    // before the new sheet could draw, which was the user's original glitch wearing a new
    // face) — then a quick crossfade once the new sheet is drawable. The grace row also keeps
    // its IDENTITY HUE while it lives (_graceSlot, read by the tile loop and the bar): the
    // colour snapped to neutral the frame the row stopped leading, which was the other half of
    // "the selection effect disappears immediately".
    this._graceSlot = -1;
    if (this._graceOrd != null && this._graceT > 0) {
      const newDrawn = !!(this._slotSnap[0] && this._specs[0].measured && this._specs[0].bandCount > 0);
      this._graceT = Math.max(0, this._graceT - dt / (newDrawn ? 0.35 : 2.5));
      let g = -1;
      for (const tr of this.model.trail) if (tr.ordinal === this._graceOrd) { g = tr.slot; break; }
      this._graceSlot = g;
      const gx = LEAD_X - g * SLOT_SP + this._trailOff;
      this._ribbons.setRowFade(3, this._graceT * this._rewind.fadeAtX(gx) * entryRib);
      if (this._graceT <= 0) {
        this._ribbons.clearRow(3);
        this._graceOrd = null;
        this._graceSlot = -1;
      }
    }
    // The threads' own boundary ramp — the SAME rewind fade the sheets and bands answer, so a
    // thread leaves the chamber exactly where its band and its tile do.
    this._ribbons.setThreadFades(this._threadFadeOf);
    this._bar.setGraceSlot(this._graceSlot);

    this._applyFloorAlpha();

    this._bar.update(dt);
    // The chamber's boundary with NOW. Hue says "filtered" without a word — the committed
    // network's identity, the neutral core when the filter is "all".
    const liveOrd = this._liveOrd();
    this._live.setState(liveEdgePhase(!this._frozen && this.model.tickOrdinal != null, liveOrd));
    const lk = this._netDimKey();
    this._live.setHue(lk === "all" ? this._core : this._laneColor(lk).getHex());
    this._live.update(dt);
    // THE REGISTER'S CARGO (one keyed map, `REGISTER_CARGO`): the block tier and the silent
    // stretches draw in the Blocks register only — outside it they are cleared at the switch, so
    // nothing of theirs is left to write.
    if (this._cargo.blocks) {
      for (const t of this._tiers) {
        t.setOffset(this._trailOff);
        t.update(dt, this._fades.alpha);
      }
      this._stretch.setOffset(this._trailOff);
      this._stretch.update(this._fades.alpha);
    }
    // (no _ribbons.update: the sheet's only per-frame value is its opacity, and setViewAlpha —
    // called every frame — writes that directly now.)

    // Before any data, and after an emptied trail once its tiles are zero-scaled, there is nothing to draw.
    if (!this._latest && this._metaLastDrawn === 0) return;
    const k = Math.min(1, dt * 3);
    const ek = emphasisK(dt); // emphasis easing — hoisted once per frame (the hoist rule)

    // ── lane tiles on the metagraph-snapshot floor
    let mi = 0;
    // Hoisted per frame (the hoist rule): one read for every lane's every tile.
    const dimNet = this._netDimKey();
    const tileRest = TILE_LOOK.rest;
    const tileInk = TILE_LOOK.ink;
    const dataMarks = this._cargo.dataMarks;
    // A focus is a SELECTED row (pinned or live-followed — how it was reached is not what it is),
    // a hovered row or a hovered tile. The bare lead is none of them: with nothing selected the
    // chamber is simply running, and stepping the whole trail back against a row it advanced onto
    // by itself would make `back` a second `rest`.
    const anyFocus = this._hoverSlot >= 0 || this._hoverTile >= 0 || pinSlot >= 0;
    this._selTilePosOk = false; // re-recorded below when the selected tile draws this frame
    for (const lane of this.model.lanes.values()) {
      const laneColor = this._laneColor(lane.id);
      const cz = this._laneCz(lane.id);
      for (const b of lane.blocks) {
        if (mi >= META_TRAIL_MAX) break;
        // A row is ONE object, so its tiles sit at EXACTLY the x its bar, ribbon and labels
        // sit at — every one of those reads the slot directly, and the tile was the only
        // instrument easing an x of its own (user, 2026-08-18: "it does not jump to the exact
        // row location and then corrects itself directly after"). Under a filtered follow the
        // tear was a full SLOT_SP: the fresh anchor shifts every slot in one event, so the tile
        // began the frame a whole slot behind the bar it hangs under and glided in late. All
        // trail motion is the ONE rewind offset; a slot is a place in time and time cuts.
        const bx = LEAD_X - b.slot * SLOT_SP;
        // No depth fade (user, 2026-08-07): every trail row eases to FULL brightness — recency
        // reads from position + the ordinal labels, not a gradient into the dark.
        b.fade += (1 - b.fade) * k;
        // The two POSITION dissolves — the rewind's front edge and the horizon at the far end.
        // A row that has finished either one is no longer IN the chamber, so it must stop
        // existing rather than linger (user, 2026-08-11): these tiles are opaque and depth-writing,
        // so a zero-brightness one is a BLACK BLOCK sitting in front of the active row, occluding
        // the ribbons and glass behind it — and the raycaster ignores `visible`, so it would still
        // eat a click. Zero-scaling is the same answer an unfilled tick already gets.
        const wx = bx + this._trailOff;
        const edge = this._rewind.fadeAtX(wx) * horizonAt(wx);
        // The entry drop's per-slot fade, hoisted above the branch: a HELD subject (entryF 0,
        // parked 2.6 units up through the transition) must zero-scale like a dissolved row —
        // brightness 0 is invisible on the dark ground but on paper it is GROUND-COLOURED INK,
        // and an opaque ground-tinted slab hanging over the planes read as a transparent ghost
        // (user, 2026-08-30 — the bands never showed this: their entry fade rides OPACITY).
        const entryF = this._entryT < 1 && b.slot >= 0 && b.slot < SLOT_N ? this._entryFade[b.slot] : 1;
        // A tick this lane anchored NOTHING into draws NOTHING (user, 2026-08-07 — the small
        // dimmed placeholder block is gone; the model keeps the slot, the mesh zero-scales).
        // …and in the Blocks register a snapshot carrying no block is not drawn (`bareTiles`).
        const bare = !this._cargo.bareTiles && !this._blockTiles.has(b);
        if (!b.filled || bare || edge <= 0 || entryF <= 0) {
          _dummy.position.set(0, 0, 0);
          _dummy.rotation.set(0, 0, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          this._metaTrailMesh.setMatrixAt(mi, _dummy.matrix);
          if (dataMarks) this._dataMarkMesh.setMatrixAt(mi, _dummy.matrix); // its mark goes with it
          b.bright = 0; // a slot that comes back eases up from dark, not from a stale row
          mi++;
          continue;
        }
        // Bottom just above the plane (user, 2026-08-07): the box is centred, so lift by half its
        // world height (geometry depth 0.35 × scale.z becomes the height under the -90° X spin).
        const tileH = TILE_D * b.size;
        // The entry drop rides the slot (0 while settled — the array only holds values mid-ramp).
        const dropY = this._entryT < 1 && b.slot >= 0 && b.slot < SLOT_N ? this._entryDrop[b.slot] : 0;
        // The tile's top at rest (`_tileTop`, the one copy of the tile arithmetic) plus this frame's
        // offsets: the rewind along the trail, the entry drop above the plane.
        this._tileTop(b, cz, _tileV);
        _tileV.x += this._trailOff;
        _tileV.y += dropY;
        _dummy.position.set(_tileV.x, _tileV.y - tileH / 2, _tileV.z);
        // The subject callout anchors THE committed snapshot's tile, not the lane lead (user,
        // 2026-08-15) — record its live position (rewind/trail offsets included) as it draws.
        if (mi === this._selTileIndex) {
          this._selTilePos.copy(_tileV);
          this._selTilePosOk = edge > 0;
        }
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
        // This lane IS the committed network — it never steps back behind a focused row
        // (dimModel · snapBright), the same rule its bands answer down on the floor.
        const mine = dimNet !== "all" && !offNet;
        const onNet = !hot && !hov && dimNet !== "all" && lane.id === dimNet;
        // COLOUR is the chamber's own independent reading: the ACTIVE row (lead/pinned), a hover
        // preview and the COMMITTED NETWORK's own tiles carry identity hue down the whole trail
        // (user, 2026-08-09), every other snapshot the neutral trail. BRIGHTNESS is the shared node
        // vocabulary — a snapshot is data, so it dims, boosts and steps back on exactly the knobs
        // the chips in the trays answer to.
        const ident = hot || hov || hovTile || onNet || b.slot <= 0 || b.slot === this._graceSlot;
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
        // (entry fade hoisted above the zero-scale branch — a held subject is not drawn at all)
        // `tileRest` is the curve's REFERENCE on paper — the tiles' own resting weight, taken
        // UNFADED so `b.fade` reads as the ratio it is rather than moving the reference itself.
        const emph = inkPresence(snapBright(tileRest * b.fade, offNet, focus, anyFocus && !rowFocus, mine), this._paper, tileRest);
        // The hue floor (TileLook.ink) maps the emphasis into [ink, 1] on paper — affine, so the
        // tier ORDER above it is untouched and only the bottom of the span is lifted off the glass.
        const brightT = (this._paper ? tileInk + (1 - tileInk) * emph : emph) * edge * this._fades.alpha * entryF;
        // Emphasis EASES rather than snapping (dimModel.emphasisK). The state rides the BLOCK, next
        // to its two other eased fields — an instance-index buffer would hand a block's brightness
        // to its neighbour every tick, since a new tick shifts every block one slot along.
        const bright = (b.bright += (brightT - b.bright) * ek);
        // GROUND (inkMix): brightness on black is a multiply toward the ground, but these tiles are
        // OPAQUE and normal-blended, so on paper the same multiply drives them toward BLACK — the
        // dimmest tile would be the heaviest mark on the page. Presence there is a lerp toward the
        // paper instead. The `edge <= 0` zero-scale above still owns a fully dissolved row.
        // THE BACKDROP IS MEASURED, NOT NAMED (2026-08-28). A pass at this pointed the lerp at
        // `c.panel` on the reasoning that a tile lies on a "near-white glass PLANE" — sampled live,
        // the plane's channels sample in the high 170s to low 190s while `c.panel` is 251, so the target
        // overshot the real backdrop by ~70/255 and every de-emphasized tile arrived BRIGHTER than the glass it
        // was supposed to sink into (user: "the snapshots in the trail are white"). The plane sits
        // within ~12/255 of `c.bg`, so the scene's own ground is the honest backdrop to measuring
        // accuracy; what was actually missing is hue at the bottom of the span, which is TileLook.ink
        // above. Thin toward the ground, floor the tint — the two answer different halves.
        this._metaTrailMesh.setColorAt(mi, inkMix(_col.copy(ident ? laneColor : this._coreCol), bright, this._colors));
        // THE DATA MARK (the Data blocks register's cargo): on the tile's top as this frame draws it,
        // in the lane's identity hue at the tile's own eased brightness (lifted so it reads on it), so
        // the dim, the focus and the boundary fades all reach it through its tile.
        if (dataMarks) {
          const n = this._dataMarkN[mi];
          if (n >= 0) {
            const h = dataMarkHeight(n);
            const w = b.size * DATA_MARK.foot;
            _dummy.position.set(_tileV.x, _tileV.y + h / 2, _tileV.z);
            _dummy.rotation.set(0, 0, 0);
            _dummy.scale.set(w, h, w);
            _dummy.updateMatrix();
            this._dataMarkMesh.setMatrixAt(mi, _dummy.matrix);
            this._dataMarkMesh.setColorAt(mi, inkMix(_col.copy(laneColor), Math.min(1, bright * DATA_MARK_GAIN), this._colors));
          } else this._zeroDataMark(mi);
        }
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
    // Every mark slot this frame did not write is zero-scaled: past the tiles drawn, and — outside the
    // register that draws them — every slot the last such frame wrote (rule 5's discipline: no stale
    // instance from another register lingers).
    const markTo = dataMarks ? mi : 0;
    if (markTo < this._dataMarkLastDrawn) for (let j = markTo; j < this._dataMarkLastDrawn; j++) this._zeroDataMark(j);
    if (dataMarks || this._dataMarkLastDrawn > 0) {
      this._dataMarkMesh.instanceMatrix.needsUpdate = true;
      if (this._dataMarkMesh.instanceColor) this._dataMarkMesh.instanceColor.needsUpdate = true;
    }
    this._dataMarkLastDrawn = markTo;
  }

  private _zeroDataMark(i: number): void {
    _dummy.position.set(0, 0, 0);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.setScalar(0);
    _dummy.updateMatrix();
    this._dataMarkMesh.setMatrixAt(i, _dummy.matrix);
  }

  dispose() {
    for (const o of this._ordLabels.values()) this._disposeOrd(o);
    this._ordLabels.clear();
    for (const p of [...this._globalPlanes, ...this._metaPlanes.values()]) p.dispose();
    this._globalPlanes.length = 0;
    this._metaPlanes.clear();
    this._bar.dispose();
    this._live.dispose();
    this._ribbons.dispose();
    for (const t of this._tiers) t.dispose();
    this._stretch.dispose();
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
