// Pure state machine behind the Snapshots (ledger) view. Extracted verbatim (with source
// comments, incl. the js/ledger.js:NN line citations below) from js/ledger.js — js/ledger.js is
// deleted (5cb3efd). Consumed by scene/views/LedgerView.ts (named "LedgerChamber" in the design
// notes below, shipped as LedgerView).
//
// js/ledger.js entangles STATE (which slot a block sits in, its fade/size/position) with MESHES
// (the block IS a THREE.Mesh; the trail entry holds `{ mesh, slot, ordinal }`). This module keeps
// only the state fields a mesh would otherwise carry — `x`/`fade`/`size`/`filled`/`ox`/`oz`/`link`
// — and drops the mesh reference entirely; Task 13 pairs model rows to meshes by array index
// (lane.blocks[i] <-> instance i) / by ordinal (trail entries <-> trail meshes), the same way the
// scene layer already pairs LedgerModel-shaped data to InstancedMesh slots elsewhere in this
// refactor (see arcSim.ts's `flashHits` index channel for the analogous pattern).
//
// RETIRED 2026-08-12 — `TickChange`, the `{ id, count, delta }` return `setData` used to hand the
// scene layer so it could spawn one anchor PULSE per newly anchored snapshot (js/ledger.js:536-554's
// pulse-queue push, the one part of this module that was never a literal lift). The pulses are gone
// from LedgerView — see its header for why — and nothing else ever read the return, so the seam went
// with them and `setData` is a command again. What stays is the `emitted` map: it is not
// change-reporting bookkeeping, it is the gate that keeps `anchorMetaBlock` from rebuilding a lane's
// lead cluster on every poll that reports the same count.
//
// DEVIATION (documented, not fixed): js/ledger.js:555 only calls `_recomputeSelectedSlot()` when
// `a && a.metaCounts` is truthy (it's inside the same early-return guard at :534) — so on a tick
// that advances every slot but arrives with no anchor data yet, `_selectedSlot` is stale until the
// next call that does carry anchor data. Kept verbatim below rather than "fixed" (the observable
// behaviour must match js/ledger.js exactly since Task 13 will diff against it).

import { METAGRAPHS } from "../config";
import { ledgerSite, lanePlaneHalf, LEAD_X } from "./ledgerLayout";
import { UNLISTED_KEY } from "./ledgerBands";
import type { GlobalSnapshot, Anchor } from "@/src/data/types";

/** The lane roster (user, 2026-08-07): every listed metagraph plus ONE "unknown" lane for the
 *  unlisted channels, at the END of the order — the +Z / screen-LEFT edge of the field, matching
 *  the byte bar's unlisted band (always appended last), so the ribbon between them never crosses
 *  a listed one. The unknown lane's counts come ONLY from the exact read (see LedgerView.setData:
 *  the polled floor is transiently high while a tick settles, and lane tiles never shrink). */
export const LANE_IDS: readonly string[] = [...METAGRAPHS.map((m) => m.id), UNLISTED_KEY];

export const SLOT_SP = 3.6; // js/ledger.js:41 — X spacing of one tick/slot
export const SLOT_N = 9; // js/ledger.js:42 — visible blocks per chain
export const BLOCK_SIZE = 0.48; // max size of an individual metagraph-snapshot tile (a 0.72 bump
  // was tried and reverted the same day, 2026-08-07; originally 0.34)

// The grid's DEPTH BUDGET: the width of the glass plane a lane's tiles actually rest on — NOT the
// lane's centre-to-centre spacing (user, 2026-08-12: "the tiles are a bit too large (for DOR)").
// Those are different numbers, because `lanePlaneHalf` insets each plane by half of LANE_PLANE_GAP
// so neighbouring planes never touch. Budgeting against the spacing (2.48 at the shipped roster,
// vs the plane's 1.88) planned a grid 32% wider than its own surface: from count 9 up, DOR's tiles
// hung off the glass on both sides. Sizes and offsets alike are in DRAWN units now, so LedgerView
// places `oz` as-is — the previous partial rescale there corrected the positions onto the lane's
// slice while leaving `size` computed against a pitch nothing ever draws.
export const LANE_GRID_Z = 2 * lanePlaneHalf(LANE_IDS.length);

// js/ledger.js:53 verbatim — recency fade: 1 at the freshest completed slot, 0 by the oldest visible.
export const slotFade = (slot: number): number => Math.min(1, Math.max(0, 1 - (slot - 1) / (SLOT_N - 1)));

// ── the HORIZON (user, 2026-08-09: "the snapshot lanes etc logically go all the way to the back
// since there will be many historic snapshots; how can we visualize this because currently there is
// a hard edge"). The trail runs away from the camera along −X, and both the glass planes and the
// rows on them simply STOPPED: the planes at their own geometric edge (rim band and all), the rows
// at full brightness in the last slot. The chamber read as a finite box rather than a window onto a
// chain that keeps going.
//
// This is NOT the recency fade `slotFade` describes and the trail deliberately does not use (see
// LedgerView's "No depth fade" note): it is a TERMINAL DISSOLVE at the trail's far boundary — the
// exact mirror of `frontAt` below, which dissolves rows sliding off the FRONT edge.
// Recency is still position plus the ordinal labels: `HORIZON_X` is placed beyond the last visible
// slot, so 8 of the 9 rows stay at full brightness and only the oldest has begun to go.
//
// ONE band for the furniture and the rows alike, because they must agree: the glass has to be gone
// before its own back edge is reached, and a row must not float on glass that has already left.
export const HORIZON_X = LEAD_X - (SLOT_N + 0.6) * SLOT_SP;
export const HORIZON_SPAN = 2.2 * SLOT_SP;

/** How present the chamber still is at a group-X of `x`: 1 in the lit body, easing to 0 at the
 *  horizon. Feed it the row's LIVE x (its rewind offset included), so the band stays put in the
 *  world while the trail slides through it. */
export const horizonAt = (x: number): number =>
  Math.min(1, Math.max(0, (x - HORIZON_X) / HORIZON_SPAN));

/** The trail's OTHER boundary, and it lives here beside the horizon for the same reason that one
 *  does: every instrument riding the trail has to agree about where the chamber ends, or one of
 *  them floats past the edge on its own. 1 at or behind the lead position, dissolving within one
 *  slot of travel once the rewind has pushed the row past the front edge.
 *
 *  ⚠️ SEEDS ARE ROWS TOO (user, 2026-08-18 — filter on a metagraph and let it follow: "these
 *  forming blocks are drawn in front, outside of the panel"). Under a filtered follow the rewind
 *  holds the network's own newest anchored tick at the lead, so every global tick that anchored
 *  nothing of that network sits AHEAD of the front edge — measured ones dissolved there, but the
 *  byte bar's unmeasured SEED branch multiplied only the horizon and hung in the air off the glass.
 *  The rows are not dropped and must not be: when the network anchors again the offset eases back
 *  and they slide onto the panel, in their own place in time. POSITION IS TIME, so a row is shown
 *  where its tick belongs and dissolves when that is off the chamber — never pinned to the glass to
 *  keep it visible. */
export const frontAt = (x: number): number => {
  const over = (x - LEAD_X) / (SLOT_SP * 0.9);
  return over <= 0 ? 1 : Math.max(0, 1 - over);
};

/** Is a row at group-X `x` still ON the chamber — inside BOTH boundaries, so any of it is drawn?
 *
 *  ⚠️ Three's raycaster ignores every visual state a mesh carries (measured 2026-08-18: with an
 *  older tick pinned, the tick one slot NEWER than it — `frontAt` 0, nothing on screen — answered
 *  22 of 47 hover samples over the empty air in front of the lead, and a click there would have
 *  committed it). Opacity is not the only thing a boundary has to reach: a row the eye has been
 *  told is gone must leave the pick set with it, or the chamber's front edge is honest in one
 *  channel and lying in the other. The trail's instruments fade on the ramps; a PICK is binary, so
 *  it asks the one question the ramps can't answer between them. */
export const rowOnChamber = (x: number): boolean => horizonAt(x) > 0 && frontAt(x) > 0;

// ── the LIVE EDGE (user, 2026-08-18: "what if we don't show an actual snapshot for [forming], but
// instead a dim line in front of the snapshots with some relevant info about what's happening, to
// indicate it's forming, live, filtered"). The third boundary, and the only one that is not a
// dissolve — it is where the chamber meets NOW.
//
// The forming tick used to be drawn as the lead ROW: a seed lying in slot 0. That put a thing with
// no measurement into the place the slot model reserves for a tick's real position in time, and
// under a filtered follow the two claims collided — the rewind holds the network's own newest
// anchored tick at the lead, so a global tick that anchored nothing of it belongs AHEAD of the
// front edge and dissolved there, taking the one mark that said a read was in flight with it.
//
// A tick whose read has not landed is not a row yet, so it is stated as an INSTRUMENT STATE
// instead: one dim line fixed in the chamber frame, ahead of the lead, spanning the whole lane
// field. Lying flush and spanning everything it makes no width claim (ledgerBands.ts forbids
// inferring a width from anchor count or fee) and it is not pickable — there is no snapshot there
// to select. When the read lands the row RISES into its bands at the lead exactly as before, so
// the arrival beat is untouched; and when the followed network anchors again, the rewind eases the
// intervening ticks onto the panel on their own.
//
// FIXED IN THE FRAME, so it must not be parented to anything the rewind offsets — it marks now,
// and now does not slide with the trail.
export const LIVE_X = LEAD_X + 1.2;

/** What the live edge is saying — carried by the line's own behaviour, since it wears no label
 *  (the rationale for that is in `scene/objects/LiveEdge.ts`). `forming` — a tick has arrived and
 *  its exact read is in flight, so the line BREATHES on the calm beat. `standby` — nothing is in
 *  flight (the newest tick is measured, or its read gave up and states that as its own still row),
 *  so the line RESTS: quiet standby, never a promise of an arrival that isn't coming. `off` — no
 *  feed at all, so the edge itself is a claim the chamber can't make. */
export type LiveEdgePhase = "off" | "forming" | "standby";

/** The one resolver. `formingOrd` is the newest tick's ordinal while its read is genuinely in
 *  flight, null otherwise — the same predicate that mutes the lead row's seed, so the line and the
 *  slot can never both claim the tick. */
export const liveEdgePhase = (running: boolean, formingOrd: number | null): LiveEdgePhase =>
  !running ? "off" : formingOrd == null ? "standby" : "forming";

// A tick keeps collecting metagraph snapshots for seconds after it appears (the anchor index's
// `touched` grows). The lead row says so rather than pretending it is final — the same ~7s window
// AnchoredTags uses for its FLOOR/COMPLETE gate. The BAR below does not settle: once the exact
// read measures it, it is final.
export const LEAD_SETTLE_MS = 7000;

export interface TileSpec {
  ox: number;
  oz: number;
  size: number;
  link: boolean;
}

// js/ledger.js:212-233 (`_anchorTiles`) verbatim. Each anchored snapshot is a SEPARATE tile (no
// cap), laid out as a rectangular GRID with uniform pitch, inset (centred) so an edge tile never
// touches the neighbouring tick/lane. The k=0 tile carries the single anchor link.
export function anchorTiles(count: number): TileSpec[] {
  if (count <= 1) return [{ ox: 0, oz: 0, size: BLOCK_SIZE, link: true }];
  const cols = Math.min(count, Math.max(1, Math.round(Math.sqrt(count * (SLOT_SP / LANE_GRID_Z)))));
  const rows = Math.ceil(count / cols);
  const stepX = SLOT_SP / cols, stepZ = LANE_GRID_Z / rows; // uniform pitch -> consistent gaps everywhere
  const size = Math.min(BLOCK_SIZE, 0.7 * Math.min(stepX, stepZ));
  const x0 = -((cols - 1) * stepX) / 2, z0 = -((rows - 1) * stepZ) / 2;
  const tiles: TileSpec[] = [];
  for (let k = 0; k < count; k++) {
    const r = Math.floor(k / cols), c = k % cols;
    const inRow = Math.min(cols, count - r * cols); // tiles in this row (last row may be short)
    const ox = x0 + ((cols - inRow) / 2) * stepX + c * stepX; // centre a partial last row
    const oz = rows > 1 ? z0 + r * stepZ : 0;
    tiles.push({ ox, oz, size, link: k === 0 });
  }
  return tiles;
}

// js/ledger.js:127 (`_metaLanes` block shape, minus the mesh) — one lane block's state.
export interface LaneBlock {
  x: number;
  slot: number;
  fade: number;
  /** Eased emphasis BRIGHTNESS — see LedgerView's tile loop. Per-block, not per instance index:
   *  a tick pushes a block and drops the oldest, so an index-keyed buffer hands one block's eased
   *  state to its neighbour every tick. Lives here beside `x` and `fade`, the block's other two
   *  eased fields, and is preserved across a slot-0 rebuild for the same reason they are. */
  bright: number;
  size: number;
  filled: boolean;
  ox: number;
  oz: number;
  link: boolean;
  ts: string;     // the anchoring global tick's timestamp — the tile's identity join (spec §6.1)
  count: number;  // snapshots this metagraph anchored into this tick
}

// js/ledger.js:127/202-210 (`_metaLanes` entry, minus `color` — a scene-layer concern, resolved
// from `sceneColors`/METAGRAPHS by id, not domain state).
export interface LaneState {
  id: string;
  z: number;
  blocks: LaneBlock[];
}

export class LedgerModel {
  // js/ledger.js:122 (`_trail`), minus `mesh` — `{ ordinal, slot, ts }` is exactly what a scene-layer
  // trail mesh needs looked up by index/ordinal. `ts` is that COMPLETED tick's own timestamp (not
  // the live tick's) — trail entries are historical only; the live tick is tracked via `tickOrdinal`/
  // `tickTs` and its lanes' slot-0 blocks, never as a trail member (see the redesign test file).
  trail: { ordinal: number; slot: number; ts: string }[] = [];
  // js/ledger.js:127 (`_metaLanes`), keyed by metagraph id (unchanged key).
  lanes: Map<string, LaneState> = new Map();
  // js/ledger.js:110 (`_tickOrdinal`).
  tickOrdinal: number | null = null;
  // The live tick's own timestamp — the identity join a slot-0 tile's `LaneBlock.ts` mirrors.
  tickTs: string | null = null;
  // True while the live tick's anchor count is still growing (within LEAD_SETTLE_MS of its last
  // growth) — the lead row is a WORK IN PROGRESS, not a final count, until this goes quiet.
  leadForming = false;
  // js/ledger.js:114 (`_selectedOrd`).
  selectedOrd: number | null = null;
  // js/ledger.js:115 (`_selectedSlot`), same -1 "nothing selected" sentinel.
  selectedSlot = -1;

  // js/ledger.js:109 (`_emitted`) — per-CURRENT-tick "how much of this metagraph's count have we
  // already drawn" bookkeeping; cleared every new tick (js/ledger.js:525).
  private emitted = new Map<string, number>();

  // js/ledger.js:201-210 (`_lane`) verbatim, minus `color`.
  private lane(id: string, i: number): LaneState {
    let lane = this.lanes.get(id);
    if (!lane) {
      lane = { id, z: ledgerSite(i, LANE_IDS.length).z, blocks: [] };
      this.lanes.set(id, lane);
    }
    return lane;
  }

  // js/ledger.js:235-249 (`_anchorMetaBlock`) verbatim, minus the mesh/link-draw side effects.
  // A metagraph anchored into the LIVE tick -> (re)build its slot-0 cluster: one tile per anchored
  // snapshot, preserving the current slot-0 x/fade (so the caller's easing continues smoothly).
  // `ts` is the live tick's timestamp (the caller's `this.tickTs`), threaded onto every tile so a
  // slot-0 block can name the snapshot it belongs to without a lookup.
  private anchorMetaBlock(id: string, count: number, ts: string): void {
    const i = LANE_IDS.indexOf(id);
    if (i < 0) return; // not a lane (an unlisted ADDRESS — those aggregate into the unknown lane)
    const lane = this.lane(id, i);
    let bx = 0, bfade = 0, bbright = 0;
    for (let j = lane.blocks.length - 1; j >= 0; j--) {
      if (lane.blocks[j].slot === 0) {
        bx = lane.blocks[j].x;
        bfade = lane.blocks[j].fade;
        bbright = lane.blocks[j].bright;
        lane.blocks.splice(j, 1);
      }
    }
    for (const tl of anchorTiles(count)) {
      lane.blocks.unshift({ x: bx, slot: 0, fade: bfade, bright: bbright, ox: tl.ox, oz: tl.oz, size: tl.size, filled: true, link: tl.link, ts, count });
    }
  }

  // js/ledger.js:366-393 (`_seedHistory`) verbatim, minus mesh construction. Pre-populates the
  // trail + lanes from the retained snapshot window so the chain isn't empty on entry. Called once,
  // on the first call with more than one snapshot (`setData` guards this the same way).
  private seedHistory(snaps: GlobalSnapshot[], getAnchor: (ts: string) => Anchor | null): void {
    const n = snaps.length;
    const count = Math.min(SLOT_N, n - 1); // ticks behind the latest (the latest is the live centre)
    for (let s = 1; s <= count; s++) {
      const snap = snaps[n - 1 - s];
      this.trail.push({ ordinal: snap.ordinal, slot: s, ts: snap.timestamp });
      const a = getAnchor ? getAnchor(snap.timestamp) : null;
      const counts = a && a.metaCounts ? a.metaCounts : null;
      for (let i = 0; i < LANE_IDS.length; i++) {
        const id = LANE_IDS[i];
        const nc = counts ? counts.get(id) || 0 : 0;
        const lane = this.lane(id, i);
        if (nc > 0) {
          for (const tl of anchorTiles(nc)) {
            lane.blocks.push({ x: LEAD_X - s * SLOT_SP, slot: s, fade: slotFade(s), bright: 0, ox: tl.ox, oz: tl.oz, size: tl.size, filled: true, link: tl.link, ts: snap.timestamp, count: nc });
          }
        } else {
          lane.blocks.push({ x: LEAD_X - s * SLOT_SP, slot: s, fade: slotFade(s), bright: 0, ox: 0, oz: 0, size: 0.24, filled: false, link: false, ts: snap.timestamp, count: 0 });
        }
      }
    }
  }

  // js/ledger.js:572-577 (`_recomputeSelectedSlot`) verbatim. Maps the selected ordinal -> its
  // current slot (0 = the live centre; else find it in the trail; -1 = not selected/not found).
  private recomputeSelectedSlot(): void {
    if (this.selectedOrd == null) { this.selectedSlot = -1; return; }
    if (this.selectedOrd === this.tickOrdinal) { this.selectedSlot = 0; return; }
    const t = this.trail.find((x) => x.ordinal === this.selectedOrd);
    this.selectedSlot = t ? t.slot : -1;
  }

  // js/ledger.js:483-556 (`setData`) verbatim state-machine, minus every mesh/pick side effect
  // (those are the scene adapter's job). `snaps` = the Global L0 buffer (oldest->newest);
  // `getAnchor(ts)` = the per-tick anchor aggregate.
  setData(snaps: GlobalSnapshot[], getAnchor: (ts: string) => Anchor | null): void {
    const latest = snaps && snaps.length ? snaps[snaps.length - 1] : null;
    if (!latest) return;

    // First data after entering the view: seed the trail + lanes from the retained history so it's
    // already built up (instead of filling in live over the next ~SLOT_N ticks).
    if (this.tickOrdinal === null && snaps.length > 1) this.seedHistory(snaps, getAnchor);

    const isNewTick = latest.ordinal !== this.tickOrdinal;
    const a = getAnchor ? getAnchor(latest.timestamp) : null;

    if (isNewTick) {
      // The previous snapshot completed -> drop it into the global trail (carrying ITS OWN
      // timestamp, captured before `tickTs` is overwritten below) and advance every lane one slot;
      // then seed the new live tick with an empty placeholder at slot 0 for each metagraph
      // (upgraded to a real block when it anchors).
      if (this.tickOrdinal !== null) {
        for (const t of this.trail) t.slot += 1;
        this.trail.unshift({ ordinal: this.tickOrdinal, slot: 1, ts: this.tickTs ?? "" });
        while (this.trail.length > SLOT_N) this.trail.pop();

        for (const lane of this.lanes.values()) {
          for (const b of lane.blocks) b.slot += 1;
          while (lane.blocks.length && lane.blocks[lane.blocks.length - 1].slot > SLOT_N) lane.blocks.pop();
        }
      }
      this.emitted.clear();
      this.tickOrdinal = latest.ordinal;
      this.tickTs = latest.timestamp;
      // The new LIVE tick starts with an empty placeholder at slot 0 for EVERY metagraph (shown on
      // the latest too); anchorMetaBlock upgrades it to a real, sized block if the metagraph anchors.
      for (let i = 0; i < LANE_IDS.length; i++) {
        this.lane(LANE_IDS[i], i).blocks.unshift({ x: 0, slot: 0, fade: 0, bright: 0, ox: 0, oz: 0, size: 0.24, filled: false, link: false, ts: this.tickTs, count: 0 });
      }
    }

    // `touched` is the ms the anchor count last GREW; quiet for LEAD_SETTLE_MS = settled.
    this.leadForming = !!a && Date.now() - a.touched < LEAD_SETTLE_MS;

    if (!a || !a.metaCounts) { this.leadForming = false; return; } // see file-header DEVIATION note — verbatim quirk

    for (const [id, n] of a.metaCounts) {
      const prev = this.emitted.get(id) || 0;
      if (n <= prev) continue;
      const i = LANE_IDS.indexOf(id);
      if (i < 0) { this.emitted.set(id, n); continue; } // an unlisted ADDRESS: not a lane, but don't re-check
      this.anchorMetaBlock(id, n, this.tickTs ?? ""); // draw the real block at the lead now
      this.emitted.set(id, n);
    }
    this.recomputeSelectedSlot(); // slots just shifted on a new tick -> refresh which slot is selected
  }

  // js/ledger.js:560-563 (`setSelected`) verbatim.
  setSelected(ordinal: number | null): void {
    this.selectedOrd = ordinal == null ? null : ordinal;
    this.recomputeSelectedSlot();
  }

  /** Ordinal → its current slot (0 = the live lead, else its trail slot, −1 = not visible).
   *  The REWIND's offset target reads this for the COMMITTED pin — deliberately separate from
   *  `selectedSlot`, which also follows the transient hover (hover previews the hot row IN
   *  PLACE; only a click moves the trail — user, 2026-08-07). */
  slotOf(ordinal: number): number {
    if (ordinal === this.tickOrdinal) return 0;
    const t = this.trail.find((x) => x.ordinal === ordinal);
    return t ? t.slot : -1;
  }

  // The binary colour rule: colour belongs to the LIVE lead (slot<=0) OR to a SELECTED older
  // snapshot (exclusively — selecting one neutralises the live lead). (The laneOff parameter went
  // with the off-filter dim, 2026-08-07 — a committed filter changes the camera, never a row.)
  isRowHot(slot: number): boolean {
    return this.selectedSlot > 0 ? slot === this.selectedSlot : slot <= 0;
  }
}
