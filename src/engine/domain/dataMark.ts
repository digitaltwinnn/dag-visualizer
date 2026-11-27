// THE DATA BLOCKS REGISTER'S TILE MARK (D6, 2026-11-07 — user: "a 3rd option 'data blocks' which can
// visualize the DED which would inherit the snapshot layout"). The register draws the Snapshots
// chamber as it is, and on each metagraph snapshot tile whose EXACT read says it carried data blocks,
// one small mark standing on the tile's top: its HEIGHT the count of data updates those blocks carry
// (the chamber's own idiom — a bar's width is its bytes, a tile's size its anchors), on a log scale,
// because one network writes a handful per snapshot and another thousands. The number itself is the
// card's and the explorer's (`ChannelSnapRow.dataTxCount`); the mark says THAT a snapshot carried data
// and roughly how much.
//
// THE MARK WAS THE TILE'S OWN SIZE for two weeks (user, 2026-11-08: "the same size as the snapshot
// block") — a second slab standing on the first, a presence mark — and before that a log-scaled bar
// (D6). It is a COLUMN OF BLOCKS now: see `DATA_STACK`.
//
// A SNAPSHOT THAT CARRIED NO DATA BLOCK IS NOT THE REGISTER'S SUBJECT (user, 2026-11-07: "a
// metagraph that anchored but had no datablock is still shown; don't show it"): its tile is not drawn,
// no sheet or thread ties it to its tick, and the explorer does not list it — as the Transaction blocks
// register draws no tile for a snapshot carrying no block. `carriesData` is that rule's one home.
//
// Honesty (rule 10): a tile whose read has not landed, or whose payload the decoder could not read,
// is UNKNOWN — not drawn yet, never a guess; a snapshot whose data blocks hold no update still carried
// data, so it stands at the floor height.

/** A box's proportions against its TILE: its footprint, and the LIFT between the tile's top and the
 *  first box's underside, in tile heights. Six and a half: a tile is a thin slab, so two and a half
 *  of its heights (2026-11-09, "like 2x to 3x current distance") left a cube barely its own height
 *  off the snapshot (user, 2026-11-23: "elevate the data blocks more from the snapshots, they are
 *  too close"). The lift is drawn by `LedgerView`'s `DATA_LIFT`. */
// A BOX IS A BLOCK (2026-11-23): each box is a cube, as a transaction block is, `foot` of its tile's
// footprint wide and as tall as it is wide. While the mark was one box it was the tile's own slab
// (foot 1, a third as tall as wide), and a column of slabs still read as flat.
export const DATA_MARK: Readonly<{ foot: number; lift: number }> = { foot: 0.6, lift: 6.5 };

/** THE MARK IS A COLUMN, ONE BOX PER DATA BLOCK (user, 2026-11-23: the marks "look kinda flat,
 *  sitting right on top of the metagraph snapshots … give it some more vertical presence, like we
 *  did for the DAG transactions"). A snapshot's data blocks stand above its tile as a stack — each
 *  box a cube (`DATA_MARK`), `gap` of a box's height apart — so a snapshot that carried three blocks
 *  is three boxes tall, the way a global snapshot's transaction blocks stand above the floor.
 *  `max` is the tallest column drawn: a snapshot carrying more shows `max` boxes, and its card and
 *  the explorer state the number (a labelled ceiling, rule 10). */
export const DATA_STACK: Readonly<{ max: number; gap: number }> = { max: 8, gap: 0.55 };

/** How many boxes a snapshot's column holds: its data blocks, up to `DATA_STACK.max`; 0 where it
 *  carried none or its read has not landed. */
export function dataStackBoxes(row: { dataBlocks?: number } | null | undefined): number {
  if (!row || row.dataBlocks == null || row.dataBlocks <= 0) return 0;
  return Math.min(DATA_STACK.max, Math.floor(row.dataBlocks));
}

/** What a tile's mark counts: the data updates of a snapshot that carried data blocks, or null where
 *  it carried none or its read has not landed. */
export function dataMarkCount(row: { dataBlocks?: number; dataTxCount?: number } | null | undefined): number | null {
  if (!row || row.dataBlocks == null || row.dataBlocks <= 0) return null;
  return row.dataTxCount ?? 0;
}

/** Did this snapshot carry data blocks, as far as its exact read says? False while the read has not
 *  landed or could not be read — the register's tile, sheet and explorer row all hang on this. */
export function carriesData(row: { dataBlocks?: number; dataTxCount?: number } | null | undefined): boolean {
  return dataMarkCount(row) != null;
}

/** A BOX IS BANDED BY WHO SUBMITTED ITS UPDATES (2026-11-27, the data-submitters feature): Digital
 *  Evidence's organisations stack inside each data block's box, each band's height its share of the
 *  block's attributed updates. `max` is the most bands a box draws: past it the busiest `max − 1`
 *  keep their own band and every other submitter shares one unnamed band on top (a labelled
 *  remainder — the card names them all). */
export const DATA_BANDS: Readonly<{ max: number }> = { max: 4 };

/** A box's bands, busiest first (ties by id), shares summing to 1; `[]` for a block that names no
 *  submitter, which draws as one plain box. Event-time: it allocates. */
export function dataBoxBands(block: { submitters?: readonly { id: string; updates: number }[] }): { id: string | null; share: number }[] {
  const subs = (block.submitters ?? []).filter((s) => s.updates > 0);
  const total = subs.reduce((n, s) => n + s.updates, 0);
  if (total <= 0) return [];
  const ranked = [...subs].sort((a, b) => b.updates - a.updates || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const named = ranked.length <= DATA_BANDS.max ? ranked : ranked.slice(0, DATA_BANDS.max - 1);
  const bands: { id: string | null; share: number }[] = named.map((s) => ({ id: s.id, share: s.updates / total }));
  if (named.length < ranked.length) {
    const rest = ranked.slice(named.length).reduce((n, s) => n + s.updates, 0);
    bands.push({ id: null, share: rest / total });
  }
  return bands;
}
