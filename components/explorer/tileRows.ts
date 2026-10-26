// THE MEASURE TILES' ROW PLAN — how many tiles each row of the segmented control holds. Pure, so
// the corner and divider rules in `MeasureTiles` read cells by ROW rather than by a fixed column
// count, which a set whose rows are not all one width (seven: 2 · 3 · 2) needs.
//
//   · four sit two by two (a 65px cell cannot hold "Metagraphs" beside its mark);
//   · SEVEN is 2 · 3 · 2 (2026-10-26, History's Global snapshots measure): three columns left one
//     tile alone on a third row, and the two half-width rows give the two SNAPSHOT measures — the
//     set's first two, and its two longest words — room for their whole names;
//   · everything else fills rows of three (fewer than three take a column each).
//
// The grid behind it is SIX columns wide, so a row of 2 spans 3 each, of 3 spans 2, of 1 all six.

export function tileRows(n: number): number[] {
  if (n <= 0) return [];
  if (n === 4) return [2, 2];
  if (n === 7) return [2, 3, 2];
  const rows: number[] = [];
  for (let left = n; left > 0; left -= 3) rows.push(Math.min(3, left));
  return rows;
}

/** One cell's place in the plan: its row, whether it starts or ends that row, and the row count. */
export interface TileCell {
  row: number;
  rowSize: number;
  first: boolean;
  last: boolean;
  rows: number;
}

export function tileCells(n: number): TileCell[] {
  const plan = tileRows(n);
  return plan.flatMap((size, row) =>
    Array.from({ length: size }, (_, k) => ({ row, rowSize: size, first: k === 0, last: k === size - 1, rows: plan.length })),
  );
}
