// THE MEASURE TILES' ROW PLAN — how many tiles each row of the segmented control holds. Pure, so
// the corner and divider rules in `MeasureTiles` read cells by ROW rather than by a fixed column
// count, which a set whose rows are not all one width (seven: 2 · 3 · 2) needs.
//
//   · four sit two by two (a 65px cell cannot hold "Metagraphs" beside its mark);
//   · SEVEN is 2 · 3 · 2 (2026-10-26, History's Global snapshots measure): three columns left one
//     tile alone on a third row, and the two half-width rows give the two SNAPSHOT measures — the
//     set's first two, and its two longest words — room for their whole names;
//   · EIGHT is 2 · 3 · 3 (2026-11-04, History's Transfers): the two snapshot measures keep their
//     half-width row, and the six after them fill two rows of three;
//   · everything else fills rows of three (fewer than three take a column each).
//
// The grid behind it is SIX columns wide, so a row of 2 spans 3 each, of 3 spans 2, of 1 all six.

export function tileRows(n: number): number[] {
  if (n <= 0) return [];
  if (n === 4) return [2, 2];
  if (n === 7) return [2, 3, 2];
  if (n === 8) return [2, 3, 3];
  const rows: number[] = [];
  for (let left = n; left > 0; left -= 3) rows.push(Math.min(3, left));
  return rows;
}

/** A measure set may state its OWN plan (Hypergraph's "All nodes" over its three layers, `[1, 3]`,
 *  2026-11-08): used when it places every tile once in rows the six-column grid divides, else the
 *  count's default. */
export function planFor(n: number, plan?: readonly number[] | null): number[] {
  if (plan && plan.reduce((a, b) => a + b, 0) === n && plan.every((r) => r > 0 && 6 % r === 0)) return [...plan];
  return tileRows(n);
}

/** One cell's place in the plan: its row, whether it starts or ends that row, and the row count. */
export interface TileCell {
  row: number;
  rowSize: number;
  first: boolean;
  last: boolean;
  rows: number;
}

export function tileCells(n: number, own?: readonly number[] | null): TileCell[] {
  const plan = planFor(n, own);
  return plan.flatMap((size, row) =>
    Array.from({ length: size }, (_, k) => ({ row, rowSize: size, first: k === 0, last: k === size - 1, rows: plan.length })),
  );
}
