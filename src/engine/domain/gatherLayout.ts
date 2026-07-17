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

export function gatherSlots(groups: { id: string; count: number }[]): Map<string, GatherSlot[]> {
  const live = groups.filter((g) => g.count > 0).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  // First pass: each group's grid dims + the packed row's total width (in cells).
  const dims = live.map((g) => {
    const cols = Math.ceil(Math.sqrt(g.count));
    return { g, cols, rows: Math.ceil(g.count / cols) };
  });
  const totalW = dims.reduce((w, d) => w + d.cols, 0) + GATHER_GUTTER * Math.max(0, dims.length - 1);
  // Second pass: slots, packed left→right starting at -totalW/2.
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
