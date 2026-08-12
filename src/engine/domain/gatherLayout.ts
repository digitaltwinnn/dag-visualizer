// src/engine/domain/gatherLayout.ts
// The staging-grid layout for the view-transition choreography (spec 2026-07-17): each
// network's nodes gather into one near-square grid ("a small coloured square" — the nodes
// ARE the pixels, identity-hued), squares packed in a row sorted by size, so the DAG's big
// block reads next to the small metagraphs'. Pure 2D CELL units; the scene maps cells onto a
// camera-anchored plane at the top of the viewport per frame. Event-time only (data
// rebuilds) — allocation here is fine.

export interface GatherSlot {
  u: number; //     x, in cell units, centred on 0 across the whole staging row
  v: number; //     y, in cell units; 0 = top edge, rows DOWNWARD: v = -(row + 0.5)
  rank: number; //  row-major index within the network's grid — the stagger rank
  count: number; // the network's node count (stagger denominator)
}

export const GATHER_GUTTER = 1.5; // empty cells between adjacent network squares

/** The packed row's extent, in CELL units — what the band has to fit into the viewport. */
export interface GatherExtent {
  w: number; // total width of the packed row, gutters included
  h: number; // the tallest group's row count (grids hang DOWNWARD from the band's top edge)
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
const BOTTOM_RESERVE = 130; // --bottom-reserve, the LiveStrip lane
const RAILS_TIER = 1100; //    below this the rails are dock sheets, not inline columns
const BAND_MARGIN = 24; //     breathing room between the band and whatever bounds it

/** How far the band may grow past its tuned cell size when there is room (a sparse network set
 *  would otherwise blow up to fill the screen). Shrinking below 1 is deliberately unbounded —
 *  that is the phone-portrait case, where fitting is the whole point. Tuned live at 1600×897
 *  (2026-08-12) to the point where the FULL network set just fills the scene-mode band: below
 *  it the cap bound first and the row sat at ~65% of the width the HUD had left it, which is
 *  not "extended across the entire screen width". It stays a cap rather than a free fit because
 *  a 3-node filter has nothing to fill the band WITH — this is the chip size it tops out at. */
export const GATHER_MAX_GROWTH = 2.4;

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
// the grids actually laid out. Live groups only, biggest first (the DAG's block leads), each a
// near-square grid.
function packed(groups: { id: string; count: number }[]): { g: { id: string; count: number }; cols: number }[] {
  return groups
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .map((g) => ({ g, cols: Math.ceil(Math.sqrt(g.count)) }));
}

export function gatherExtent(groups: { id: string; count: number }[]): GatherExtent {
  const dims = packed(groups);
  const w = dims.reduce((a, d) => a + d.cols, 0) + GATHER_GUTTER * Math.max(0, dims.length - 1);
  const h = dims.reduce((a, d) => Math.max(a, Math.ceil(d.g.count / d.cols)), 0);
  return { w, h };
}

export function gatherSlots(groups: { id: string; count: number }[]): Map<string, GatherSlot[]> {
  const dims = packed(groups);
  const totalW = gatherExtent(groups).w;
  // Slots, packed left→right starting at -totalW/2.
  const out = new Map<string, GatherSlot[]>();
  let x0 = -totalW / 2;
  for (const { g, cols } of dims) {
    const slots: GatherSlot[] = [];
    for (let i = 0; i < g.count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      slots.push({ u: x0 + col + 0.5, v: -(row + 0.5), rank: i, count: g.count });
    }
    out.set(g.id, slots);
    x0 += cols + GATHER_GUTTER;
  }
  return out;
}
