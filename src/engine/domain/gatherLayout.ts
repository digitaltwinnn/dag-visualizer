// src/engine/domain/gatherLayout.ts
// The staging-grid layout for the view-transition choreography (spec 2026-07-17): each
// network's nodes gather into one coloured block (the nodes ARE its pixels, identity-hued),
// blocks packed in a row sorted by size, so the DAG's big block reads next to the small
// metagraphs'. Pure 2D CELL units; the scene maps cells onto a camera-anchored plane at the top
// of the viewport per frame. Event-time only (data rebuilds, and a band whose solved depth
// changed) — allocation here is fine.
//
// ⚠️ THE BLOCK IS WIDTH-FIRST, NOT A SQUARE (user, 2026-08-13 — "use the available width
// optimally … currently in scene mode DAG does ~10 rows down while we instead should use the
// available width first, only then start placing nodes on more rows down"). It was
// `cols = ceil(√count)`, which is width-AGNOSTIC: the DAG's 162 nodes packed a 13×13 block that
// hung ten rows down the viewport while scene mode's band still had hundreds of unused pixels
// either side. The DEPTH is now solved against the band (`gatherRows`) and the columns fall out
// of it, so a block fills the width it is given before it wraps, and the wider band answers with
// a longer, shallower block instead of a bigger one.
//
// ⚠️ SLACK CAN NEVER BECOME SIZE (user, 2026-08-13 — "again the nodes have become very large in
// scene mode; you fixed it once but broke it again; find a structural fix that does not
// reappear"). The chip pitch is a FIXED world constant (Globe's GATHER_CELL) and the fit may only
// ever shrink below it, so a band with room to spare has exactly two things to spend it on:
// columns (a shallower block) and then the gutters between blocks (`gatherSpread`). That is the
// structural half of the answer — before it the fit could GROW the pitch up to a cap, which meant
// the two presentations only matched while the cap happened to bind in both, and any viewport
// that moved one of them off the cap re-opened the bug. There is no longer a size the band can
// argue for: it is the same chip everywhere, and only genuine overflow makes it smaller.

export interface GatherSlot {
  u: number; //     x, in cell units, centred on 0 across the whole staging row
  v: number; //     y, in cell units; 0 = top edge, rows DOWNWARD: v = -(row + 0.5)
  rank: number; //  row-major index within the network's grid — the stagger rank
  count: number; // the network's node count (stagger denominator)
  /** The slot's own GROUP index, centred: `i - (n-1)/2`. Multiplied by the spare gutter the
   *  band can afford (gatherSpread) it slides whole blocks apart without touching the pitch
   *  INSIDE them — which is how leftover width buys spacing instead of chip size. */
  gs: number;
}

export const GATHER_GUTTER = 2.2; // empty cells between adjacent network blocks, always
export const GATHER_GUTTER_MAX = 9; // …and the most spare width may open it to

/** The packed row's extent, in CELL units — what the band has to fit into the viewport. */
export interface GatherExtent {
  w: number; // total width of the packed row, gutters included
  h: number; // the deepest group's row count (blocks hang DOWNWARD from the band's top edge)
  gaps: number; // gutters in the row (groups - 1) — what spare width is shared between
}

// ── Where the band sits in the viewport ────────────────────────────────────────
// The staging row is furniture-adjacent: it has to clear the HUD it flies in front of. These
// are MIRRORS of the layout tokens in app/globals.css (the same "keep in sync" arrangement
// RailThread uses for the thread ruler, and for the same reason — the engine can't resolve a
// var()). The canvas rides `--topbar-extra` exactly as the rails do, so the grown filter strip
// cancels out and the rails' top is `--rail-top` in CANVAS-local pixels whatever the bar does.
const RAIL_TOP = 90; //        --rail-top: top of both rails, i.e. the top of the first card
const RAIL_GUTTER = 26; //     both rails' outer margin
const LEFT_RAIL_W = 264; //    --rail-w
const RIGHT_RAIL_W = 320; //   --detail-w
const BOTTOM_RESERVE = 130; // --bottom-reserve at its LEDGER value — the LiveStrip lane. Kept as a
//                            constant rather than read per view: the lane only mounts in ledger, so
//                            in hyper/geo this reserves ~130px the band could have used. Measured,
//                            that band is far taller than the pack ever needs (33 rows available vs
//                            ~7 used), so the depth search never reaches the bound and the layout is
//                            identical either way. It stays as the conservative floor.
const RAILS_TIER = 1100; //    below this the rails are dock sheets, not inline columns
const BAND_MARGIN = 24; //     breathing room between the band and whatever bounds it

/**
 * How many rows deep the packed row has to go to fit `budgetCells` of width: the SMALLEST depth
 * whose packed width fits, so each block fills the width available to it before it wraps
 * (user, 2026-08-13 — "use the available width first, only then start placing nodes on more rows
 * down"). `budgetCells` is the band measured in REAL chip pitches — the pitch the fit will
 * actually draw at — so the pack that fits the budget is by construction one the chips are drawn
 * at full size in, and a wider band answers with a longer block rather than a bigger one.
 *
 * Columns fall out of the depth (`ceil(count / rows)`), so a group smaller than the depth is one
 * column tall — no group is ever deeper than the answer, and the blocks all hang from the same
 * top edge. With no band measured yet (first data load, before any transition frame) it answers
 * the near-square the row used to pack; the first fit replaces it.
 *
 * ⚠️ THE SEARCH STOPS AT `maxRows`, WHICH IS THE BAND'S OWN HEIGHT — not at a near-square (user,
 * 2026-08-13, twice: "use the screen width optimally before adding rows … vertical only when
 * horizontal runs out", and before that "size should be same, just use the width better in scene
 * mode"). Some ceiling is needed, because a band too narrow to hold ANY pack is the phone case
 * and an uncapped search walks to one column per group — the DAG's 162 nodes in a single
 * 162-row thread, which the fit then shrinks to dust. `ceil(√deepest)` was that ceiling and it is
 * the wrong one: it is width-AGNOSTIC, so it stopped the search at a shape the band had nothing
 * to do with, and shrinking took over while there was still vertical room going unused. The
 * height the band actually has says exactly when horizontal has run out — every row up to it is
 * free, and past it a row would not fit on screen anyway. `deepest` bounds it because beyond that
 * every group is already one column and depth buys nothing.
 */
export function gatherRows(groups: { id: string; count: number }[], budgetCells: number, maxRows = 0): number {
  const counts = groups.filter((g) => g.count > 0).map((g) => g.count);
  if (!counts.length) return 1;
  const deepest = Math.max(...counts);
  const square = Math.ceil(Math.sqrt(deepest)); // the width-agnostic pack: the unmeasured answer
  if (!Number.isFinite(budgetCells) || budgetCells <= 0) return square;
  const cap = Number.isFinite(maxRows) && maxRows >= 1 ? Math.min(Math.floor(maxRows), deepest) : square;
  const gutters = GATHER_GUTTER * (counts.length - 1);
  for (let rows = 1; rows < cap; rows++) {
    let w = gutters;
    for (const c of counts) w += Math.ceil(c / rows);
    if (w <= budgetCells) return rows;
  }
  return cap;
}

/**
 * The extra gutter, in cells, that the leftover width buys: with the chip size and the pack's
 * depth both already decided, what is left over can only be spent on the space BETWEEN the
 * blocks. `availCells` is the band measured in the fitted cell pitch, so this reads as "cells of
 * slack, shared between the gaps". The solve is integer — a row is a whole column wider or
 * narrower — so there is always a remainder for this to take up. Capped so two networks can't fly
 * to opposite edges of a wide screen, and never negative: a band too narrow for the packed row is
 * the fit's problem, not the spacing's.
 */
export function gatherSpread(availCells: number, extent: GatherExtent): number {
  if (extent.gaps <= 0 || !Number.isFinite(availCells)) return 0;
  const extra = (availCells - extent.w) / extent.gaps;
  return Math.max(0, Math.min(GATHER_GUTTER_MAX - GATHER_GUTTER, extra));
}

/** The band's box, expressed against the camera frustum so the scene can use it at any pose. */
export interface GatherBand {
  /** Fraction of the frustum HALF-height above centre where the band's TOP EDGE sits. */
  topFrac: number;
  /** Fraction of the frustum HALF-width the band may span each side of centre. */
  halfWidthFrac: number;
  /** Fraction of the frustum HALF-height available below the top edge. */
  heightFrac: number;
}

/**
 * The band is anchored to the rail cards' own top edge (user, 2026-08-12 — "make the top aligned
 * with the top of the rail cards, so just a bit below the top bar"), and spans the width the HUD
 * leaves it: between the two rails when they're there, the whole viewport when they're not
 * ("in scene-mode the placement can be more extended across the entire screen width as the cards
 * are not present"). Centred on the SCREEN rather than on the gap, so the band doesn't slide
 * sideways when the rails come and go — it just gets wider — which means the binding rail is
 * whichever reaches further in, the right one.
 *
 * ⚠️ The band is what the pack is SOLVED against (user, 2026-08-13), not just what it is drawn
 * into: `gatherRows` reads its width in real chip pitches and answers with a depth, so scene
 * mode's extra width comes back as a longer, shallower block at the same chip size. Sizing the
 * chips off this width instead — which is what it used to do — is what made the same nodes stage
 * larger in scene mode than in HUD mode.
 */
export function gatherBand(viewW: number, viewH: number, railsHidden: boolean): GatherBand {
  const railed = !railsHidden && viewW >= RAILS_TIER;
  const reach = railed ? RAIL_GUTTER + Math.max(LEFT_RAIL_W, RIGHT_RAIL_W) : 0;
  const halfWidthPx = Math.max(1, viewW / 2 - reach - BAND_MARGIN);
  return {
    // A point `f` half-heights above centre lands at `viewH/2 * (1 - f)` pixels from the top.
    topFrac: 1 - (2 * RAIL_TOP) / viewH,
    halfWidthFrac: halfWidthPx / (viewW / 2),
    heightFrac: Math.max(0, viewH - RAIL_TOP - BOTTOM_RESERVE - BAND_MARGIN) / (viewH / 2),
  };
}

// The packing pass both public functions read, so the measured extent is always the extent of
// the blocks actually laid out. Live groups only, biggest first (the DAG's block leads), each
// `rows` deep at most — the columns follow from the depth, which is what makes the pack
// width-first.
function packed(groups: { id: string; count: number }[], rows: number): { g: { id: string; count: number }; cols: number }[] {
  const r = Number.isFinite(rows) && rows >= 1 ? Math.floor(rows) : 1;
  return groups
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .map((g) => ({ g, cols: Math.ceil(g.count / r) }));
}

export function gatherExtent(groups: { id: string; count: number }[], rows: number): GatherExtent {
  const dims = packed(groups, rows);
  const gaps = Math.max(0, dims.length - 1);
  const w = dims.reduce((a, d) => a + d.cols, 0) + GATHER_GUTTER * gaps;
  const h = dims.reduce((a, d) => Math.max(a, Math.ceil(d.g.count / d.cols)), 0);
  return { w, h, gaps };
}

export function gatherSlots(groups: { id: string; count: number }[], rows: number): Map<string, GatherSlot[]> {
  const dims = packed(groups, rows);
  const totalW = gatherExtent(groups, rows).w;
  const mid = (dims.length - 1) / 2;
  // Slots, packed left→right starting at -totalW/2.
  const out = new Map<string, GatherSlot[]>();
  let x0 = -totalW / 2;
  for (let gi = 0; gi < dims.length; gi++) {
    const { g, cols } = dims[gi];
    const slots: GatherSlot[] = [];
    for (let i = 0; i < g.count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      slots.push({ u: x0 + col + 0.5, v: -(row + 0.5), rank: i, count: g.count, gs: gi - mid });
    }
    out.set(g.id, slots);
    x0 += cols + GATHER_GUTTER;
  }
  return out;
}
