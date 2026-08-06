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
// TickChange (this module's own addition, not a literal lift): `setData` needs to tell the scene
// layer WHICH metagraphs anchored so it can spawn pulses/rings for them (js/ledger.js:536-554's
// pulse-queue push). The original pushes one queue entry per NEWLY anchored snapshot (`k` from
// `prev` to `n`) directly into `this._queue` — a side effect this pure function can't perform. So
// `setData` instead returns one `{ id, count, delta }` per metagraph whose count grew this call:
// `count` is the metagraph's running anchor total for the CURRENT tick (mirrors `_tickMetas`/the
// `n` in `a.metaCounts`), `delta` is how many are NEW since the last call (`n - prev`, i.e. exactly
// how many pulses js/ledger.js would have queued). The single-metagraph pulse FILTER
// (`this._filter`, js/ledger.js:535/547) is deliberately NOT applied here — `isRowHot`'s `laneOff`
// parameter shows the same pattern: the model reports facts, the caller (which owns `filter`)
// decides what to do with them. `setData` returns changes for every anchoring metagraph regardless
// of filter; Task 13 decides which ones actually spawn a pulse.
//
// DEVIATION (documented, not fixed): js/ledger.js:555 only calls `_recomputeSelectedSlot()` when
// `a && a.metaCounts` is truthy (it's inside the same early-return guard at :534) — so on a tick
// that advances every slot but arrives with no anchor data yet, `_selectedSlot` is stale until the
// next call that does carry anchor data. Kept verbatim below rather than "fixed" (the observable
// behaviour must match js/ledger.js exactly since Task 13 will diff against it).

import { METAGRAPHS } from "../config";
import { ledgerSite } from "./ledgerLayout";
import type { GlobalSnapshot, Anchor } from "@/src/data/types";

export const SLOT_SP = 3.6; // js/ledger.js:41 — X spacing of one tick/slot
export const SLOT_N = 9; // js/ledger.js:42 — visible blocks per chain
export const BLOCK_SIZE = 0.48; // max size of an individual metagraph-snapshot tile (bumped from the
  // js/ledger.js 0.34 — the subjects read too small at the overview camera)

// js/ledger.js:45 — Z width of one lane (the grid's depth budget for anchorTiles), derived from
// ledgerSite exactly as the source does (shared by the whole METAGRAPHS roster, not per-lane).
export const LANE_GAP_Z = Math.abs(ledgerSite(1, METAGRAPHS.length).z - ledgerSite(0, METAGRAPHS.length).z);

// js/ledger.js:53 verbatim — recency fade: 1 at the freshest completed slot, 0 by the oldest visible.
export const slotFade = (slot: number): number => Math.min(1, Math.max(0, 1 - (slot - 1) / (SLOT_N - 1)));

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
  const cols = Math.min(count, Math.max(1, Math.round(Math.sqrt(count * (SLOT_SP / LANE_GAP_Z)))));
  const rows = Math.ceil(count / cols);
  const stepX = SLOT_SP / cols, stepZ = LANE_GAP_Z / rows; // uniform pitch -> consistent gaps everywhere
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

// One metagraph's anchor activity reported by a `setData` call — see the file-header note on why
// this shape (not a literal lift) is the seam between this pure model and the scene layer's pulses.
export interface TickChange {
  id: string;
  count: number; // running anchor total for the CURRENT tick (== `n` in a.metaCounts)
  delta: number; // how many are NEW since the last setData call (== how many pulses to spawn)
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
  // already turned into a TickChange" bookkeeping; cleared every new tick (js/ledger.js:525).
  private emitted = new Map<string, number>();

  // js/ledger.js:201-210 (`_lane`) verbatim, minus `color`.
  private lane(id: string, i: number): LaneState {
    let lane = this.lanes.get(id);
    if (!lane) {
      lane = { id, z: ledgerSite(i, METAGRAPHS.length).z, blocks: [] };
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
    const i = METAGRAPHS.findIndex((m) => m.id === id);
    if (i < 0) return; // unlisted — no lane
    const lane = this.lane(id, i);
    let bx = 0, bfade = 0;
    for (let j = lane.blocks.length - 1; j >= 0; j--) {
      if (lane.blocks[j].slot === 0) { bx = lane.blocks[j].x; bfade = lane.blocks[j].fade; lane.blocks.splice(j, 1); }
    }
    for (const tl of anchorTiles(count)) {
      lane.blocks.unshift({ x: bx, slot: 0, fade: bfade, ox: tl.ox, oz: tl.oz, size: tl.size, filled: true, link: tl.link, ts, count });
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
      for (let i = 0; i < METAGRAPHS.length; i++) {
        const id = METAGRAPHS[i].id;
        const nc = counts ? counts.get(id) || 0 : 0;
        const lane = this.lane(id, i);
        if (nc > 0) {
          for (const tl of anchorTiles(nc)) {
            lane.blocks.push({ x: -s * SLOT_SP, slot: s, fade: slotFade(s), ox: tl.ox, oz: tl.oz, size: tl.size, filled: true, link: tl.link, ts: snap.timestamp, count: nc });
          }
        } else {
          lane.blocks.push({ x: -s * SLOT_SP, slot: s, fade: slotFade(s), ox: 0, oz: 0, size: 0.24, filled: false, link: false, ts: snap.timestamp, count: 0 });
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

  // js/ledger.js:483-556 (`setData`) verbatim state-machine, minus every mesh/pick/pulse-queue
  // side effect (those are Task 13's scene-adapter job). `snaps` = the Global L0 buffer
  // (oldest->newest); `getAnchor(ts)` = the per-tick anchor aggregate. Returns the metagraphs whose
  // anchor count grew this call (see TickChange).
  setData(snaps: GlobalSnapshot[], getAnchor: (ts: string) => Anchor | null): TickChange[] {
    const latest = snaps && snaps.length ? snaps[snaps.length - 1] : null;
    if (!latest) return [];

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
      for (let i = 0; i < METAGRAPHS.length; i++) {
        this.lane(METAGRAPHS[i].id, i).blocks.unshift({ x: 0, slot: 0, fade: 0, ox: 0, oz: 0, size: 0.24, filled: false, link: false, ts: this.tickTs, count: 0 });
      }
    }

    // `touched` is the ms the anchor count last GREW; quiet for LEAD_SETTLE_MS = settled.
    this.leadForming = !!a && Date.now() - a.touched < LEAD_SETTLE_MS;

    if (!a || !a.metaCounts) { this.leadForming = false; return []; } // see file-header DEVIATION note — verbatim quirk

    const changes: TickChange[] = [];
    for (const [id, n] of a.metaCounts) {
      const prev = this.emitted.get(id) || 0;
      if (n <= prev) continue;
      const i = METAGRAPHS.findIndex((m) => m.id === id);
      if (i < 0) { this.emitted.set(id, n); continue; } // unlisted: no lane, but don't re-check
      this.anchorMetaBlock(id, n, this.tickTs ?? ""); // draw the real block at the lead now + animate the anchoring
      changes.push({ id, count: n, delta: n - prev });
      this.emitted.set(id, n);
    }
    this.recomputeSelectedSlot(); // slots just shifted on a new tick -> refresh which slot is selected
    return changes;
  }

  // js/ledger.js:560-563 (`setSelected`) verbatim.
  setSelected(ordinal: number | null): void {
    this.selectedOrd = ordinal == null ? null : ordinal;
    this.recomputeSelectedSlot();
  }

  // js/ledger.js:640 verbatim — the binary colour rule: colour belongs to the LIVE lead (slot<=0)
  // OR to a SELECTED older snapshot (exclusively — selecting one neutralises the live lead), never
  // to a filtered-out lane.
  isRowHot(laneOff: boolean, slot: number): boolean {
    return !laneOff && (this.selectedSlot > 0 ? slot === this.selectedSlot : slot <= 0);
  }
}
